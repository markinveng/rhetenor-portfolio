# Rhetenor Portfolio — Claude向けガイドライン

Astro + TypeScript + SCSS + Three.js (`three/webgpu`) + GSAP + Lenis + Sanity CMS + Cloudflare で構築されたポートフォリオサイト。

作品一覧・作品詳細のビジュアルはDOMではなくWebGL (`PlaneGeometry`) で描画する。
DOMはレイアウト補助、アクセシビリティ、ヒットテスト、データ受け渡しなど必要最小限に留める。

---

## 技術スタック

- Astro
- TypeScript
- SCSS
- Three.js (`three/webgpu`)
- GSAP
  - Draggable
  - InertiaPlugin
- Lenis
- Sanity CMS
- GitHub / GitHub Issues
- Cloudflare
  - Hosting
  - R2（動画ストレージ）

---

## プロジェクト構成

```text
rhetenor-portfolio/        # フロントエンド。npmコマンドはここで実行
  src/
    components/            # Astroコンポーネント（.astro + 対応するscss）
      WaterBackground/
        WaterBackground.astro
      WorkList/
        WorkList.astro      # 作品一覧セクション。JSONデータアイランドのみ、DOM描画なし
        WorkList.scss       # ヒットテスト層（ドラッグ/クリック検知用の透明div）
        WorkDetail.scss     # 作品詳細オーバーレイ
        HoverCursor.scss    # ホバー時の色反転カーソル
      Loading/

    layouts/
      Layout.astro          # <ClientRouter />、View Transitions（fade）

    pages/
      index.astro
      discover.astro
      info.astro
      error.astro
      404.astro

    styles/                 # 共通SCSS
      # variables / functions / reset / setting など

    ts/
      main.ts               # 起点。astro:page-loadで初期化、astro:before-swapで破棄

      World/
        index.ts            # Scene / Camera / RenderPipeline を保持する共有シングルトン
                            # getOrCreateWorld() / disposeWorld()
                            # 全Canvas描画の唯一の入口
        Water/              # Waterの計算・描画本体（TSL）
        WaterBackground/    # Waterを共有Worldへ登録する薄いラッパー
        WorkList/           # Plane描画・GSAP Draggable・raycastクリック/ホバー
        WorkDetail/         # 詳細オーバーレイ・FLIP風アニメーション・レール・スライド

      CameraController/     # カメラ位置 / FOV制御。lil-guiから調整可能
      RenderPipeline/       # renderer / post-processing
      DebugGUI/             # 開発用GUIパネル（lil-gui）
      Device/               # デバイス判定
      Sanity/               # Sanity client / urlFor

      utils/
        HoverInvertCursor.ts
        media.ts            # 画像/動画判定、VideoTexture生成

      types/
        # portfolio / env / three-webgpu 等

  sanity/                   # Sanity Studio。別パッケージ
    schemaTypes/            # スキーマ定義

  docs/
    agents/
      issue-tracker.md
      triage-labels.md
      domain.md
    adr/

  CONTEXT.md
  CLAUDE.md
```

---

## 最優先ルール

以下は既存アーキテクチャの前提であり、明確な理由と承認なしに変更しない。

1. Scene / Camera / Renderer を複数作らない。
2. WebGL描画は共有 `World` を唯一の入口とする。
3. Astro View Transitionsのライフサイクルに従う。
4. ページ遷移後にイベント、GSAP、Draggable、動画、WebGLリソースを残さない。
5. WorkList / WorkDetailのビジュアルをDOM実装へ置き換えない。
6. Three.jsオブジェクトをGSAP Draggableの直接対象にしない。
7. 既知の型回避コメントを理由なく削除しない。
8. Sanity本番データ、Cloudflare/R2、デプロイ設定を明示的な承認なしに変更しない。
9. GitHubへのpush / merge / releaseを明示的な依頼なしに実行しない。
10. `.env`、API Token、Secret、認証情報を出力・コミットしない。

---

## アーキテクチャ

### 共有Worldシングルトン

Scene / Camera / Renderer は `World/index.ts` の `getOrCreateWorld()` が一元管理する。

WaterBackground / WorkList / WorkDetail は同じCanvas / Sceneを共有する。

各描画モジュールは共有Worldから必要な参照を取得し、毎フレーム処理はWorldの更新ループへ登録する。

新しい描画要素を追加する場合も、独自のScene / Camera / Renderer / Canvasを作成せず、必ず共有Worldを利用する。

子モジュールは、自分が生成・所有していない共有Worldのリソースを勝手にdisposeしない。

---

### Astroライフサイクル

初期化:

```text
astro:page-load
```

破棄:

```text
astro:before-swap
```

`main.ts` の `App` がページ遷移ごとに `init()` → `destroy()` を呼び直す前提で設計する。

ブラウザ上で副作用を持つクラスは原則として以下を備える。

```ts
init(): void
destroy(): void
```

`destroy()` では、そのクラスが生成・登録した副作用を必ず解除する。

対象例:

- DOM event listener
- window / document event listener
- requestAnimationFrame
- Worldへ登録したupdate処理
- GSAP Timeline / Tween
- ScrollTrigger
- Draggable
- Lenis関連のlistener
- ResizeObserver / IntersectionObserver
- Timer
- Video / VideoTexture
- Three.jsでそのクラスが所有するGeometry / Material / Texture / RenderTarget

---

### GSAP / Draggable

透明なDOMヒットテスト層へGSAP Draggableを適用する。

Draggableの `x / y`（CSS pixel）を `world.getPixelsToWorld()` でworld単位へ変換し、Three.jsの `group.position` に反映する。

Three.jsオブジェクト自体をDraggableの対象にしない。

`gsap/Draggable` と `gsap/InertiaPlugin` はWindows環境で型定義の大文字小文字衝突が発生するため、既存の `// @ts-ignore` を削除しない。

アニメーションの値は直接埋め込まず、調整可能な名前付き定数へ分離する。

対象:

- duration
- delay
- ease
- stagger
- position / offset
- scale
- opacity
- threshold

要素・Meshの移動や表示/非表示の切り替えには、原則GSAPによるアニメーションを用いる。
既存UIで意図的に即時切り替えしている箇所は、勝手に変更しない。

作成したTimeline / Tween / Draggableは所有者の `destroy()` で破棄する。

---

### Lenis

Lenisのインスタンスをページ遷移のたびに重複生成しない。

既存のスクロール管理方式を確認してから変更する。

LenisとGSAP ticker / ScrollTriggerを連携させる場合、listenerやticker callbackを重複登録しない。

破棄時は、そのモジュールが登録したlistener / callbackを解除する。

ネイティブスクロール、Lenis、Draggableの責務を混在させない。

---

### Three.js / WebGPU

`three/webgpu` を前提とする。

`@types/three` にはWebGPU向けサブパスの型定義が不足しているため、`THREE.Scene` 等を `any` として保持している既存箇所がある。
既知の型不足を無理に厳密化しない。

型改善を行う場合は、挙動を変えず、既存のWebGPU APIとの互換性を確認する。

新規リソースを生成する場合は所有者を明確にする。

破棄対象の例:

- Geometry
- Material
- Texture
- VideoTexture
- RenderTarget
- Object URL
- 独自イベント
- animation loop

共有Worldが所有するRenderer / Scene / Camera等を子モジュールからdisposeしない。

---

### メディア

画像:

```text
Sanity CDN
→ urlFor()
→ Texture
```

動画:

```text
Cloudflare R2
→ MP4直リンク
→ ts/utils/media.ts
→ createVideoTexture()
→ THREE.VideoTexture
```

画像・動画の判定ロジックを各機能へ重複実装せず、`ts/utils/media.ts` を利用する。

動画対応を変更する場合は以下を確認する。

- CORS
- `Content-Type`
- HTTP Range Request
- Cache-Control
- preload
- autoplay制約
- muted / playsInline
- VideoTextureの破棄
- ページ遷移後にVideo要素や通信が残っていないか

R2のURLやBucket構成をコード中へ無秩序にハードコードしない。

---

## Sanity

Sanity関連コードは `src/ts/Sanity/`、Studio / Schemaは `sanity/` 配下で管理する。

GROQ、Schema、TypeScript型の変更時は既存構造を先に確認する。

可能な場合はSanity TypeGenを利用し、手書き型との二重管理を避ける。
ただし既存型との整合性を崩す大規模な置換は、別Issueとして扱う。

本番Datasetへの以下の操作は、明示的な承認なしに行わない。

- create
- update
- delete
- import
- migration
- schema deploy
- release操作

Sanity MCP / Pluginを使用する場合は、最初にread-onlyで状態を確認する。

---

## Cloudflare / R2

CloudflareはHostingとR2動画配信に利用する。

Cloudflare Plugin / MCP / Wranglerを使用する場合は、原則として最初に現在の設定をread-onlyで確認する。

明示的な承認なしに以下を実行しない。

- production deploy
- R2 object削除
- Bucket削除
- DNS変更
- Route変更
- Worker / Pages設定変更
- Secret変更
- CORS設定変更
- Cache Rule変更

R2動画配信を変更する際は、ブラウザでNetworkを確認し、Range Requestとキャッシュ挙動を検証する。

---

## SCSS

コンポーネント固有のスタイルは対応するコンポーネント配下のSCSSに置く。

共通値・関数・reset・settingは `src/styles/` の既存構成を利用する。

既存の命名規則、変数、mixin、functionを確認してから新しいものを追加する。

同じ値・ロジックを複数箇所へコピーしない。

JavaScript / TypeScriptから直接style属性を変更するより、既存CSS/SCSSとGSAPの責務を優先する。
WebGL描画に必要な値はこの限りではない。

---

## TypeScript

既存コードではWebGPU型不足による例外があるため、「すべての `any` を削除する」ことを目的にしない。

それ以外では以下を優先する。

- `any` の安易な追加を避ける
- 既存型を再利用する
- publicな入出力は型を明確にする
- 型アサーションを増やす前に原因を確認する
- 未使用import / field / methodを残さない
- 1クラス1責務を意識する
- 大きな処理は意味のある小さなprivate methodへ分離する

TypeScript LSPは `.ts` / `.js` 系の参照・型解析に使用する。

`.astro` の正当性はTypeScript LSPだけで判断せず、Astro build結果も確認する。

---

## コメント規約

コメントは対象コードの右側ではなく、1行上に書く。

コメントの直前に空行を1つ入れる。
コメントと対象コードの間には空行を入れない。

良い例:

```ts
const items = getItems();

// WebGPU初期化完了前の描画を防ぐため待機する
await world.ready();
```

何をしているかコードから自明なコメントは書かない。

意図、理由、制約、回避策など、実装だけでは判断できない内容のみを書く。

コメントに絵文字や装飾記号を使わない。

---

## 変更方針

変更前に対象コードと周辺コードを確認する。

症状だけを直すのではなく原因を特定する。

既存設計を維持した最小差分を優先する。

依頼されていない大規模リファクタ、命名変更、ファイル移動を同時に行わない。

修正によって不要になった以下は残さない。

- import
- field
- function
- method
- event listener
- CSS
- debug code
- console.log

既存の共有World、Astro lifecycle、Draggable変換パターンを崩す変更が必要な場合は、実装前に理由と影響範囲を提示する。

---

## Plugin / Skill / MCP の使い分け

### mattpocock-skills

開発プロセスとIssue管理の中心として使用する。

大きな機能追加・設計変更では、いきなり実装せず以下を優先する。

```text
/grill-with-docs
→ /to-spec
→ /to-tickets
→ /implement
→ /code-review
```

原因不明のバグでは、推測で修正を繰り返さず `/diagnosing-bugs` を優先する。

小さく明確な変更では、不要にフローを増やさず直接調査・実装してよい。

---

### Context7

以下の場合に最新の公式ドキュメント確認へ使用する。

- Astro API / View Transitions
- Three.js / WebGPU API
- GSAP / Draggable / InertiaPlugin
- Lenis
- Sanity SDK
- Cloudflare / Wrangler
- API名、設定値、推奨方式がバージョンで変わる可能性がある場合

記憶だけでAPIを推測しない。

コードベースの既存実装と公式ドキュメントが異なる場合は、既存バージョンを先に確認する。

---

### Sanity Plugin / MCP

以下に使用する。

- Schema確認
- GROQ確認
- Dataset構造確認
- TypeGen
- Sanityベストプラクティス確認

最初はread-onlyで利用する。

---

### Cloudflare Plugin / MCP

以下に使用する。

- Hosting設定確認
- R2確認
- CORS
- Cache
- Wrangler
- デプロイ構成確認

最初はread-onlyで利用する。

---

### Chrome DevTools MCP

ブラウザ上の実際の挙動確認に使用する。

特に以下では優先する。

- Console error
- Network
- R2動画ロード
- CORS
- Performance
- Long Task
- Memory leak
- WebGL / WebGPU描画
- Astroページ遷移後の残存処理
- FPS低下
- LCP / CLS

UIやアニメーションの修正では、コードだけ見て完了と判断しない。

---

### Playwright

ユーザーフローと回帰確認に使用する。

例:

```text
作品一覧
→ ドラッグ
→ ホバー
→ 作品クリック
→ 詳細表示
→ スライド操作
→ 戻る
→ 状態確認
```

Chrome DevToolsは「原因調査・性能・Network」、Playwrightは「操作フロー・回帰テスト」を主用途とする。

---

### TypeScript LSP

以下に利用する。

- Go to definition
- Find references
- 型エラー
- 呼び出し元調査
- 未使用コード確認

単純なgrepだけで型や参照関係を断定しない。

---

## GitHub Issues

GitHub Issues (`gh` CLI) をIssue trackerとして使用する。

詳細:

```text
docs/agents/issue-tracker.md
```

仕様変更、機能追加、バグ修正、一定規模以上のリファクタでは既存Issueを確認する。

対応するIssueが存在する場合は、そのIssueの目的・受け入れ条件から逸脱しない。

新しい論点が発生した場合、無関係な変更として同じIssueへ混ぜない。

明示的な依頼なしにIssueをcloseしない。

---

## Triage labels

以下の5ラベルを使用する。

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
- `wontfix`

詳細:

```text
docs/agents/triage-labels.md
```

Claudeが単独で安全に実装できるほど要件が確定しているIssueのみ `ready-for-agent` とする。

デザイン判断、仕様判断、認証、外部サービスの重要変更など人間判断が必要なものは `ready-for-human` を使用する。

---

## Domain docs

単一コンテキスト構成を使用する。

```text
CONTEXT.md
docs/adr/
```

詳細:

```text
docs/agents/domain.md
```

長期的に有効なドメイン知識は `CONTEXT.md` へ記録する。

重要な設計判断とその理由はADRへ記録する。

一時的なデバッグ情報や作業メモを `CONTEXT.md` へ蓄積しない。

---

## Git操作

変更前に `git status` を確認する。

ユーザーが作業中の未コミット変更を勝手に破棄・上書きしない。

以下は明示的な依頼なしに実行しない。

- `git reset --hard`
- `git clean`
- force push
- branch削除
- merge
- rebase
- release
- production branchへのpush

コミットを依頼された場合は、変更内容を確認してから実行する。

---

## 変更後の確認

コードを修正したら、フロントエンドルートで以下を実行する。

```bash
npm run lint
npm run build
```

`sanity/` 配下を修正した場合は `cd sanity` し、そのパッケージの既存scriptを確認して必要なlint / build / validationを実行する。

UI、アニメーション、Three.js、動画、ページ遷移を変更した場合は、可能であればローカルサーバーを起動し、Chrome DevTools MCPまたはPlaywrightで実動作も確認する。

確認すべき代表例:

- Console errorがない
- ページ遷移後に二重初期化されない
- destroy後にevent listenerが残らない
- Draggableが重複しない
- GSAP timelineが残らない
- Lenis listenerが重複しない
- VideoTexture / 動画通信が不要に残らない
- WorkList / WorkDetailのクリック・ホバー・ドラッグが正常
- R2動画がCORS / Range Requestエラーなく再生される
- buildが成功する

---

## デバッグ方針

原因不明の問題では、最初からコードを大きく変更しない。

以下の順で進める。

```text
再現
→ 事実確認
→ 原因候補の絞り込み
→ 必要なログ / DevTools確認
→ 最小修正
→ 再現テスト
→ 回帰確認
```

WebGL / WebGPU / GSAP / View Transitions / 動画関連は、コードだけで推測せずブラウザ上の実測を優先する。

---

## 応答ルール

- 日本語で回答する。
- 要点を簡潔に述べる。
- 不要な前置きや冗長な説明を省く。
- 不確かな内容を断定しない。
- 変更前に重要な懸念がある場合は先に示す。
- コードを変更した場合は実行した確認内容を明記する。
- 未確認のものを「確認済み」と表現しない。

回答の最後に以下を簡潔に記載する。

```text
結論:
...

修正箇所:
...
```
