# rhetenor-portfolio

Astro + Sanity(CMS) 構成のポートフォリオサイトです。

- フロントエンド: `/` (Astro, Cloudflare Adapter)
- CMS: `/sanity` (Sanity Studio, 独立したプロジェクトとして管理)

フロントエンドはSanityのdatasetからコンテンツを取得して表示します。Sanity上のdatasetは `development` と `production` に分かれており、どちらを使うかは環境変数(`.env.development` / `.env.production`)で切り替えます。Studio(管理画面)は https://rhetenor-portfolio.sanity.studio/ にデプロイ済みで、権限を持つメンバーはローカル環境なしにブラウザから直接コンテンツを編集できます(本番Studioは `production` dataset を編集します)。

> `.gitignore` されていない場所にprojectIdなどのIDを直書きしないでください。projectId/datasetは必ず `.env.*` ファイル(gitignore対象)経由で参照します。

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

# 環境変数を用意する(development用・production用それぞれ)
cp .env.example .env.development
cp .env.example .env.production
```

`.env.example` を参考に、SanityのプロジェクトIDとdatasetを設定します。`SANITY_PROJECT_ID` はdevelopment/productionで共通、`SANITY_DATASET` のみ環境ごとに変えます。

```
# .env.development
SANITY_PROJECT_ID=プロジェクトID
SANITY_DATASET=development

# .env.production
SANITY_PROJECT_ID=プロジェクトID
SANITY_DATASET=production
```

`npm run dev` は `.env.development` を、`npm run build` は `.env.production` を自動的に読み込みます(Astro/Viteの標準の仕組みで、`--mode` を指定しない限りコマンドに応じて自動選択されます)。いずれも `.gitignore` 対象なので、値はチームメンバー間で別途共有してください。

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

> ログインするアカウントは、あらかじめプロジェクトオーナーからメンバー招待(https://www.sanity.io/manage/project/プロジェクトID のMembersタブ)を受けている必要があります。招待されていない場合は権限エラーになります。

環境変数を用意します(`sanity/.env.example` を参考に)。Studio側はViteベースのため、変数名に `SANITY_STUDIO_` プレフィックスが必要です。

```sh
cp .env.example .env.development
cp .env.example .env.production
```

```
# sanity/.env.development
SANITY_STUDIO_PROJECT_ID=プロジェクトID
SANITY_STUDIO_DATASET=development

# sanity/.env.production
SANITY_STUDIO_PROJECT_ID=プロジェクトID
SANITY_STUDIO_DATASET=production
```

開発サーバー(ローカルのStudio)を起動します。`npm run dev` は development dataset、`npm run build`/`npm run deploy` は production dataset を対象にします。

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

### サンプルデータの作成・削除
サンプルデータの作成
```sh
npx sanity@latest exec scripts/seed.ts --with-user-token
```

サンプルデータの削除
```sh
npx sanity@latest exec scripts/seed.ts --with-user-token
```

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
- Sanity管理画面(メンバー招待・API設定など): https://www.sanity.io/manage/project/プロジェクトID
