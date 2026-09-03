import { getOrCreateWorld, disposeWorld } from "../index";

/**
 * WaterBackground を初期化し、後始末用のクリーンアップ関数を返す。
 * Water本体(計算・描画・常時のアンビエントフロー)は共有World自身が生成・所有しており
 * (World/index.ts参照)、このモジュールはポインタ入力をWaterへ橋渡しする薄いラッパーに徹する。
 */
export default function initWaterBackground(
  container: HTMLDivElement | null,
): () => void {
  if (!container) {
    return () => { };
  }

  const world = getOrCreateWorld(container);
  const water = world.water;

  const handlePointerMove = (event: PointerEvent): void => {
    water.updatePointer(
      event.clientX,
      event.clientY,
      world.cameraController.camera,
    );
  };

  const handlePointerDown = (): void => {
    water.setPointerDown(true);
  };

  const handlePointerUp = (): void => {
    water.setPointerDown(false);
  };

  const handlePointerLeave = (): void => {
    water.clearPointer();
  };

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointerleave", handlePointerLeave);

  return () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointerleave", handlePointerLeave);

    /*
     * このCanvasを使うのはWaterBackground/WorkListのみのため、
     * ページ離脱時にまとめて解放する(Water/RockBackdropの破棄はdisposeWorld内で行う)。
     */
    disposeWorld();
  };
}
