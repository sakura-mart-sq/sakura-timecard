# オンライン化機能 仕様・開発手順

最終更新: 2026-09-15
アプリバージョン: 1.2.46

この文書は、現在のコードに合わせた仕様書です。日常の操作手順は [current-operation-guide.md](current-operation-guide.md) を参照してください。

## 1. 目的

GitHub Pagesで配信するWebアプリから、SupabaseのAuth、PostgreSQL、RLSを利用します。

- 店舗端末: Supabase接続の打刻専用画面
- スタッフ: スマートフォン・PCからシフト、希望、交代、公開給与を確認
- 管理者: スマートフォン・PCからシフト、スタッフ、勤怠、給与を管理
- 旧localStorage版: 移行期間のため維持

オンライン版と旧localStorage版はデータを共有しません。

## 2. URLと環境

| 用途 | URLクエリ | DB |
|---|---|---|
| 本番オンライン | なし | 本番Supabase |
| テストオンライン | `?mode=test` | テストSupabase |
| 本番端末 | `?terminal=1` | 本番Supabase |
| テスト端末 | `?mode=test&terminal=1` | テストSupabase |
| 旧localStorage | `?local=1` | 使用端末のlocalStorage |

テスト環境は本番と同じPagesにホストできますが、URLを知っている人は開けます。URLは認証の代わりになりません。

GitHub ActionsのVariables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_TEST_URL
VITE_SUPABASE_TEST_ANON_KEY
```

フロントエンドにservice role keyを入れてはいけません。

## 3. 認証と権限

### 管理者・スタッフ

通常URLでSupabase Authを使用します。

- 管理者: `profiles.role = 'manager'` かつ `active = true`
- スタッフ: `profiles.role = 'staff'`、`staff_id`が対象スタッフ、`active = true`
- Authユーザーとスタッフ情報の紐付けは、スタッフ本人のSign Upまたはログイン時に `claim_staff_profile()` が行う
- スタッフのメールアドレスは、管理者が先にstaffテーブルへ登録する

現在、管理者がスタッフ情報を保存しただけでは招待メールは送信しません。スタッフ本人がSign Upを実行するとSupabase Authから確認メールが送信されます。

認証モーダルは開くたびにLog inで開始します。初回アカウント作成時だけ、下部のSign Upリンクで切り替えます。

新しい管理者は本人が通常URLでSign Upしてメール確認を完了した後、開発担当者が`profiles`へ`role = 'manager'`、`staff_id = null`、`active = true`を登録します。管理者はstaffテーブルへの登録や5桁Staff Codeを必要としません。具体的なSQLと確認手順は[current-operation-guide.md](current-operation-guide.md)の「管理者アカウントの追加」を参照します。

ログイン中の管理者は`auth.updateUser()`で本人のパスワードを変更できます。将来Forgot passwordを追加する場合はSupabase Auth標準の`resetPasswordForEmail()`を使用し、Edge Functionは必要ありません。開発担当者による強制変更は、service role keyを保持する安全なサーバー側処理から`auth.admin.updateUserById()`を使用します。

### 店舗端末

`?terminal=1` の端末モードではSupabase Authを使いません。5桁Staff CodeをSupabase RPCへ送信し、本日の公開済みシフトと打刻を取得します。

- 端末用Authユーザーは不要
- `profiles.role = 'terminal'` の登録も不要
- 通常URLのスタッフログインでは打刻操作を表示しない
- ブラウザのURLパラメータだけで端末を厳密に識別する機能ではない

店舗端末用マニフェストは通常版と異なる`id`と`start_url`を持ちます。本番端末は`?terminal=1`、テスト端末は`?mode=test&terminal=1`で起動します。旧マニフェストでインストール済みの場合は、Pages更新後にアンインストールして店舗端末用URLから再インストールします。

## 4. 現在実装されている機能

### 4.1 スタッフ

- 自分の公開済みシフトの週次確認
- シフト希望の提出、取り下げ
- 自分のシフトの交代申請、取り下げ
- 他スタッフの公開中交代申請の画面上での受諾
- 公開済み給与の確認
- スマートフォン・PCからの打刻不可

スタッフのシフト希望一覧は、現在の週の月曜日以降の申請だけを表示します。

スタッフ画面は英語です。入力フォームも英語です。

### 4.2 シフト交代

現在の処理は次の通りです。

1. スタッフAが自分のシフトでRequest swap
2. `shift_swaps.status = 'open'` で登録
3. スタッフBがOpen Shift SwapsでAccept
4. `accept_shift_swap` RPCがトランザクションで処理
5. 最初に受諾したスタッフだけが確定
6. 対象シフトのstaff_idをBへ変更
7. 店舗端末でBがStaff Codeを入力するとBのシフトとして表示

交代申請のメール通知は未実装です。現在はスタッフがオンライン画面を開いて申請を確認します。管理者の承認は不要です。

### 4.3 管理者

管理者画面は日本語で、次のタブを持ちます。

```text
シフト / 勤務状況 / スタッフ / 給与計算 / 設定
```

#### シフト

- 前後の矢印で週を切り替え
- 月曜日から日曜日を一覧表示
- 日ごとに1行の8:00〜20:00タイムラインでシフトを表示
- シフト追加、変更
- 下書き、公開の状態管理
- スタッフのシフト希望の承認・却下
- 交代申請の状態確認

シフト希望を承認すると、希望日・希望時間・スタッフを元に公開シフトを自動作成します。同じスタッフ・日付・開始・終了のシフトがすでにある場合は重複作成しません。

交代申請一覧は通常、現在の週の月曜日以降を表示します。過去分を含める場合は`Show all`を押します。一覧には元スタッフと確定済みの交代スタッフを表示し、未受諾の場合は交代スタッフを「未確定」と表示します。

締切ステータスは使用しません。スタッフと端末に表示されるのは公開シフトだけです。

#### 勤務状況

- 前後の矢印で対象週を切り替え
- Supabase上の打刻表示
- 打刻の追加・修正
- 開始・終了時刻は1分単位
- 終了時刻がない記録は勤務中
- 予定より早い打刻は、通常は予定シフト開始から給与計算
- 管理者が早出フラグを有効にした記録だけ実打刻開始から給与計算

#### スタッフ

- 名前、時給、5桁Staff Code、メールアドレスの追加・編集
- Staff Codeの表示
- 論理削除（active=false）と再有効化
- 過去のシフト、打刻、給与は論理削除後も保持

#### 給与計算

- 任意の開始日・終了日
- 全スタッフまたは個別スタッフ
- 打刻実績から計算
- 金額は小数第1位で四捨五入
- 計算結果を画面表示
- CSV保存（Googleスプレッドシートで開ける形式）
- A4縦PDF出力

スタッフ画面に表示されるのは `payrolls.status = 'published'` の給与だけです。

現在のオンライン管理画面では、給与計算結果の画面表示・CSV・PDF出力を提供しています。給与をスタッフ画面へ公開するためのDBデータは、既存の給与保存処理とSupabaseの `payrolls` テーブルを使用します。

#### 設定

- 旧localStorage版JSONバックアップの復元
- スタッフ、スタッフコード、シフト、打刻の取り込み
- 店舗名、管理者パスコードの取り込み・保存
- シフト希望、交代申請がバックアップに存在する場合の取り込み
- 旧バックアップにそれらがなくても処理継続
- ログイン中の管理者本人によるSupabase Authパスワード変更

既存レコードは自動削除しません。

### 4.4 店舗端末

- 5桁Staff Codeを入力
- 本日の本人の公開シフトを表示
- `Sign In`でパンチイン
- 勤務中は`Sign Out`でパンチアウト
- シフトがないスタッフは打刻不可
- 交代相手を端末で選択しない
- 交代はオンライン画面で事前確定

## 5. データモデル

主要テーブル:

```text
profiles
staff
staff_codes
shifts
shift_requests
shift_swaps
punches
payrolls
registered_devices
app_settings
```

### profiles

```text
id          auth.users.id
role        staff | manager | terminal
staff_id    staff.id（管理者はnull）
active
```

### staff

```text
id
name
hourly_wage
email
active
```

5桁コードは`staff_codes`に保存します。管理者画面からのみ登録・変更します。

### shifts

```text
id
work_date
staff_id
start_minute
end_minute
note
status       draft | published
```

### shift_requests

```text
id
staff_id
work_date
requested_start
requested_end
note
status       submitted | approved | rejected | withdrawn
manager_note
```

### shift_swaps

```text
id
shift_id
from_staff_id
accepted_by
status       open | accepted | expired | cancelled
note
accepted_at
```

### punches

```text
id
staff_id
shift_id
scheduled_staff_id
clock_in
clock_out
payroll_from_actual_start
adjusted_by
adjusted_at
```

### payrolls

```text
id
staff_id
period_start
period_end
total_minutes
total_pay
status       calculated | finalized | published
```

## 6. RLSとアクセス範囲

UIだけでなくSupabase RLSで制御します。

| データ | スタッフ | 管理者 | 端末 |
|---|---|---|---|
| 自分のスタッフ情報 | 閲覧範囲限定 | 全件 | RPC結果のみ |
| 公開済み自分のシフト | 閲覧 | 全件 | 本日分RPC結果 |
| シフト希望 | 自分の申請 | 全件・承認却下 | なし |
| 交代申請 | 自分・公開申請 | 全件 | なし |
| 打刻 | なし | 追加・修正 | 本人の入退勤RPC |
| 給与 | 公開済み自分のみ | 計算・管理 | なし |

## 7. Supabaseセットアップ

本番・テストの両方で、次のSQLを番号順に一度ずつ実行します。

```text
supabase/migrations/202609110001_initial_online_schema.sql
supabase/migrations/202609110002_data_api_grants.sql
supabase/migrations/202609110003_payroll_period_unique.sql
supabase/migrations/202609110004_remove_closed_shift_status.sql
supabase/migrations/202609110005_staff_codes.sql
supabase/migrations/202609120001_shift_swap_access.sql
supabase/migrations/202609140001_self_service_staff_registration.sql
supabase/migrations/202609150001_terminal_access.sql
supabase/migrations/202609150002_public_terminal_rpc.sql
supabase/migrations/202609150003_backup_settings.sql
```

重要な追加SQL:

| SQL | 機能 |
|---|---|
| `202609120001_shift_swap_access.sql` | 交代受諾と先着確定 |
| `202609150002_public_terminal_rpc.sql` | Authなし店舗端末打刻 |
| `202609150003_backup_settings.sql` | `app_settings`、店舗名、設定復元 |

`app_settings`が未作成でも、現在のアプリは設定以外の管理画面を表示します。ただし店舗名や設定の保存には最後のSQLが必要です。

## 8. データ移行

旧localStorage版の「バックアップ保存」でJSONを作成し、オンライン管理画面の「バックアップから復元」で取り込みます。

取り込み対象:

- スタッフ
- スタッフコード
- シフト
- 打刻
- 店舗名
- 管理者パスコード
- シフト希望（バックアップにある場合）
- 交代申請（バックアップにある場合）

復元時は既存の業務データを削除し、バックアップ内容へ置き換えます。Authユーザー、管理者プロフィール、DB構造は削除しません。実行前に現在のデータを別途バックアップし、最初はテストDBで件数と給与を確認してから本番DBで実行します。

## 9. 現在未実装の機能

- 交代申請時の一斉メール通知
- メール本文のボタンから交代を受諾
- 管理者登録時のスタッフAuth招待メール
- localStorageとSupabaseの自動同期
- ブラウザ以外の厳密な店舗端末認証
- 通信断時の端末打刻キューと再送

メール通知を追加する場合は、Edge FunctionではなくGASと個人Gmailを使う方針で別フェーズとして実装します。

## 10. 開発・リリース手順

```bash
git switch main
git pull origin main
npm ci
npm test -- --run
npm run build
git diff --check
```

機能修正時は、画面のフッターに表示する`APP_VERSION`を更新し、テストとビルドを実行します。コミット後、GitHub ActionsのPagesデプロイ完了を確認します。

本番へ反映する前に、次をテストDBで確認します。

1. 管理者ログイン
2. スタッフ追加
3. スタッフSign Upと確認メール
4. スタッフログイン
5. 公開シフト確認
6. シフト希望の提出・承認
7. 交代申請・受諾
8. `?mode=test&terminal=1`でStaff Code打刻
9. 打刻修正と給与計算
10. CSV・PDF出力

確認後に本番URLで同じ手順を実行します。本番URLの操作は本番データを変更します。

## 11. 検証状況

2026-09-15時点で、ローカル自動テスト24件と本番ビルドが成功しています。Supabaseの実データを使う認証、RLS、メール、Pages上の操作は、本番・テスト各プロジェクトのSQL適用状態と設定に依存します。

したがって、ローカルテスト成功だけをもってSupabase本番の全操作が確認済みとは扱いません。
