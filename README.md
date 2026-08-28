# rhetenor-portfolio

Astro + Sanity(CMS) 構成のポートフォリオサイトです。

- フロントエンド: `/` (Astro, Cloudflare Adapter)
- CMS: `/sanity` (Sanity Studio, 独立したプロジェクトとして管理)

フロントエンドはSanityの `production` dataset(projectId: `si0urca2`)からコンテンツを取得して表示します。Studio(管理画面)は https://rhetenor-portfolio.sanity.studio/ にデプロイ済みで、権限を持つメンバーはローカル環境なしにブラウザから直接コンテンツを編集できます。

## 🚀 環境構築

### 前提: Node.jsバージョン

このプロジェクトは Node.js `>= 22.19.0` を要求します。`.nvmrc` / `.node-version` を用意しているので、nvmやVoltaを使っていれば自動でバージョンが切り替わります。

```sh
# nvmの場合
nvm install
nvm use

# Voltaの場合(volta installでバージョンが自動適用されます)
volta install node
```

### 1. Astroプロジェクトのセットアップ

リポジトリのルートで行います。

```sh
npm install

# 環境変数を用意する
cp .env.example .env
```

`.env` に SanityのプロジェクトIDを設定します。

```
SANITY_PROJECT_ID=si0urca2
```

開発サーバーを起動します。

```sh
npm run dev
```

`http://localhost:4321` でサイトが起動します。

### 2. Sanityプロジェクトのセットアップ

Studio(管理画面)のコードは `sanity/` ディレクトリに独立したプロジェクトとして置かれています。ルートの `npm install` とは別に、こちらでも依存関係のインストールが必要です。

```sh
cd sanity
npm install
```

Sanityアカウントへのログインが必要です(初回のみ、ブラウザが開いて認証します)。

```sh
npx sanity login
```

> ログインするアカウントは、あらかじめプロジェクトオーナーからメンバー招待(https://www.sanity.io/manage/project/si0urca2 のMembersタブ)を受けている必要があります。招待されていない場合は権限エラーになります。

開発サーバー(ローカルのStudio)を起動します。

```sh
npm run dev
```

`http://localhost:3333` でStudioが起動し、ローカルからコンテンツの編集・確認ができます。

#### 本番Studioへの反映

スキーマ(フィールド定義)を変更した場合は、動作確認後にデプロイして本番Studio(https://rhetenor-portfolio.sanity.studio/)へ反映します。

```sh
npm run deploy
```

コンテンツの値(記事の中身など)を変えるだけなら、上記のURLから直接編集すればよく、デプロイは不要です。

## 🧞 コマンド一覧

### Astro (ルートディレクトリで実行)

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`              | 依存関係をインストール                             |
| `npm run dev`               | `localhost:4321` でローカル開発サーバーを起動         |
| `npm run build`             | 本番用ビルドを `./dist/` に出力                     |
| `npm run preview`           | ビルド済みサイトをデプロイ前にローカルでプレビュー         |
| `npm run lint`              | ESLintで `src` を検査                              |
| `npm run astro ...`         | `astro add` や `astro check` などのAstro CLIを実行  |

### Sanity (`sanity/` ディレクトリで実行)

| Command                    | Action                                              |
| :-------------------------- | :--------------------------------------------------- |
| `npm install`                | 依存関係をインストール                                  |
| `npm run dev`                 | `localhost:3333` でローカルのStudioを起動                |
| `npm run build`               | Studioを静的ファイルとしてビルド                          |
| `npm run deploy`              | 本番Studio(sanity.studio)へデプロイ                     |
| `npx sanity login`            | Sanityアカウントにログイン                               |
| `npx sanity users invite`     | プロジェクトへメンバーを招待                              |

## 🚀 プロジェクト構成

```text
/
├── public/                     # 静的ファイル
├── src/
│   ├── components/              # Astroコンポーネント(ArchCarousel, WaterBackground など)
│   ├── layouts/                 # ページレイアウト
│   ├── pages/                   # ルーティングされるページ
│   ├── styles/                  # スタイル
│   ├── ts/                      # Three.js / Sanity クライアントなどのロジック
│   │   └── Sanity/                # Sanityクライアント・クエリ (sanity.ts)
│   └── types/                   # 型定義
├── sanity/                      # Sanity Studio(独立したnpmプロジェクト)
│   ├── schemaTypes/               # コンテンツのスキーマ定義
│   ├── sanity.config.ts           # Studioの設定
│   └── sanity.cli.ts              # Sanity CLIの設定(projectId, デプロイ設定など)
├── astro.config.mjs
└── package.json
```

## 👀 参考リンク

- [Astro Docs](https://docs.astro.build)
- [Sanity Docs](https://www.sanity.io/docs)
- Sanity管理画面(メンバー招待・API設定など): https://www.sanity.io/manage/project/si0urca2
