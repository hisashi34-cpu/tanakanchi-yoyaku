# たなかんち2 予約システム

公式LINE + GAS + Google スプレッドシート で動く、小規模飲食店向けの予約システム。

## 構成

```
[お客さんLINE]
   ↓ リッチメニュー / 「予約」発言
[LIFF（liff/）]
   ↓ POST (idToken付き)
[GAS Web App（gas/）]
   ├─ スプレッドシート（予約台帳・顧客・席マスタ・例外日・設定）
   └─ LINE Messaging API（確定通知・前日リマインド・店主通知）
```

## ディレクトリ

```
tanakanchi-yoyaku/
  spreadsheet-template.md   # シート構成のテンプレ
  gas/                      # Google Apps Script（コピペでデプロイ）
    appsscript.json
    Config.gs               # プロパティ取得・セットアップ
    Utils.gs                # 営業時間・日時ヘルパ
    Reservation.gs          # 予約のコア（空き判定・登録・キャンセル）
    Code.gs                 # doGet/doPost エントリ
    Webhook.gs              # LINE Webhook ハンドラ
    Notify.gs               # LINE Messaging API ラッパ
    Triggers.gs             # 前日リマインド用トリガ
  liff/                     # 予約フォーム（静的ファイル）
    index.html
    app.js
    style.css
```

---

## 導入手順

### 1. スプレッドシートを準備

1. Googleスプレッドシートを新規作成し、ファイル名を「たなかんち2_予約管理」に
2. URLの `/d/` と `/edit` の間の文字列（**スプレッドシートID**）を控える（手順4のスクリプトプロパティに使う）
3. シートの中身は **GASデプロイ後に `setupSheets()` を一度実行すれば自動生成** されます（手順4参照）
   - 手動で作りたい場合は `spreadsheet-template.md` 参照

### 2. LINE公式アカウントとチャネルを作成

LINEの登場人物は3つあります。最初は混乱しがちなので整理：

| 何 | どこで作る | 用途 | 控える値 |
|---|---|---|---|
| LINE公式アカウント | [LINE Official Account Manager](https://manager.line.biz/) | お客さんが友だち追加する窓口 | （特に控えなくてOK） |
| **Messaging APIチャネル** | [LINE Developers Console](https://developers.line.biz/) | botが応答するための仕組み | チャネルアクセストークン / チャネルシークレット |
| **LIFFアプリ** | LINE Developers の同コンソール内 | LIFF（予約フォームを開く器） | LIFF ID / LIFFが属するチャネルのID |

手順：

1. LINE Official Account Managerでアカウント作成
2. LINE Developers Console で同じLINEアカウントでログイン
3. プロバイダー（無ければ新規作成）の中に **Messaging APIチャネル** を作成
4. 作成したMessagingチャネルを開き：
   - 「Messaging API設定」タブ → **チャネルアクセストークン**（長期）を発行 → 控える
   - 「チャネル基本設定」タブ → **チャネルシークレット** を控える
   - 「応答メッセージ」「あいさつメッセージ」は基本OFFに（GAS側で送信するため）
5. 同チャネル内の「LIFF」タブで **LIFFアプリ** を追加
   - サイズ：`Tall`
   - エンドポイントURL：仮で `https://example.com` を入れておく（後で更新）
   - Scope：`profile` + `openid` の両方をON
   - 作成後、**LIFF ID** を控える（LIFF URL: `https://liff.line.me/{LIFF_ID}`）
   - LIFF一覧の右側にある **「チャネルID」** も控える（このIDが後述の `LIFF_CHANNEL_ID` です）

### 3. LIFFをデプロイ

静的ホスティング先を用意する（**GitHub Pages** か **Vercel** が手軽）：

#### Vercelの場合
```bash
cd liff
npx vercel deploy --prod
```

#### GitHub Pagesの場合
1. `liff/` の中身をGitHubリポジトリにpush
2. Settings → Pages → main / root を公開
3. `https://{user}.github.io/{repo}/` がLIFFのエンドポイント

デプロイしたら：
- LINE DevelopersコンソールのLIFFアプリ設定で **エンドポイントURL** を上記URLに更新
- スプレッドシートの「設定」シートの `LIFF_URL` 行に `https://liff.line.me/{LIFF_ID}` を記入

### 4. GASをデプロイ

1. [Google Apps Script](https://script.google.com/) を新規プロジェクト作成
2. `gas/` のファイル（`*.gs` と `appsscript.json`）をすべてエディタにコピペ
   - `appsscript.json` を表示するには「プロジェクトの設定」→「`appsscript.json`マニフェストファイルをエディタで表示する」をON
3. エディタ右上の関数選択から **`setupProperties`** を選んで実行（初回のみ承認求められる）
4. プロジェクトの設定 → スクリプトプロパティ で以下を実値に書き換え：
   - `SHEET_ID` ← スプレッドシートID
   - `LINE_CHANNEL_ACCESS_TOKEN` ← Messaging APIのチャネルアクセストークン
   - `LINE_CHANNEL_SECRET` ← Messaging APIのチャネルシークレット
   - `LIFF_CHANNEL_ID` ← 上で控えたLIFFのチャネルID（idToken検証用）
   - `OWNER_LINE_UID` ← 一旦空でOK（手順7で記入）
5. 関数選択から **`setupSheets`** を実行 → スプレッドシートに5シートが自動で生成される
6. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
   - 説明：任意
   - 実行ユーザー：自分
   - アクセス：全員
7. 発行された **Web App URL** を控える

### 5. LIFFのconfigを実値に

`liff/index.html` の末尾 `window.APP_CONFIG`：

```js
window.APP_CONFIG = {
  LIFF_ID: '実際のLIFF_ID',
  GAS_URL: 'https://script.google.com/macros/s/.../exec'
};
```

を書き換えて再デプロイ。

### 6. LINE Webhookを設定

LINE Developers コンソール → Messaging API設定：
- **Webhook URL** に上のWeb App URLを設定
- **Webhookの利用** を ON
- 応答メッセージは OFF（任意）

### 7. 店主のuser IDを登録

オーナーの方が公式LINEを **友だち追加** → 何かメッセージを送る → スプレッドシートの「顧客」シートに `LINE_UID` が記録される → その値を：
- スクリプトプロパティの `OWNER_LINE_UID` に貼り付け
- これで新規予約・キャンセル時にオーナーへLINE通知が飛びます

### 8. 前日リマインドのトリガ設定

GASエディタ → トリガー → トリガーを追加：
- 関数：`onReminderTrigger`
- イベントのソース：時間主導型
- 時間ベースのトリガー：日タイマー
- 時刻：午後6時〜7時

### 9. 動作確認

1. 自分のLINEで公式LINEを友だち追加
2. 「予約」と送信 → LIFFのURLが返ってくる
3. URLをタップ → 予約フォームが開く → 予約完了まで通せばOK
4. スプレッドシート「予約」シートに行が追加され、LINEに確定通知が届くことを確認

---

## ローカルでLIFFの見た目を確認したい場合

```bash
cd liff
npx serve -l 5179
# http://localhost:5179
```

LIFF SDKは `LIFF_ID` が正しくないと初期化に失敗しますが、CSSや画面構造の確認は可能です。

---

## 仕様まとめ

- カウンター6席 / テーブル3卓 / 個室1卓
- 営業時間: 17:00〜23:00（LO 22:00）、最終予約開始 20:00
- 定休日: 月・火（営業日例外シートで上書き可）
- 30分刻み・滞在2時間
- 受付期間: 当日〜3か月先
- 飲み放題コース ¥6,000 / 席のみ予約も可
- キャンセル: 3日前までLINE可 / 以降は電話誘導
- 貸切: 15名以上は電話（LIFF上は4名まで自動受付）
- 二重予約防止: GASの `LockService` で直列化

## 拡張アイデア（必要になったら）

- リッチメニュー（予約 / 確認 / メニュー / 電話 のボタン）
- 5〜14名の予約は2卓組み合わせ対応
- 個室の追加料金体系
- 来店履歴に応じたクーポン送付
- 予約日時の変更（現状はキャンセル→新規）
