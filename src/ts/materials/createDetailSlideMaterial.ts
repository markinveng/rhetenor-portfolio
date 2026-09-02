import * as THREE from "three/webgpu";
// three/tsl は @types/three にサブパスの型定義が無いため、any経由で受け取る(既存コードに準拠)。
// @ts-ignore
import * as TSL from "three/tsl";
import gsap from "gsap";

const {
  Fn,
  texture,
  uv,
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  sin,
  fract,
  dot,
  mix,
  smoothstep,
  length,
} = TSL as any;

/** DOM版(.hover-invert-cursor__overlay)のcircle(70px)に合わせた半径(px)。 */
const INVERT_RADIUS_PX = 70;
/** ホバーマスクの縁のぼかし幅(UV比率)。 */
const HOVER_EDGE_SOFTNESS = 0.12;
/** ホバー時の色反転フェード時間。 */
const HOVER_FADE_DURATION = 0.3;

/** リビール演出(波打ちながら上から表示)のパラメーター。数値は微調整しやすいよう独立させている。 */
const REVEAL_WAVE_FREQUENCY = 14;
const REVEAL_WAVE_SPEED = 20;
const REVEAL_WAVE_AMPLITUDE = 0.02;
const REVEAL_GRAIN_SCALE = 260;
const REVEAL_GRAIN_STRENGTH = 0.14;
const REVEAL_EDGE_SOFTNESS = 0.04;
/** progressが0→1で動く間、しきい値がこの範囲(uv.y換算)を上から下へ掃引する。 */
const REVEAL_FRONT_START = 1.2;
const REVEAL_FRONT_END = -0.2;

export interface DetailSlideMaterialHandle {
  material: any;
  /** リビール進行度(0〜1)のuniform。GSAPで直接トゥイーンする想定。 */
  progress: any;
  setPlaneSize(worldWidth: number, worldHeight: number, pixelsToWorld: number): void;
  setPointerUv(u: number, v: number): void;
  setHoverActive(active: boolean): void;
  dispose(): void;
}

/**
 * 作品詳細のスライドPlane用マテリアル。
 * ・progress(0〜1)に応じて、粒状のノイズと横波でエッジを揺らしながら
 *   画像の上から下へ表示する「波打ちリビール」効果
 * ・ホバー時、DOM版HoverInvertCursorのcircle同様にUV円形マスクで色反転する効果
 * の2つをまとめて1つのcolorNodeで行う。
 */
export function createDetailSlideMaterial(map: any): DetailSlideMaterialHandle {
  const progress = uniform(0);
  const mouseUv = uniform(new THREE.Vector2(0.5, 0.5));
  const radiusUv = uniform(new THREE.Vector2(0.2, 0.2));
  const hoverMix = uniform(0);

  const material = new (THREE as any).MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    map,
  });

  material.colorNode = Fn(() => {
    const uvNode = uv();
    const baseColor = texture(map, uvNode);

    /*
     * リビールのエッジ位置(uv.y換算)。横波と粒状ノイズを足して
     * 直線ではなく波打つ・粒立ったエッジにする。
     */
    const front = float(REVEAL_FRONT_START).sub(
      progress.mul(REVEAL_FRONT_START - REVEAL_FRONT_END),
    );

    const wave = sin(
      uvNode.x.mul(REVEAL_WAVE_FREQUENCY).add(progress.mul(REVEAL_WAVE_SPEED)),
    ).mul(REVEAL_WAVE_AMPLITUDE);

    const grainSeed = uvNode.mul(REVEAL_GRAIN_SCALE);
    const grain = fract(
      sin(dot(grainSeed, vec2(12.9898, 78.233))).mul(43758.5453),
    ).sub(0.5).mul(REVEAL_GRAIN_STRENGTH);

    const edge = front.add(wave).add(grain);

    const revealMask = smoothstep(
      edge.sub(REVEAL_EDGE_SOFTNESS),
      edge.add(REVEAL_EDGE_SOFTNESS),
      uvNode.y,
    );

    /*
     * ホバー時の色反転(円形マスク)。DOM版と同じ計算。
     */
    const normalizedDist = length(uvNode.sub(mouseUv).div(radiusUv));
    const hoverMask = smoothstep(
      1.0,
      1.0 - HOVER_EDGE_SOFTNESS,
      normalizedDist,
    ).mul(hoverMix);

    const invertedRgb = vec3(1.0).sub(baseColor.rgb);
    const finalRgb = mix(baseColor.rgb, invertedRgb, hoverMask);

    return vec4(
      finalRgb.r,
      finalRgb.g,
      finalRgb.b,
      baseColor.a.mul(revealMask),
    );
  })();

  const hoverTween = { value: 0 };

  return {
    material,
    progress,

    setPlaneSize(worldWidth, worldHeight, pixelsToWorld) {
      const radiusWorld = INVERT_RADIUS_PX * pixelsToWorld;
      radiusUv.value.set(
        worldWidth > 0 ? radiusWorld / worldWidth : 0.2,
        worldHeight > 0 ? radiusWorld / worldHeight : 0.2,
      );
    },

    setPointerUv(u, v) {
      mouseUv.value.set(u, v);
    },

    setHoverActive(active) {
      gsap.to(hoverTween, {
        value: active ? 1 : 0,
        duration: HOVER_FADE_DURATION,
        overwrite: true,
        onUpdate: () => {
          hoverMix.value = hoverTween.value;
        },
      });
    },

    dispose() {
      material.dispose();
    },
  };
}
