import * as THREE from "three/webgpu";
import { CameraController } from "../../CameraController";
import { RenderPipeline } from "../../RenderPipeline";
import { Water } from "../Water";
import { DebugGUI } from "../../DebugGUI";

/**
 * WaterBackground を初期化し、後始末用のクリーンアップ関数を返す。
 */
export default function initWaterBackground(
  container: HTMLDivElement | null,
): () => void {
  if (!container) {
    return () => { };
  }

  const scene = new THREE.Scene();

  const hemisphereLight = new THREE.HemisphereLight(0xbfe3ff, 0x1a2a33, 1.2);
  scene.add(hemisphereLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(6, 10, 8);
  scene.add(directionalLight);

  const cameraController = new CameraController(
    window.innerWidth / window.innerHeight,
  );

  const renderPipeline = new RenderPipeline(
    container,
    scene,
    cameraController.camera,
  );

  const water = new Water(scene);

  let debugGUI: DebugGUI | null = null;

  if (import.meta.env.DEV) {
    debugGUI = new DebugGUI();

    water.registerGUI(debugGUI.addFolder("Water"));
    cameraController.registerGUI(debugGUI.addFolder("Camera"));
  }

  renderPipeline.renderer.setAnimationLoop(() => {
    water.update(
      (node, dispatchSize) => renderPipeline.compute(node, dispatchSize),
      false,
    );

    renderPipeline.render();
  });

  const handleResize = (): void => {
    cameraController.resize(window.innerWidth / window.innerHeight);
    renderPipeline.resize();
  };

  window.addEventListener("resize", handleResize);

  return () => {
    window.removeEventListener("resize", handleResize);

    water.dispose();
    renderPipeline.dispose();
    debugGUI?.dispose();
  };
}
