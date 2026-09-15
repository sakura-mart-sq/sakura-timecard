# 開発引き継ぎメモ

最終更新: 2026-09-14

## 現在の状態

オンライン化機能は、Supabaseを使った管理者ポータルとスタッフポータルの基盤まで実装済みです。店舗タブレットの打刻はまだlocalStorage版で、Supabaseとは接続されていません。

現在のブランチ:

```text
main
```

最新コミット:

```text
シフト希望機能を実装（テストDB確認待ち）
```

このブランチは店舗GitHubリポジトリへプッシュ済みです。作業再開時は、GitHub上の既存Pull Requestが最新コミットを含んでいるか確認してください。

リモート:

```text
git@github-sakura:sakura-mart-sq/sakura-timecard.git
```

## 動作確認URL

本番DBを使うURL:

```text
https://sakura-mart-sq.github.io/sakura-timecard/
```

テストDBを使うURL:

```text
https://sakura-mart-sq.github.io/sakura-timecard/?mode=test
```

テストURLは本番データを使いません。ただし、URLを知っている人は開けるため、URL自体を認証手段にしないでください。

## 実装済み機能

### 管理者

- Supabase Authログイン
- 管理者プロフィールによる権限確認
- Supabase上のスタッフ追加・編集
- 管理者によるスタッフ情報とログイン用メールアドレスの登録
- スタッフ本人による初回Authアカウント作成とメールアドレス自動紐付け
- スタッフのシフト希望提出・取り下げ、管理者の承認・却下
- 5桁スタッフコードの管理者向け表示・変更
- 週次シフトの表示、追加、編集
- 下書き・公開ステータス
- 勤務実績の表示、追加、修正
- 早出フラグを考慮した週次給与計算
- 給与の保存、確定、公開

### スタッフ

- Supabase Authログイン
- 自分の公開済みシフト確認
- 自分の公開済み給与確認
- スマートフォン・PCから打刻画面を表示しない

### 店舗タブレット

- 既存localStorage版を維持
- 5桁コードによる打刻
- 店舗端末用の既存管理画面

## まだ未実装の主要機能

優先順位順です。

1. シフト交代申請のメール通知、先着1名の自動確定
2. 店舗タブレットのSupabase接続
3. 登録端末の検証、オフライン・通信エラー対応
4. localStorageからSupabaseへの本番データ移行

## 次に実装する機能

### シフト交代申請

次は、スタッフが公開済みシフトの交代を申請し、他スタッフが受諾できる機能を実装します。先着1名の確定処理は既存の`accept_shift_swap` RPCを利用し、メール通知はEdge Functionで追加します。

スタッフAuth招待のEdge Functionは現在の画面から呼び出していません。スタッフ登録は、管理者がメールアドレスを保存し、スタッフ本人がログイン画面の「初回アカウント作成」を使う方式です。シフト交代のRLSとRPC更新は`supabase/migrations/202609120001_shift_swap_access.sql`です。

## Supabaseマイグレーション

`supabase/migrations/`のSQLは番号順に実行します。

```text
202609110001_initial_online_schema.sql
202609110002_data_api_grants.sql
202609110003_payroll_period_unique.sql
202609110004_remove_closed_shift_status.sql
202609110005_staff_codes.sql
202609120001_shift_swap_access.sql
202609140001_self_service_staff_registration.sql
202609150001_terminal_access.sql
202609150002_public_terminal_rpc.sql
```

既存の本番・テストプロジェクトでは、追加ファイルを実行済みかSupabase Dashboardで確認します。特に`003`から`005`、`202609140001`、`202609150001`は既存プロジェクト作成後に追加されたため、未実行なら対象DBで実行してください。

## 店舗端末のオンライン化

店舗端末はSupabase Authを使いません。`202609150002_public_terminal_rpc.sql`を実行後、オンライン版PWAのURLに`?terminal=1`を付けて店舗端末で開きます（テストDBの場合は`?mode=test&terminal=1`）。端末ではスタッフコードだけを入力し、SupabaseのRPC経由で本日の公開シフトと打刻を取得・保存します。端末用Authユーザー、`profiles.role = 'terminal'`の登録は不要です。

通常URLはスタッフ／管理者のログイン画面です。既存の個人GitHub Pages版PWAはlocalStorage版のままです。

管理者のオンライン画面には「旧バックアップ移行」が追加されています。旧システムのJSONバックアップを選択すると、スタッフ、スタッフコード、シフト、打刻をSupabaseへ取り込みます。既存レコードは削除しないため、初回は空のテストDBで件数を確認してから本番DBで実行してください。

## Authユーザーの紐付け

スタッフ本人が初回アカウント作成または初回ログインすると、`claim_staff_profile()`が登録済みメールアドレスを照合して自動紐付けします。手動SQLは通常不要です。

```sql
insert into public.profiles (id, role, staff_id, active)
values (
  'AuthユーザーのUser UID',
  'staff',
  'public.staffのid',
  true
)
on conflict (id) do update set
  role = 'staff',
  staff_id = excluded.staff_id,
  active = true;
```

本番SupabaseとテストSupabaseのAuthユーザーは別管理です。同じメールアドレスを使うことはできますが、各プロジェクトで別ユーザーになります。

## GitHub Actions設定

店舗リポジトリの以下に設定します。

```text
Settings
→ Secrets and variables
→ Actions
→ Variables
```

本番:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

テスト:

```text
VITE_SUPABASE_TEST_URL
VITE_SUPABASE_TEST_ANON_KEY
```

いずれもPublishable/Anonキーを使用します。`service_role`キーは登録しません。

## ローカル開発

```bash
git fetch origin
git switch feature/supabase-manager-portal
git pull --ff-only
npm ci
npm test -- --run
npm run dev
```

ローカルでSupabaseに接続する場合は、`.env.example`を`.env.local`にコピーして値を設定します。`.env.local`は`.gitignore`で除外されています。

```env
VITE_SUPABASE_URL=https://本番プロジェクト.supabase.co
VITE_SUPABASE_ANON_KEY=本番のPublishable Key
VITE_SUPABASE_TEST_URL=https://テストプロジェクト.supabase.co
VITE_SUPABASE_TEST_ANON_KEY=テストのPublishable Key
```

ローカルテスト用URL:

```text
http://localhost:5173/?mode=test
```

## 検証コマンド

```bash
npm test -- --run
npm run build:pages
git diff --check
```

現在、テストは21件です。機能追加時は、実装だけでなくこの引き継ぎ資料と`docs/online-expansion-spec.md`の進捗も更新してからコミットします。

## 注意事項

- オンライン管理画面のデータと店舗タブレットlocalStorageのデータはまだ別です。
- オンラインで作成したシフトは、Supabase連携前の店舗タブレットには表示されません。
- 本番Pagesでテスト操作をしないでください。`?mode=test`を使用します。
- PWAの古い表示が残る場合は、Actions完了後にPWAを終了して再起動し、フッターのバージョンを確認します。
- コミット時は、`docs/online-expansion-spec.md`の進捗も必ず更新します。
