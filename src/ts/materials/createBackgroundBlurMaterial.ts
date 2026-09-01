import * as THREE from "three/webgpu";
// three/tsl は @types/three にサブパスの型定義が無いため、any経由で受け取る(既存コードに準拠)。
// @ts-ignore
import * as TSL from "three/tsl";

const {
  Fn,
  texture,
  uv,
  vec2,
  vec4,
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

/**
 * WorkListのサムネイルPlane用マテリアル。
 * mapはTextureLoader.load()の戻り値(画像ロード前でも同一インスタンス)をそのまま渡してよい。
 * blurAmount(uniform, 0〜1)は作品詳細を開いている間、背景全体をぼかすために使う。
 */
export function createBackgroundBlurMaterial(map: any, blurAmount: any): any {
  const material = new (THREE as any).MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });

  material.map = map;

  material.colorNode = Fn(() => {
    const uvNode = uv();
    const offset = blurAmount.mul(MAX_BLUR_UV_OFFSET);

    const sum = vec4(0, 0, 0, 0).toVar();

    BLUR_TAP_OFFSETS.forEach(([dx, dy]) => {
      sum.addAssign(texture(map, uvNode.add(vec2(dx, dy).mul(offset))));
    });

    const averaged = sum.div(BLUR_TAP_OFFSETS.length);

    return vec4(
      averaged.r.mul(materialColor.r),
      averaged.g.mul(materialColor.g),
      averaged.b.mul(materialColor.b),
      averaged.a.mul(materialOpacity),
    );
  })();

  return material;
}
