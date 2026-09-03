# immersive-g.com ホバー波紋エフェクト調査メモ

調査日: 2026-09-03
調査方法: Chrome DevTools MCP で `WebGLRenderingContext/WebGL2RenderingContext.prototype.linkProgram` /
`shaderSource` を `initScript`（ページ読み込み前に注入されるスクリプト）でフックし、実際にコンパイルされた
GLSLソースをブラウザ内から抽出。あわせて `/projects/` 一覧ページで実際にホバー操作を行い、視覚的な挙動を screenshot で確認。

対象ページ:
- https://immersive-g.com/ （トップ、フルスクリーンWebGL背景）
- https://immersive-g.com/projects/ （プロジェクト一覧。行にホバーするとサムネイル動画プレビューが浮かぶ）

---

## 1. 全体構成

- WebGL2（three.js の `ShaderMaterial` ベース）+ 独立した軽量WebGL（glslify製、three.jsの`SHADER_NAME`定義を持たない生シェーダー）の**2系統が併存**している。
- キャンバスは複数存在（`class="webglApp"` がメインの929x861想定の全画面キャンバス、他にLottieアニメ用やカスタムカーソル用の小さいキャンバスが複数）。
- プロジェクト一覧はDOM側に本物の `<a href="...">` リンクが存在するが、レイアウトはJS駆動（仮想スクロール的挙動、`body{overflow:hidden}`）。DOMはヒットテスト/アクセシビリティ用、ビジュアルはWebGL側、というユーザー自身のサイト（WorkList）と同型のアーキテクチャ。
- ホバーすると行の左側に**サムネイル動画のプレビューPlane**が浮かび上がり、他の行はopacityが落ちる。

---

## 2. カーソル追従リップルの正体＝「グローバルな流体(Flow)フィールド」

観察結果として、ページ全体の背景（紙のようなエンボス/relief素材）にカーソルの移動軌跡に沿って**黒い筆致（インクのような）ストローク**が現れ、時間とともに減衰していく。これはプロジェクトサムネイルのホバー時だけでなく、ページ全体でカーソルが動くたびに常時発生している。

この「波紋が追従する」表現は、単発のクリック波紋シェーダーではなく、**画面全体で共有される流体シミュレーション用FBO（`tFlow` / `tFluidFlowmap`）を、各Planeのフラグメントシェーダーがスクリーン座標でサンプリングして自身のUVを歪ませる**、という設計になっている。

### 2.1 流体フィールド生成パス（"stamp"シェーダー）

`sampler2D tMap, tNoise` を持つ小さなシェーダー（ピンポンFBO想定）:

```glsl
// fragment
uniform sampler2D tMap;
uniform float uFalloff, uAlpha, uDissipation, uDeltaMult, uOffset, uAspect;
uniform vec2 uMouse, uVelocity, uMouse2, uVelocity2;
uniform sampler2D tNoise;
uniform float uTime;
varying vec2 vUv;

vec4 getStamp(vec2 velocity, vec2 mouse) {
  vec2 cursor = vUv - mouse;
  cursor.x *= uAspect;
  velocity *= 50.0;
  float magnitude = 1.0 - pow(1.0 - min(1.0, length(velocity)), 2.0);
  vec4 stamp = vec4(velocity, magnitude, 1.0);
  float falloff = smoothstep(uFalloff, 0.0, length(cursor)) * uAlpha;
  return stamp * falloff;
}

void main() {
  vec2 uv = vUv; uv.y += uOffset;
  vec4 data = texture2D(tMap, uv);

  // 摩擦による減衰（ピンポンFBOへの蓄積を毎フレーム弱める）
  float friction = (1.0 / uDissipation) - 1.0;
  float dissipation = 1.0 / (1.0 + (uDeltaMult * friction));
  data *= dissipation;

  // ノイズテクスチャでスタンプ強度を揺らす（2枚のノイズをブレンド）
  float noise  = smoothstep(0.4, 1.0, texture2D(tNoise, ...).g);
  float noise2 = smoothstep(0.4, 1.0, texture2D(tNoise, ...).g);

  // 現在のマウス位置(uMouse)と速度(uVelocity)でスタンプを加算
  data += getStamp(uVelocity, uMouse) * noise2 * uDeltaMult;
  // 2本指/2ポインタ目にも対応(uMouse2/uVelocity2)
  data += getStamp(uVelocity2, uMouse2) * 3.0 * noise * uDeltaMult;

  data = clamp(...);
  gl_FragColor = data;
}
```

- `uMouse` はスクリーン座標(0-1)、`uVelocity` は前フレームとの差分から求めたポインタ速度。
- 「摩擦(friction)による減衰」＋「毎フレームのスタンプ加算」を**ピンポンFBOでフィードバック**することで、カーソルの軌跡が尾を引くように減衰していくトレイル(=リップル)になる。
- ノイズテクスチャでスタンプの強さを空間的・時間的に揺らし、単純な円ではなく有機的な滲みに見せている。

### 2.2 別系統：複数入力対応の速度場（クリック時の同心円ショックウェーブ用）

`NB_INPUTS 7` の別シミュレーション（`force/center/scale/intensity/circular` を最大7入力ぶん保持）:

```glsl
// 距離関数でカプセル/円の符号付き距離を計算し、
// 「ドラッグ中の軌跡(カプセル)」と「クリック時の円形ショックウェーブ」を切り替える
float sdf = mix(sdUnevenCapsule(vUv, lastCenter, center, lastScale, scale),
                 sdCircle(vUv - cp, cr), useCircle);

// circular入力が有効な期間(0〜duration)は同心円状の波紋を生成
if (circular > 0. && circular < duration) {
  float uShockwaveProgress = remap(circular, 0., duration, 0., 1.);
  float dist  = circle(vUv - center, scale /*=0.015*/, 2.);
  float depth = cos(dist * freq/*15*/ - uShockwaveProgress * speed/*10*/);
  depth *= smoothstep(...) * smoothstep(...); // 減衰＋広がりのマスク
  newVelocity = vec2(depth * 4.0 * normalize(vUv - center));
} else {
  newVelocity = mix(force, dir, 0.2) * sdf; // 通常のドラッグ追従
}
```

- こちらは「クリック/タップ時に同心円状の波紋が広がる」表現（`cos(dist*freq - progress*speed)` は典型的な水面波の式）と、「ドラッグ中は軌跡に沿って速度場が伸びる」表現を1つのFBOで両立させている。
- `NB_INPUTS=7` は複数の同時ポインタ/複数プレーンの同時ホバーに対応するための枠と推測される。

---

## 3. サムネイルPlane（動画プレビュー）側のシェーダー

`uPreviewTexture` / `uTexture` / `tFlow` / `uMouse` / `uHover` を持つ three.js `ShaderMaterial`。ホバーで浮かぶプレビューPlaneの実体。

### Vertex（抜粋・整形）

```glsl
uniform sampler2D tFlow, tDepth;
uniform float uHover, uStretchFactor, uDragScaleProgress, uFullscreen, ...;

vec3 getExtrude() {
  vec4 ndc = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec2 uvScreen = (ndc.xy / ndc.w + 1.0) / 2.0; // スクリーン空間UV
  vec3 flow  = texture2D(tFlow, uvScreen).rgb;
  float depth = texture2D(tDepth, uvScreen).r;
  float extrude = cremap(depth, 0.89, 0.85, 0.0, 1.0);
  return vec3(flow.rg, extrude);
}

void main() {
  vUv = uv;
  vec3 pos = position.xyz;

  // ホバー時にわずかに縮小させるスケール
  vec2 hoverScale = vec2(1.0) - (vec2(1.0) / uPlaneSize) * 0.03;
  pos.xy *= mix(vec2(1.0), hoverScale, uHover);
  pos.y  *= uStretchFactor;
  pos.xy *= uDragScaleProgress;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  // フルスクリーン展開時のUVベース座標への遷移（詳細ページ遷移用と推測）
  gl_Position.xy = mix(gl_Position.xy, (uv.xy*2.0-1.0)*..., fullscreen1);
}
```

### Fragment（核心部分）

```glsl
uniform sampler2D uTexture;        // 静止画/動画の1フレーム相当のベーステクスチャ
uniform sampler2D uPreviewTexture; // ホバー時に前面に出るプレビュー用テクスチャ（動画テクスチャ想定）
uniform sampler2D tFlow;           // 2章のグローバル流体フィールド
uniform sampler2D tMaskNoise;
uniform vec2 uMouse;               // スクリーン座標(0-1)のカーソル位置
uniform float uHover;              // 0→1でトゥイーンされるホバー進行度

vec3 getExtrude(vec2 uvScreen) {
  vec3 flow  = texture2D(tFlow, uvScreen).rgb;
  float depth = texture2D(tDepth, uvScreen).r;
  return vec3(flow.rg, cremap(depth, 0.89, 0.85, 0.0, 1.0));
}

void main() {
  vec2 uvScreen = gl_FragCoord.xy / uResolution;
  vec3 extrude  = getExtrude(uvScreen); // extrude.rg = 流体の流れベクトル

  // --- カーソル中心の局所的な「にじみ」マスク ---
  vec2 mouseDiff = uMouse - uvScreen;
  mouseDiff.x *= screenRatio;
  float mouseFalloff = smoothstep(uHover*0.7 + sin(uTime)*0.05, 0.0, length(mouseDiff));
  float noiseMask = smoothstep(0.3, 0.45, mouseFalloff * uHover * hoverNoise);

  // --- 本題：流体フィールドでテクスチャUVそのものを歪ませる ---
  vec2 uvImage = vUv - 0.5;
  uvImage *= /* アスペクト補正 */;
  uvImage *= mix(vec2(1.0), hoverScale, uHover);
  uvImage.xy += extrude.rg * 0.02 * uHover;              // ① 流れの向きにUVをずらす
  uvImage.xy -= extrude.rg * extrude.b * 0.1 * uHover;   // ② depthベースの押し出し量でさらに歪ませる
  uvImage += 0.5;

  vec4 previewColor = texture2D(uPreviewTexture, uvImage);
  vec4 tex           = texture2D(uTexture, uvImage);
  color = mix(color, previewColor.rgb, previewColor.a * uPreviewTextureAlpha);
  color = mix(color, tex.rgb, tex.a * uTextureAlpha);

  // カーソル位置のノイズマスクで明度/彩度を局所的に落として滲みを演出
  vec3 colorHSV = rgb2hsv(color);
  colorHSV.b += noiseMask * 0.06;
  colorHSV.g *= mix(1.0, 0.9, noiseMask);
  color = hsv2rgb(colorHSV);

  gl_FragColor = vec4(color, alpha * uAlpha);
}
```

**波紋追従の仕組みまとめ**

1. カーソルが動くたびに §2 の流体FBO（`tFlow`）へ速度がスタンプされ、摩擦で減衰しながら画面全体に「流れ」が蓄積される。
2. 各PlaneのFragmentシェーダーは、**自分のスクリーン座標**で `tFlow` をサンプリングし、その流れベクトル（`extrude.rg`）で**画像/動画をサンプリングするUV自体をオフセット**する（`uvImage.xy += extrude.rg * 0.02 * uHover`）。
3. さらに深度テクスチャ(`tDepth`)から求めた `extrude.b`（押し出し量）を使って二段目の歪みを加算し、単純な平行移動ではなく「膨らみ」のある歪みにしている。
4. すべて `uHover`（0→1、おそらくGSAPでトゥイーン）で強度をゲートしているため、ホバーしていないPlaneでは歪みが見えない＝**ホバーした瞬間だけ「波紋がついてくる」ように見える**。
5. 加えて `uMouse` を使った独立の同心円状ノイズマスクで、カーソル直下だけ局所的に明度/彩度を落とす「にじみ」を重ねている。これが視覚的に「波紋の中心」を強調している。

---

## 4. 背景の紙エンボス（relief）表現との関係

トップページの背景（紙のような凹凸に鳥の羽根のような形が浮かぶ演出）も同じ `tFlow`／深度・法線ベースの手法を使っている、別のシェーダー（`tBake1`/`tBake2` の複数レベルテクスチャをextrude量でブレンドし、疑似法線からフレネル的な色収差効果を加算するもの）で構築されている。行単位までは追っていないが、**「カーソル速度→流体FBO→スクリーン空間UVでサンプル→ローカルなUV/深度を歪ませる」という設計パターンがサイト全体で使い回されている**、というのがこのサイトの実装の肝。

---

## 5. 自分のサイト（WorkList/WorkDetail）への応用メモ

- 現状の `ts/World/WorkList` は Draggableの位置をworld座標に変換してPlaneを動かす構成。今回の「波紋追従」を再現するなら、
  1. 共有Worldにスクリーン解像度のFBO（RenderTarget）をもう1枚持たせ、ポインタ速度を毎フレーム「スタンプ」する簡易流体（§2.1のような減衰FBO）を追加する。
  2. WorkListのPlane用シェーダー（`three/webgpu`のTSL）で、そのFBOをスクリーン空間UVでサンプルし、`map`/`videoTexture`のサンプルUVをオフセットする。
  3. 強度は既存の `hover progress`（GSAPでトゥイーンされる0→1値）でゲートする。
- WebGPU/TSL移行が前提の既存コードとは別レイヤーの追加になるため、既存の共有World設計・破棄ライフサイクル（RenderTargetの生成者・dispose責務）を崩さないよう、新規RenderTargetの所有者を明確にした上で実装する必要がある（CLAUDE.mdの「共有Worldルール」に準拠）。

---

## 6. 調査方法の補足（再現手順）

Chrome DevTools MCP を使い、以下の手順でシェーダーソースを抽出した。

1. `navigate_page`（`type: "reload"`, `ignoreCache: true`）の `initScript` に、`WebGLRenderingContext.prototype` / `WebGL2RenderingContext.prototype` の `linkProgram` をラップするコードを渡し、リンクされた全プログラムの `vertexShader`/`fragmentShader` ソースを `window.__capturedPrograms` に蓄積させる。
2. ページ読み込み後、`evaluate_script` で `window.__capturedPrograms` の内容を集計し、`uniform sampler2D` 名（`tFlow`, `uPreviewTexture`, `uAtlas` など）や特徴的なキーワード（`mouse`, `ripple`, `wave`）でフィルタして対象シェーダーを絞り込んだ。
3. `/projects/` 一覧ページでリンクに `hover` し、`take_screenshot` で視覚的な波紋トレイルを確認した（実際のポインタ移動によるトレイル。ページ内 `dispatchEvent` によるsyntheticな `mousemove` では流体フィールドは反応しなかった＝おそらく `isTrusted` イベントのみを見ている）。

この手法は本サイト固有のミニファイされたビルドに対しては有効だが、shaderの意味論的な変数名はビルド時に難読化されていないケース（このサイトはglslifyのコメント・変数名がある程度残っている）に限られる点に注意。
