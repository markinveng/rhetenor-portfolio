# Rhetenor Portfolio — Claude向けガイドライン

Astro + Three.js(three/webgpu)+ Sanity CMSで構築されたポートフォリオサイト。
作品一覧・作品詳細は共にDOMではなくWebGL(PlaneGeometry)で描画される。

## プロジェクト構成

```
rhetenor-portfolio/        (フロントエンド。npmコマンドはここで実行)
  src/
    components/           Astroコンポーネント(.astro + 対応するscss)
      WaterBackground/     Canvasのコンテナ(WaterBackground.astro)
      WorkList/            作品一覧・作品詳細のマークアップ + scss
        WorkList.astro      作品一覧セクション(JSONデータアイランドのみ、DOM描画なし)
        WorkList.scss        ヒットテスト層(ドラッグ/クリック検知用の透明div)のスタイル
        WorkDetail.scss       作品詳細オーバーレイのスタイル
        HoverCursor.scss      ホバー時の色反転カーソルのスタイル
      Loading/
    layouts/
      Layout.astro          <ClientRouter />, View Transitions(fade)
    pages/
      index.astro / discover.astro / info.astro / error.astro / 404.astro
    styles/                 共通scss(variables/functions/reset/setting)
    ts/
      main.ts               起点。astro:page-loadで初期化、astro:before-swapで破棄
      World/
        index.ts             Scene/Camera/RenderPipelineを保持する共有シングルトン
                              (getOrCreateWorld/disposeWorld)。全Canvas描画の唯一の入口
        Water/                Waterの計算・描画本体(TSL)
        WaterBackground/      Waterを共有Worldへ登録するだけの薄いラッパー
        WorkList/             作品一覧。Plane描画・GSAP Draggable・raycastクリック/ホバー
        WorkDetail/           作品詳細オーバーレイ。FLIP風アニメーション・レール・スライド
      CameraController/       カメラ位置/FOV制御(lil-guiから調整可)
      RenderPipeline/         レンダラー・ポストプロセス
      DebugGUI/               開発用GUIパネル(lil-gui)
      Device/                 デバイス判定
      Sanity/                 Sanityクライアント・urlFor
      utils/
        HoverInvertCursor.ts   ホバー時の色反転カーソル(DOM)
        media.ts               画像/動画の種別判定、VideoTexture生成
      types/                  portfolio型・env型・three-webgpu型
sanity/                    Sanity Studio(別パッケージ。schemaTypes配下にスキーマ定義)
```

## アーキテクチャ上の重要な前提

- **共有Worldシングルトン**: Scene/Camera/RendererはすべてWorld/index.tsの`getOrCreateWorld()`が
  一元管理する。WaterBackground・WorkList・WorkDetailは同じCanvas/Sceneを共有し、
  各自`world.registerUpdate(fn)`で毎フレーム処理を登録する。新しい描画要素を追加する場合も
  Sceneやrendererを独自に作らず、必ず`getOrCreateWorld()`経由で取得すること。
- **ライフサイクル**: Astroの`astro:page-load`(初期化)/`astro:before-swap`(破棄)に従う。
  ページ遷移のたびにmain.tsのAppクラスが`init()`→`destroy()`を呼び直す前提でクラスを設計する。
- **ドラッグ実装パターン**: 透明なDOMヒットテスト層にGSAP Draggableを適用し、
  そのx/y(CSSピクセル)を`world.getPixelsToWorld()`でworld単位に変換して
  Three.jsの`group.position`に反映する。Three.jsオブジェクトを直接Draggableの対象にはしない。
- **GSAP型定義の制約**: `gsap/Draggable`・`gsap/InertiaPlugin`はWindows環境で型定義の
  大文字小文字衝突が起きるため`// @ts-ignore`が必要(既知の制約。削除しない)。
- **three/webgpuの型不足**: `@types/three`にはWebGPU向けのサブパス型定義が無いため、
  `THREE.Scene`等を`any`として保持している箇所がある。無理に型を厳密化しない。
- **メディア解決**: 画像はSanity CDN(`urlFor()`)、動画はCloudflare R2の直リンクMP4を
  `ts/utils/media.ts`の`createVideoTexture()`で`THREE.VideoTexture`化する。

## コーディング規約

- コメントは対象コードの右ではなく、1行上に書く。コメントの直前に空行を1つ入れる
  (コメントと対象コードの間には空行を入れない)。
- コメントは実装から自明でない意図・理由のみを最小限書く。何をしているかの説明は書かない。
- 絵文字(★など)はコメントに使わない。
- 既存の設計(共有World、page-load/before-swapのライフサイクル、Draggable変換パターン)を
  崩さない範囲で、修正しやすい単位(小さな関数・単一責任のクラス)を保つ。
- 修正によって不要になったコード(未使用の関数・フィールド・import等)は残さず削除する。
- 要素・Meshの移動や表示/非表示切り替えには、必ずアニメーション(GSAP)を入れる。
  瞬時に切り替えない。
- アニメーションの数値(duration・ease・delay・移動量など)はコード中に直接埋め込まず、
  後から微調整しやすいよう名前付き定数として分離する。

## 変更後の確認

コードを修正したら、対象パッケージで以下を実行してエラーが無いことを確認する。

```
npm run lint     # eslint src --ext .ts
npm run build    # astro build
```

`sanity/`配下(スキーマ・seedスクリプト)を修正した場合は`cd sanity`してから確認する。

## 応答ルール

- 日本語で回答する。
- 要点のみを簡潔に述べ、前置きや冗長な説明は省く。
- 回答の最後に「結論」と「修正箇所」を簡潔にまとめる。
