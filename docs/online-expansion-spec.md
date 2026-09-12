# オンライン化機能 仕様・開発手順

## 1. 目的

現在のアプリは、データを端末の localStorage に保存しています。オンライン化後は、Supabaseを共有データベースとして使用し、店舗タブレット、スタッフのスマートフォン・PC、管理者のスマートフォン・PCから同じデータを利用できるようにします。

現行の店舗タブレットによる打刻業務を止めないため、機能を複数フェーズに分けて開発・リリースします。

## 2. 利用者と権限

### 店舗タブレット

店舗に設置した登録済みAndroid端末で、現在のPWAを引き続き使用します。打刻機能に加えて、現在存在する管理画面も残します。

- スタッフコードによるパンチイン
- スタッフコードによるパンチアウト
- 勤務中スタッフの表示
- 既存の管理画面を利用可能
- スマートフォンや未登録端末からは打刻できない

通常のシフト交代は店舗端末へ来る前にスタッフ間で完了させます。交代が確定すると、交代後のスタッフのシフトとして店舗端末へ表示されます。そのため、店舗端末では交代対象を選ぶUIを表示しません。

### スタッフ

Supabase Authでログインします。スタッフは自分のデータだけを扱えます。

- 自分のシフト確認
- シフト希望の提出・取り下げ
- 確定したシフトの確認
- シフトに入れない場合の交代申請と受諾
- 確定済み給与の確認
- パンチイン・パンチアウトは不可
- 他スタッフの時給、給与、個人情報は閲覧不可

### 管理者

Supabase Authで管理者としてログインします。

- スタッフ管理
- シフト希望の確認
- シフトの作成・編集・削除
- シフトの確定
- 交代申請の状況確認・必要時の手動調整
- 打刻の調整
- 給与計算
- 給与の確定・公開
- 登録済み店舗端末の管理

画面上でボタンを隠すだけではなく、SupabaseのRow Level Security（RLS）でも同じ権限を強制します。

## 3. システム構成

~~~text
GitHub Pages
  └─ React / ViteのWebアプリ
       ├─ 店舗タブレット用の打刻モード
       ├─ スタッフ用ポータル
       └─ 管理者用ポータル
              │
              └─ Supabase Auth / API
                    └─ PostgreSQL
~~~

アプリはGitHub Pagesで配信し、Supabaseは認証、データベース、アクセス制御を担当します。フロントエンドにはSupabaseの公開キーだけを設定し、service_role キーは絶対に含めません。

## 4. データモデル案

### profiles

Supabase Authのユーザーとスタッフ情報を関連付けます。

~~~text
id                 UUID / auth.users.id
role               staff | manager
staff_id           スタッフID（管理者はnull可）
active             有効・無効
created_at
~~~

### staff

~~~text
id
name
hourly_wage
staff_code_hash
active
created_at
updated_at
~~~

スタッフコードは可能であれば平文ではなくハッシュで保存します。店舗端末の打刻では、認証済み端末だけが打刻用処理を呼び出せるようにします。

### shifts

~~~text
id
work_date
staff_id
start_minute
end_minute
note
status             draft | published
created_at
updated_at
~~~

### shift_requests

~~~text
id
staff_id
work_date
requested_start
requested_end
note
status             submitted | approved | rejected | withdrawn
manager_note
created_at
updated_at
~~~

### shift_swaps

~~~text
id
shift_id
from_staff_id
to_staff_id
status             open | accepted | expired | cancelled
note
accepted_by
accepted_at
created_at
updated_at
~~~

スタッフの交代申請は管理者の承認を必要としません。申請を open にした後、対象スタッフへ通知し、最初に受諾したスタッフを accepted として自動確定します。交代後のスタッフをシフトの実効担当者として扱い、元の担当者、交代先、申請日時、受諾日時は履歴として残します。

同時に複数スタッフが受諾した場合は、データベースのトランザクションで先に確定できた1件だけを採用します。後から押したスタッフには「すでに別のスタッフが受諾しました」と表示します。

### 交代申請の流れ

1. スタッフが自分のシフトに入れないことを申請する
2. シフトを open 状態にする
3. 申請者本人を除く、勤務可能なスタッフへ一斉メールを送る
4. 申請者は、誰にも受諾されていない間は自分で申請を取り下げられる
5. メール本文の「代わる」ボタンから申請ページを開く
6. 受諾するスタッフがログインして受諾を確定する
7. 最初に確定したスタッフを交代担当として登録する
8. 他のスタッフが同じリンクを開いた場合は、受付終了を表示する
9. シフト開始時刻まで誰も受諾しなければ expired とし、元のスタッフのシフトを維持する

メールのボタンは、単にデータを変更するURLにはしません。短時間だけ有効な申請IDを含むページを開き、スタッフ本人のログインを確認してから受諾処理を実行します。これにより、メール転送だけで第三者が勝手に交代できることを防ぎます。

申請者が取り下げた場合は status を cancelled に変更し、メール内の受諾リンクも無効にします。accepted 後の取り消しや再募集は、別の交代申請として扱います。

メール送信はブラウザから直接行わず、Supabase Edge Functionなどのサーバー側処理から送信します。送信にはSMTPサービスが必要です。対象者が多い場合でも、申請者やすでに同時間帯のシフトがあるスタッフは送信対象から除外します。

### punches

~~~text
id
staff_id
shift_id
scheduled_staff_id
clock_in
clock_out
payroll_from_actual_start
adjusted_by
adjusted_at
created_at
updated_at
~~~

打刻時刻は秒以下を切り捨て、分単位で保存します。通常の早着は予定シフト開始から給与計算し、管理者が payroll_from_actual_start を有効にした場合だけ実打刻開始から計算します。

### payrolls

~~~text
id
staff_id
period_start
period_end
total_minutes
total_pay
status             calculated | finalized | published
finalized_by
finalized_at
~~~

スタッフ画面には published の給与だけを表示します。

### registered_devices

店舗タブレットを登録します。

~~~text
id
device_name
device_token_hash
device_type         punch_terminal
active
registered_by
last_seen_at
~~~

ブラウザだけでは端末識別に限界があるため、端末登録情報は補助的な制御です。より厳密な端末限定が必要になった場合は、Androidのキオスク管理や専用アプリを検討します。

## 5. 認証とアクセス制御

### 認証

- 管理者とスタッフはSupabase Authでログイン
- 新しいスタッフのAuthユーザーは管理者のスタッフ登録処理から作成
- スタッフがSupabase管理画面を操作する必要はない
- 店舗タブレットは登録済み端末として打刻用の認証情報を保持

### RLSの基本方針

~~~text
staff       自分のプロフィールのみ閲覧、管理者は全件
shifts      スタッフは公開済みの自分のシフト、管理者は全件
requests    スタッフは自分の申請、管理者は全件
punches     店舗端末と管理者のみ読み書き
payrolls    スタッフは公開済みの自分の給与、管理者は全件
devices     管理者のみ
~~~

スタッフ用クライアントから打刻APIを直接呼び出しても拒否されるようにします。

## 6. 開発フェーズとブランチ

### 現在の進捗（2026-09-11）

現在の作業ブランチは `feature/supabase-manager-portal` です。以下のコミットをGitHubの店舗リポジトリへプッシュ済みで、Pull Requestを作成しています。

- `d9c0fbd` Supabase Authの管理者ログイン基盤
- `25ba2a0` オンライン管理画面の週次シフト表示
- `9202852` Data API用のauthenticated権限
- `b27525b` オンラインスタッフ・シフト管理
- `08253d7` GitHub PagesのActionsデプロイとSupabase環境変数
- `a0d2bd6` オンライン勤務実績の修正と週次給与計算
- `b1487a8` 本番Pages内のテスト用Supabase切り替え
- `f97c797` シフト状態を下書き・公開へ整理
- `5cea8d3` スタッフコードの管理者向け表示・変更
- `566864c` オンライン管理者の打刻画面非表示
- `9108e26` スタッフ向けオンラインシフトポータル

#### 完了

- Supabase Freeプロジェクト作成
- 初期テーブル、RLS、交代受付RPCの作成
- `profiles`へ管理者アカウントを登録
- Supabase Authによる管理者ログイン
- GitHub PagesのActionsビルド・デプロイ
- GitHub Actionsの `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 設定
- GitHub Actionsのテスト用Supabase Variables設定
- `?mode=test`によるテスト用Supabase接続の切り替え
- Supabase上のスタッフ一覧表示・追加・編集
- 管理者専用テーブルによるスタッフコード表示・変更
- オンライン管理者ログイン時の店舗端末用打刻画面の非表示
- スタッフAuthログイン、自分の公開シフト・公開給与の確認
- Supabase上の週次シフト表示・追加・編集
- Supabase上の勤務実績表示・追加・修正
- 予定開始時刻を考慮した週次給与集計の表示
- `payrolls`テーブルへの給与保存・確定・公開状態の更新
- スタッフ・期間ごとの給与重複保存を防ぐ一意制約
- 既存の店舗端末用localStorage管理画面の維持

#### 一部実装

- 管理者オンライン画面は現在、スタッフ、シフト、勤務実績、給与集計をSupabaseから扱えます。給与は週単位で `calculated`、`finalized`、`published` の順に保存できます。
- オンラインで追加したスタッフ・シフト・勤務実績はSupabaseに保存されますが、店舗タブレットのlocalStorageデータにはまだ反映されません。
- Supabase Authの管理者・スタッフログインを実装済みです。スタッフは自分の公開済みシフトと公開済み給与を確認できます。
- テストモードは本番と同じPages URLのクエリで切り替えます。通常URLは本番DB、`?mode=test`はテストDBを使用し、Authセッションも分離します。
- シフトの状態は下書きと公開の2種類に整理しました。締切状態は使用しません。

#### 未着手

- 店舗タブレットのSupabase接続と共有打刻
- 登録済み端末の初期登録、端末トークン検証、通信エラー時の再送
- シフト希望の提出・確認
- メールによる交代募集と先着1名の自動確定
- localStorageからSupabaseへの本番データ移行

現時点では、オンライン管理画面と店舗タブレットを同時に本番運用しません。データソースがSupabaseとlocalStorageに分かれるため、店舗打刻のSupabase連携が完了してから本番切り替えを行います。

### テストモードの利用

本番PagesのURLに `?mode=test` を付けると、テスト用Supabaseへ接続します。

~~~text
本番: https://sakura-mart-sq.github.io/sakura-timecard/
テスト: https://sakura-mart-sq.github.io/sakura-timecard/?mode=test
~~~

テストモードはURLを知っている人なら開けるため、URL自体を認証手段にはしません。テスト用プロジェクトには本番データを入れず、テスト用Authユーザーだけを登録します。

### Phase 0: 基盤準備

ブランチ例：feature/supabase-foundation

- [x] Supabaseプロジェクト作成
- [x] DBテーブルとマイグレーション作成
- [x] Auth設定
- [x] RLSポリシー作成
- [x] 開発用・本番用環境変数の分離
- [x] Data API権限の明示設定
- [x] 現行localStorageバックアップの移行設計

### Phase 1: マネージャー向けオンラインポータル

現在の作業ブランチ：feature/supabase-manager-portal

- [x] 管理者ログイン
- [x] スタッフ管理（追加・編集）
- [ ] シフト希望の確認
- [x] シフト作成・編集
- [x] 勤務実績の確認・追加・修正
- [x] 週次給与計算の表示
- [x] `payrolls`テーブルへの給与確定・保存
- [x] 確定済み給与の公開

給与保存機能を使用する前に、Supabase SQL Editorで次の追加マイグレーションを一度実行します。

~~~text
supabase/migrations/202609110003_payroll_period_unique.sql
~~~

既存プロジェクトで旧「締切」状態を使用していた場合は、次のSQLを一度実行して公開へ戻します。

~~~text
supabase/migrations/202609110004_remove_closed_shift_status.sql
~~~

スタッフコード表示を有効にするため、次のSQLを本番・テスト両方のDBで一度実行します。既存スタッフは、コード表示が「未設定」の場合にオンライン管理画面からコードを再設定します。

~~~text
supabase/migrations/202609110005_staff_codes.sql
~~~

この段階では、店舗タブレットがまだlocalStorageを使っている場合、オンライン管理画面と店舗端末のデータが分離します。実運用で混在させず、開発用データまたは移行後のテスト環境で確認します。

### Phase 2: 店舗タブレットのSupabase連携

ブランチ例：feature/supabase-punch-terminal

- 登録済み端末の初期登録
- シフトをSupabaseから取得
- 打刻をSupabaseへ保存
- 交代処理をSupabaseで管理
- 店舗端末の既存管理画面を維持
- ログインしたスタッフ自身のシフトだけを表示
- 通常時は「シフトインする」ボタンだけを表示
- 店舗端末で交代対象シフトを選択させない
- 通信エラー時の表示と再送処理

このフェーズが完了してから、Supabaseを本番の唯一のデータソースにします。

### Phase 3: スタッフ向けポータル

ブランチ例：feature/staff-portal

- [x] スタッフログイン
- [x] 公開済みシフト確認
- シフト希望提出
- 交代申請の作成
- 他スタッフへの一斉メール通知
- メールからの交代受諾
- 先着1名の自動確定
- [x] 確定済み給与確認
- スタッフ画面から打刻処理を呼び出せないことを確認

### Phase 4: 本番切り替え

ブランチ例：release/online-operation

- 本番データを移行
- 管理者アカウント確認
- 店舗タブレット登録
- スタッフアカウント発行
- 給与・打刻のテスト
- Android端末を新PWA URLへ切り替え
- 旧localStorage運用を停止

## 7. localStorageからの移行手順

1. 現行アプリで完全バックアップを保存
2. Supabaseのテーブルを作成
3. スタッフを登録し、旧スタッフIDとの対応表を作成
4. シフトと打刻を対応する新IDへ変換
5. Supabaseへインポート
6. 管理画面で件数と給与を照合
7. 店舗タブレットをテスト用モードで接続
8. 新規打刻・クロックアウトを確認
9. 問題がなければ本番モードへ切り替え

移行確認が終わるまで、旧localStorageのバックアップと旧URLを保持します。

## 8. リリース手順

各フェーズで、次の手順を守ります。

~~~bash
git switch main
git pull origin main
git switch -c feature/branch-name
npm test
npm run build:pages
~~~

確認後、Pull Requestを作成し、mainへマージします。GitHub Pagesへのデプロイ完了を確認してから端末を更新します。

本番切り替えでは、以下を確認します。

- Supabase URLと公開キーが本番用
- service_role キーがビルド成果物に含まれていない
- RLSが有効
- スタッフが他人のデータを取得できない
- スタッフ端末から打刻APIが拒否される
- 店舗タブレットからのみ打刻できる
- 管理者の打刻調整が給与計算へ反映される
- バックアップを復元できる

## 9. Supabase Freeプラン運用

小規模店舗ではFreeプランから開始できます。通常のスタッフ数と打刻件数であれば、当面は十分な想定です。

注意点：

- 一定期間アクセスが少ないFreeプロジェクトは一時停止される
- Supabase Dashboardから Resume project で再開する
- Freeプランでは自動バックアップに依存しない
- アプリの完全バックアップを定期的に保存する
- 長期運用で停止を避ける必要があれば有料プランを検討する

## 10. 受け入れ条件

### スタッフ

- スマートフォンからログインできる
- 自分のシフトだけ確認できる
- シフト希望を提出できる
- 交代を申請できる
- 自分の交代申請を、受諾前に取り下げられる
- 他スタッフの交代申請をメールから受諾できる
- 確定済み給与だけ確認できる
- スマートフォンから打刻できない

### 管理者

- スマートフォンまたはPCからログインできる
- 全スタッフのシフトと希望を確認できる
- シフトを作成・編集できる
- 交代申請の状態を確認できる
- 打刻を調整できる
- 給与を計算・確定・公開できる
- スタッフと端末を管理できる

### 店舗端末

- 登録済みAndroid端末で打刻できる
- 5桁コードでログインしたスタッフ本人のシフトを表示できる
- 通常時は自分のシフトの「シフトインする」ボタンだけ表示される
- イレギュラー勤務は管理者が後から打刻修正できる
- 未登録端末やスタッフのスマートフォンから打刻できない
- 通信エラー時に状態を明確に表示できる
