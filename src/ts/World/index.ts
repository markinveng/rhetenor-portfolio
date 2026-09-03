import * as THREE from "three/webgpu";
import { CameraController } from "../CameraController";
import { RenderPipeline } from "../RenderPipeline";
import { DebugGUI } from "../DebugGUI";
import { Water } from "./Water";
import { RockBackdrop } from "./WaterBackground/RockBackdrop";

export interface WorldContext {
  /** THREE.Scene(three/webgpuには@types/threeのサブパス型定義が無いためany)。 */
  scene: any;
  cameraController: CameraController;
  renderPipeline: RenderPipeline;
  debugGUI: DebugGUI | null;
  /**
   * WaterBackground/WorkListが共有するWaterインスタンス。sampleWave()で
   * 水面の高さ・法線をサンプリングできる(WorkListのPlaneジオメトリの歪みに使用)。
   */
  water: Water;
  /** 毎フレーム呼ばれるコールバックを登録する。戻り値の関数で解除できる。 */
  registerUpdate(fn: (delta: number) => void): () => void;
  /** 現在のカメラ視点で、z=0平面上のpx→world単位への変換係数。 */
  getPixelsToWorld(): number;
}

let context: WorldContext | null = null;
let rockBackdrop: RockBackdrop | null = null;
let updateFns: Array<(delta: number) => void> = [];
let lastTime = 0;
let resizeHandler: (() => void) | null = null;

/**
 * WaterBackground と WorkList(Plane版ギャラリー)が同じCanvas/Sceneを
 * 共有するための唯一の入り口。最初に呼ばれたときだけシーン一式を作る。
 */
export function getOrCreateWorld(container: HTMLDivElement): WorldContext {
  if (context) {
    return context;
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

  const debugGUI = import.meta.env.DEV ? new DebugGUI() : null;

  if (debugGUI) {
    cameraController.registerGUI(debugGUI.addFolder("Camera"));
  }

  function computePixelsToWorld(): number {
    const camera = cameraController.camera;
    const distance = camera.position.z;
    const fovRad = (camera.fov * Math.PI) / 180;
    const visibleHeight = 2 * Math.tan(fovRad / 2) * distance;

    return visibleHeight / window.innerHeight;
  }

  /*
   * Waterは常時流れるアンビエントフローを持つため、WaterBackground/WorkListの
   * どちらが先に初期化されても同じインスタンスを参照できるよう、
   * 共有World自身が生成・所有する(WaterBackgroundは薄いラッパーとしてポインタ入力を渡すだけ)。
   */
  rockBackdrop = new RockBackdrop(scene);
  const water = new Water(scene, rockBackdrop);

  if (debugGUI) {
    water.registerGUI(debugGUI.addFolder("Water"));
  }

  renderPipeline.renderer.setAnimationLoop((time: number) => {
    const delta = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;

    updateFns.forEach((fn) => fn(delta));
    renderPipeline.render();
  });

  resizeHandler = (): void => {
    cameraController.resize(window.innerWidth / window.innerHeight);
    renderPipeline.resize();
  };

  window.addEventListener("resize", resizeHandler);

  context = {
    scene,
    cameraController,
    renderPipeline,
    debugGUI,
    water,

    registerUpdate(fn) {
      updateFns.push(fn);

      return () => {
        updateFns = updateFns.filter((registered) => registered !== fn);
      };
    },

    getPixelsToWorld: computePixelsToWorld,
  };

  context.registerUpdate(() => {
    const pixelsToWorld = computePixelsToWorld();

    rockBackdrop?.update(pixelsToWorld);
    water.update(
      (node, dispatchSize) => renderPipeline.compute(node, dispatchSize),
      pixelsToWorld,
    );
  });

  return context;
}

export function getWorld(): WorldContext | null {
  return context;
}

/**
 * Canvasごとページから離脱するときに呼ぶ。次回 getOrCreateWorld() で作り直される。
 */
export function disposeWorld(): void {
  if (!context) {
    return;
  }

  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }

  context.renderPipeline.renderer.setAnimationLoop(null);
  context.water.dispose();
  rockBackdrop?.dispose();
  rockBackdrop = null;
  context.renderPipeline.dispose();
  context.debugGUI?.dispose();

  updateFns = [];
  lastTime = 0;
  context = null;
}
