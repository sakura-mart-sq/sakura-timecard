# 複数GitHubアカウントの使い分け

個人用GitHubアカウントを標準設定にし、店舗用リポジトリだけ店舗アカウントを使う手順です。macOSとLinuxを想定しています。

## 設定方針

```text
通常のリポジトリ          個人アカウント
店舗用リポジトリ          店舗アカウント
globalのGit設定           個人用
店舗リポジトリのlocal設定  店舗用
SSHキー                   アカウントごとに別
```

`user.name` と `user.email` はコミットに記録される作成者情報です。GitHubへのpush先は、SSHキーとremote URLで決まります。両方を設定してください。

## SSHキーを作成する

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_personal
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_store
```

秘密鍵（`.pub` が付かないファイル）は他人に渡したり、リポジトリへ追加したりしないでください。

## GitHubへ公開鍵を登録する

```bash
cat ~/.ssh/id_ed25519_personal.pub
cat ~/.ssh/id_ed25519_store.pub
```

表示された内容を、それぞれ対応するGitHubアカウントの `Settings` → `SSH and GPG keys` → `New SSH key` へ登録します。

## SSH aliasを設定する

`~/.ssh/config` に以下を追加します。

```sshconfig
Host github-personal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal
  IdentitiesOnly yes

Host github-store
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_store
  IdentitiesOnly yes
```

接続確認：

```bash
ssh -T git@github-personal
ssh -T git@github-store
```

それぞれ想定したGitHubユーザー名が表示されれば成功です。

## 個人アカウントをglobalに設定する

```bash
git config --global user.name "個人名"
git config --global user.email "個人用メールアドレス"
```

## 店舗リポジトリだけlocal設定にする

店舗リポジトリのフォルダで実行します。

```bash
cd /path/to/sakura-timecard
git config user.name "店舗アカウント名"
git config user.email "店舗用メールアドレス"
git remote set-url origin git@github-store:店舗アカウント名/sakura-timecard.git
```

これらはこのリポジトリの `.git/config` にだけ保存されます。他のリポジトリの設定は変わりません。

## 設定を確認する

```bash
git remote -v
git config user.name
git config user.email
git config --local --list
```

店舗リポジトリでは、remote URLが `git@github-store:店舗アカウント名/sakura-timecard.git`、名前とメールアドレスが店舗用になっていれば正しい状態です。

## 注意点

- `user.name` と `user.email` だけを変えても、push先のGitHubアカウントは変わりません。
- 店舗リポジトリのremoteが `https://github.com/...` のままだと、SSH aliasは使われません。
- アカウントを切り替えた後は、push前に `git remote -v` を確認します。
- GitHubアカウントには2段階認証を設定します。

## push前の最終確認

```bash
git status
git remote -v
git config user.name
git config user.email
git push origin main
```
