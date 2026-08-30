import * as THREE from "three/webgpu";
// three/webgpu・three/tsl は @types/three にサブパスの型定義が無いため、
// 名前付きimportの型チェックが通らない(実行時には問題なく存在する)。
// 既存コード(RenderPipeline/Water等)にならい any 経由で受け取る。
// @ts-ignore
import * as TSL from "three/tsl";
import gsap from "gsap";

const {
  Fn,
  texture,
  uv,
  uniform,
  mix,
  smoothstep,
  length,
  vec3,
  vec4,
} = TSL as any;

/** DOM版(.hover-invert-cursor__overlay)の circle(70px) に合わせた半径(px)。 */
const INVERT_RADIUS_PX = 70;
/** マスクの縁のぼかし幅(UV比率の単位で、円の内側/外側の遷移帯)。 */
const EDGE_SOFTNESS = 0.12;

export interface HoverInvertMaterialHandle {
  material: any;
  /**
   * このPlaneのworld上のサイズ(width/height)に合わせて、
   * 70px相当のUV半径を再計算する。リサイズ・レイアウト変更時に呼ぶ。
   */
  setPlaneSize(worldWidth: number, worldHeight: number, pixelsToWorld: number): void;
  /** raycastで得たヒットUV座標を反映する(即時)。 */
  setPointerUv(u: number, v: number): void;
  /** ホバーイン/アウトを滑らかにフェードさせる。 */
  setActive(active: boolean): void;
  /** Plane全体の不透明度(0〜1)。フェードイン/アウト演出用。 */
  setOpacity(value: number, animate?: boolean): void;
  dispose(): void;
}

/**
 * UV空間の円形マスクでテクスチャの色を反転させるMeshBasicNodeMaterial。
 * WorkDetailのスライドPlaneで、DOM版HoverInvertCursorのclip-path(circle)の
 * 代替として使う。
 *
 * texture画像/動画はロード完了前でも THREE.Texture / THREE.VideoTexture の
 * インスタンス自体は同期的に得られるため、ロード完了を待たずに渡してよい。
 */
export function createHoverInvertMaterial(
  map: any,
): HoverInvertMaterialHandle {
  const mouseUv = uniform(new THREE.Vector2(0.5, 0.5));
  const radiusUv = uniform(new THREE.Vector2(0.2, 0.2));
  const mixAmount = uniform(0);
  const opacity = uniform(1);

  const material = new (THREE as any).MeshBasicNodeMaterial({
    transparent: true,
    map,
  });

  material.colorNode = Fn(() => {
    const uvNode = uv();
    const baseColor = texture(map, uvNode);

    const normalizedDist = length(
      uvNode.sub(mouseUv).div(radiusUv),
    );

    const mask = smoothstep(1.0, 1.0 - EDGE_SOFTNESS, normalizedDist).mul(
      mixAmount,
    );

    const invertedRgb = vec3(1.0).sub(baseColor.rgb);
    const finalRgb = mix(baseColor.rgb, invertedRgb, mask);

    return vec4(finalRgb, baseColor.a.mul(opacity));
  })();

  const activeTween = { value: 0 };
  const opacityTween = { value: 1 };

  return {
    material,

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

    setActive(active) {
      gsap.to(activeTween, {
        value: active ? 1 : 0,
        duration: 0.3,
        overwrite: true,
        onUpdate: () => {
          mixAmount.value = activeTween.value;
        },
      });
    },

    setOpacity(value, animate = true) {
      if (!animate) {
        gsap.killTweensOf(opacityTween);
        opacityTween.value = value;
        opacity.value = value;
        return;
      }

      gsap.to(opacityTween, {
        value,
        duration: 0.4,
        overwrite: true,
        onUpdate: () => {
          opacity.value = opacityTween.value;
        },
      });
    },

    dispose() {
      gsap.killTweensOf(activeTween);
      gsap.killTweensOf(opacityTween);
      material.dispose();
    },
  };
}
