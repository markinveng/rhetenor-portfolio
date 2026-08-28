import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { UltraHDRLoader } from "three/addons/loaders/UltraHDRLoader.js";

import { CameraController } from "../../CameraController";
import { RenderPipeline } from "../../RenderPipeline";
import { Floor } from "../../Floor";
import { DebugGUI } from "../../DebugGUI";
import { Water } from "./Water";

export class WaterBackground {
  private container: HTMLDivElement;
  private scene: any;

  private cameraController: CameraController;
  private renderPipeline: RenderPipeline;
  private water: Water;
  private floor: Floor;
  private debugGui: DebugGUI;

  private controls: any;
  private axesHelper: any;

  private mouseNdc: any;
  private isMouseDown = false;

  constructor(container: HTMLDivElement) {
    this.container = container;

    this.initScene();

    this.cameraController = new CameraController(
      window.innerWidth / window.innerHeight
    );

    this.renderPipeline = new RenderPipeline(
      this.container,
      this.scene,
      this.cameraController.camera
    );

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambient);

    this.water = new Water(this.scene);
    this.floor = new Floor(this.scene);

    this.initHelpers();
    this.initControls();
    this.initEvents();

    this.debugGui = new DebugGUI();
    this.initGUI();

    this.renderPipeline.renderer.setAnimationLoop(this.animate);
  }

  /*-------------------------------
    initial setup (loading time)
  -------------------------------*/

  private initScene(): void {
    this.scene = new THREE.Scene();

    const hdrLoader = new UltraHDRLoader();
    hdrLoader.load("/textures/moonless_golf_2k.hdr.jpg", (texture: any) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.needsUpdate = true;
      this.scene.background = texture;
      this.scene.environment = texture;
    });
  }

  private initHelpers(): void {
    this.axesHelper = new THREE.AxesHelper(5);
    this.axesHelper.visible = this.debugGui?.params.showAxes ?? true;
    this.scene.add(this.axesHelper);
  }

  private initControls(): void {
    this.controls = new OrbitControls(
      this.cameraController.camera,
      this.renderPipeline.domElement
    );
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enabled = false;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.mouseNdc = new THREE.Vector2();
  }

  private initEvents(): void {
    window.addEventListener("pointermove", this.onPointerMove, {
      passive: true,
    });
    window.addEventListener("pointerdown", this.onPointerDown, {
      passive: true,
    });
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("blur", this.onPointerLeave);
    window.addEventListener("resize", this.onResize);
  }

  private initGUI(): void {
    const waveFolder = this.debugGui.addFolder("Wave");
    this.water.registerGUI(waveFolder);
    waveFolder.open();

    const cameraFolder = this.debugGui.addFolder("Camera");
    this.cameraController.registerGUI(cameraFolder);
    cameraFolder.open();

    this.debugGui.registerDebugFolder(
      (value: boolean) => {
        this.controls.enabled = value;
      },
      (value: boolean) => {
        this.axesHelper.visible = value;
      }
    );
  }

  /*-------------------------------
    pointer / resize events
  -------------------------------*/

  private setMouseCoords(event: PointerEvent): void {
    const rect = this.renderPipeline.domElement.getBoundingClientRect();
    this.mouseNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (event.isPrimary === false) {
      return;
    }

    this.setMouseCoords(event);
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.isMouseDown = true;
    this.setMouseCoords(event);
  };

  private onPointerUp = (): void => {
    this.isMouseDown = false;
    this.water.resetPointer();
  };

  private onPointerLeave = (): void => {
    this.water.resetPointer();
  };

  private onResize = (): void => {
    this.cameraController.resize(window.innerWidth / window.innerHeight);
    this.renderPipeline.resize();
  };

  /*-------------------------------
    per-frame update
  -------------------------------*/

  private animate = (): void => {
    this.water.raycast(
      this.cameraController.camera,
      this.mouseNdc,
      this.isMouseDown
    );

    this.water.update(
      (node, dispatchSize) => this.renderPipeline.compute(node, dispatchSize),
      this.isMouseDown
    );

    this.controls.update();
    this.renderPipeline.render();
  };

  /*-------------------------------
    teardown
  -------------------------------*/

  public dispose(): void {
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("blur", this.onPointerLeave);

    this.debugGui.dispose();
    this.axesHelper.geometry.dispose();
    this.axesHelper.material.dispose();
    this.controls.dispose();

    this.water.dispose();
    this.floor.dispose();
    this.renderPipeline.dispose();
  }
}

type Cleanup = () => void;

export default function initWaterBackground(
  container: HTMLDivElement | null
): Cleanup {
  if (!container || !("gpu" in navigator)) {
    return () => { };
  }

  const instance = new WaterBackground(container);
  return () => instance.dispose();
}
