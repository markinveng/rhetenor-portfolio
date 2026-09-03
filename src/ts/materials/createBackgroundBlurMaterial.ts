import * as THREE from "three/webgpu";
// three/tsl は @types/three にサブパスの型定義が無いため、any経由で受け取る(既存コードに準拠)。
// @ts-ignore
import * as TSL from "three/tsl";
import gsap from "gsap";
import { computeRippleUvOffset } from "./pointerRipple";
import type { Water } from "../World/Water";

const {
  Fn,
  texture,
  uv,
  uniform,
  vec2,
  vec4,
  modelPosition,
  materialColor,
  materialOpacity,
} = TSL as any;

/** 3x3ボックスブラーのサンプルオフセット。blurAmount=0では全サンプルが同一UVになり通常表示と等価。 */
const BLUR_TAP_OFFSETS: Array<[number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

/** blurAmount=1のときの最大UVオフセット。数値は微調整しやすいよう独立させている。 */
const MAX_BLUR_UV_OFFSET = 0.03;

/** ホバー時の波紋の強さがフェードイン/アウトする時間。 */
const RIPPLE_FADE_DURATION = 0.3;

/**
 * WaterのsampleWave()が返す法線(x/y方向の傾き)を、テクスチャのサンプリングUVへ
 * ずらす強さ。Plane自体は動かさず、Water/index.tsのcolorNodeと同じ「屈折」の考え方で
 * サムネイル画像だけを波紋に合わせて歪ませる。
 */
const WATER_REFRACTION_STRENGTH = 0.05;

export interface BackgroundBlurMaterialHandle {
  material: any;
  /** ホバー中のポインタ位置(UV)を更新する。波紋の中心として使われる。 */
  setPointerUv(u: number, v: number): void;
  /** ホバーの有効/無効を切り替える。波紋の強さをGSAPでフェードする。 */
  setHoverActive(active: boolean): void;
}

/**
 * WorkListのサムネイルPlane用マテリアル。
 * mapはTextureLoader.load()の戻り値(画像ロード前でも同一インスタンス)をそのまま渡してよい。
 * blurAmount(uniform, 0〜1)は作品詳細を開いている間、背景全体をぼかすために使う。
 * aspectRatio(幅/高さ)は波紋を円形に見せるための補正に使う。
 * water(WaterBackgroundと共有するWaterインスタンス)のsampleWave()でPlane自身の
 * ワールド座標における水面の法線を取得し、サムネイル画像を波紋に合わせて屈折させる
 * (Plane自体のジオメトリは動かさない)。WaterBackgroundを含まないページでは
 * water(共有World.water)がnullになるため、その場合は屈折を無効化する。
 */
export function createBackgroundBlurMaterial(
  map: any,
  blurAmount: any,
  aspectRatio: number,
  water: Water | null,
): BackgroundBlurMaterialHandle {
  const material = new (THREE as any).MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });

  material.map = map;

  const pointerUv = uniform(new THREE.Vector2(0.5, 0.5));
  const hoverMix = uniform(0);

  material.colorNode = Fn(() => {
    const uvNode = uv();

    /*
     * Plane自体は動かさず、WaterBackgroundの波紋(インタラクティブな波紋+常時の
     * アンビエントフロー)に合わせてサムネイル画像だけを屈折させる。
     * このPlane自身の(画面上の)ワールド座標をWaterのローカル座標系へ変換し、
     * Waterと同じ高さ場から法線を取り出してサンプリングUVをずらす。
     * waterがない(WaterBackgroundを含まないページ)場合は屈折オフセットなし。
     */
    let refractionOffset = vec2(0, 0);

    if (water) {
      const localXY = modelPosition.xy.mul(water.worldToLocalScale);
      const wave = water.sampleWave(localXY);
      refractionOffset = vec2(wave.normalX, wave.normalY).mul(
        WATER_REFRACTION_STRENGTH,
      );
    }

    const rippleOffset = computeRippleUvOffset(
      uvNode,
      pointerUv,
      aspectRatio,
      hoverMix,
    );
    const warpedUv = uvNode.add(rippleOffset).add(refractionOffset);

    const offset = blurAmount.mul(MAX_BLUR_UV_OFFSET);

    const sum = vec4(0, 0, 0, 0).toVar();

    BLUR_TAP_OFFSETS.forEach(([dx, dy]) => {
      sum.addAssign(texture(map, warpedUv.add(vec2(dx, dy).mul(offset))));
    });

    const averaged = sum.div(BLUR_TAP_OFFSETS.length);

    return vec4(
      averaged.r.mul(materialColor.r),
      averaged.g.mul(materialColor.g),
      averaged.b.mul(materialColor.b),
      averaged.a.mul(materialOpacity),
    );
  })();

  const hoverTween = { value: 0 };

  return {
    material,

    setPointerUv(u, v) {
      pointerUv.value.set(u, v);
    },

    setHoverActive(active) {
      gsap.to(hoverTween, {
        value: active ? 1 : 0,
        duration: RIPPLE_FADE_DURATION,
        overwrite: true,
        onUpdate: () => {
          hoverMix.value = hoverTween.value;
        },
      });
    },
  };
}
