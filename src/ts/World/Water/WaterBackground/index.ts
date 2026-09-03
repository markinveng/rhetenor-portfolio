import { getOrCreateWorld, disposeWorld } from "../../index";
import { Water } from "../index";
import { RockBackdrop } from "./RockBackdrop";

/**
 * WaterBackground を初期化し、後始末用のクリーンアップ関数を返す。
 * トップページ専用の部品。Water本体(計算・描画・常時のアンビエントフロー)と
 * RockBackdropはここで生成し、共有World(registerWater)へ登録することで、
 * 同じCanvas/Sceneを使うWorkListのPlaneからもsampleWave()経由で参照できるようにする。
 * discoverページなどWaterBackgroundを含まないページでは、共有Worldは
 * Scene/Camera/Rendererのみを持ち、Waterは生成されない。
 */
export default function initWaterBackground(
  container: HTMLDivElement | null,
): () => void {
  if (!container) {
    return () => { };
  }

  const world = getOrCreateWorld(container);

  const rockBackdrop = new RockBackdrop(world.scene);
  const water = new Water(world.scene, rockBackdrop);

  world.registerWater(water, rockBackdrop);

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
    const pixelsToWorld = world.getPixelsToWorld();

    rockBackdrop.update(pixelsToWorld);
    water.update(
      (node, dispatchSize) =>
        world.renderPipeline.compute(node, dispatchSize),
      pixelsToWorld,
    );
  });

  return () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointerleave", handlePointerLeave);

    unregisterUpdate();

    /*
     * このCanvasを使うのはWaterBackground/WorkListのみのため、
     * ページ離脱時にまとめて解放する(Water/RockBackdropの破棄はdisposeWorld内で行う)。
     */
    disposeWorld();
  };
}
