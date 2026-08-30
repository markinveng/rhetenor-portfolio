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

  const unregisterUpdate = world.registerUpdate(() => {
    water.update(
      (node, dispatchSize) =>
        world.renderPipeline.compute(node, dispatchSize),
      false,
    );
  });

  return () => {
    unregisterUpdate();
    water.dispose();

    /*
     * このCanvasを使うのはWaterBackground/WorkListのみのため、
     * ページ離脱時にまとめて解放する。
     */
    disposeWorld();
  };
}
