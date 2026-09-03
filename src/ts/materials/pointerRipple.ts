// three/tsl は @types/three にサブパスの型定義が無いため、any経由で受け取る(既存コードに準拠)。
// @ts-ignore
import * as TSL from "three/tsl";

const { vec2, length, smoothstep, sin, normalize, time } = TSL as any;

/** 波紋(リップル)の見た目パラメーター。数値は微調整しやすいよう独立させている。 */
const RIPPLE_RADIUS = 0.6;
const RIPPLE_FREQUENCY = 40;
const RIPPLE_SPEED = 3;
const RIPPLE_STRENGTH = 0.05;

/**
 * ホバー中のポインタ位置(pointerUv)を中心に、外向きに広がる波紋でUVを歪ませるオフセットを返す。
 * aspect(width/height。定数の数値でもuniformノードでもよい)で補正し、
 * 正方形でないPlaneでも輪が円形に見えるようにする。
 * hoverMix(0〜1)が0のときは常にゼロベクトルになる。
 */
export function computeRippleUvOffset(
  uvNode: any,
  pointerUv: any,
  aspect: any,
  hoverMix: any,
): any {
  const toPointer = vec2(
    uvNode.x.sub(pointerUv.x).mul(aspect),
    uvNode.y.sub(pointerUv.y),
  );

  const dist = length(toPointer);
  const wave = sin(dist.mul(RIPPLE_FREQUENCY).sub(time.mul(RIPPLE_SPEED)));
  const falloff = smoothstep(RIPPLE_RADIUS, 0.0, dist).mul(hoverMix);

  /*
   * ポインタ直下(dist=0)での正規化による特異点を避けるための微小オフセット。
   */
  const direction = normalize(toPointer.add(vec2(0.0001, 0.0001)));

  return direction.mul(wave).mul(falloff).mul(RIPPLE_STRENGTH);
}
