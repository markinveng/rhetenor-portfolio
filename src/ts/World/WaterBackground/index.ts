import { getOrCreateWorld, disposeWorld } from "../index";
import { Water } from "../Water";

/**
 * WaterBackground を初期化し、後始末用のクリーンアップ関数を返す。
 * Scene/Camera/Rendererは共有Worldから取得し、WorkListのPlaneギャラリーと同じCanvasに統合する。
 */
export default function initWaterBackground(
  container: HTMLDivElement | null,
): () => void {
  if (!container) {
    return () => { };
  }

  const world = getOrCreateWorld(container);
  const water = new Water(world.scene);

  if (world.debugGUI) {
    water.registerGUI(world.debugGUI.addFolder("Water"));
  }

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

  const unregisterUpdate = world.registerUpdate(() => {
    water.update(
      (node, dispatchSize) =>
        world.renderPipeline.compute(node, dispatchSize),
      world.getPixelsToWorld(),
    );
  });

  return () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointerleave", handlePointerLeave);

    unregisterUpdate();
    water.dispose();

    /*
     * このCanvasを使うのはWaterBackground/WorkListのみのため、
     * ページ離脱時にまとめて解放する。
     */
    disposeWorld();
  };
}
