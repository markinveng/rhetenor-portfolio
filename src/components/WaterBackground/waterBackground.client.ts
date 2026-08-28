import * as THREE from "three/webgpu";
import GUI from "lil-gui";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  Fn,
  length,
  vec2,
  vec3,
  float,
  uniform,
  positionLocal,
  clamp,
  max,
  min,
  pass,
  renderOutput,
  instanceIndex,
  instancedArray,
  uint,
  int,
  cos,
  transformNormalToView,
  select,
} from "three/tsl";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import { UltraHDRLoader } from "three/addons/loaders/UltraHDRLoader.js";

interface WaterBackgroundParams {
  color: string;
  opacity: number;
  fov: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  showAxes: boolean;
  enableOrbit: boolean;
  mouseSizeHover: number;
  mouseDeepHover: number;
  mouseSizeClick: number;
  mouseDeepClick: number;
  viscosity: number;
  simSpeed: number;
}

const WIDTH = 128;
const BOUNDS_X = 30;
const BOUNDS_Y = 20;

export class WaterBackground {
  private container: HTMLDivElement;

  // core
  private scene: any;
  private camera: any;
  private renderer: any;
  private postProcessing: any;

  // params (also bound to GUI)
  private params: WaterBackgroundParams = {
    color: "#99e0ff",
    opacity: 0.9,
    fov: 30,
    cameraX: 0,
    cameraY: 0,
    cameraZ: 40,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    showAxes: true,
    enableOrbit: false,
    mouseSizeHover: 0.12,
    mouseDeepHover: 0.5,
    mouseSizeClick: 0.2,
    mouseDeepClick: 0.8,
    viscosity: 0.96,
    simSpeed: 5,
  };

  // compute (wave simulation)
  private heightStorageA: any;
  private heightStorageB: any;
  private prevHeightStorage: any;
  private readFromA: any;
  private mousePos: any;
  private mouseSpeed: any;
  private mouseSize: any;
  private mouseDeep: any;
  private viscosity: any;
  private computeHeightAtoB: any;
  private computeHeightBtoA: any;
  private computeDispatchSize: readonly [number, number, number];

  // water / floor / helpers
  private waterGeometry: any;
  private waterMaterial: any;
  private water: any;
  private floorGeometry: any;
  private floorMaterial: any;
  private floor: any;
  private axesHelper: any;

  // controls / interaction
  private controls: any;
  private raycaster: any;
  private interactionPlane: any;
  private intersectionPointWorld: any;
  private intersectionPointLocal: any;
  private mouseNdc: any;
  private lastMouseWorld: any;
  private hasLastMouseWorld = false;
  private isMouseDown = false;

  // gui
  private gui: any;

  // sim loop state
  private pingPong = 0;
  private frameCounter = 0;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.computeDispatchSize = [WIDTH / 8, WIDTH / 8, 1];

    this.initScene();
    this.initCamera();
    this.initRenderer();
    this.initPostProcessing();
    this.initCompute();
    this.initWater();
    this.initFloor();
    this.initHelpers();
    this.initControls();
    this.initEvents();
    this.initGUI();

    this.renderer.setAnimationLoop(this.animate);
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

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambient);
  }

  private initCamera(): void {
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    this.updateCamera();
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGPURenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    this.renderer.setClearAlpha(0);
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";
  }

  private initPostProcessing(): void {
    this.postProcessing = new (THREE as any).RenderPipeline(this.renderer);
    this.postProcessing.outputColorTransform = false;

    const scenePass = pass(this.scene, this.camera);
    const outputPass = renderOutput(scenePass);
    const fxaaPass = fxaa(outputPass);
    this.postProcessing.outputNode = fxaaPass;
  }

  private initCompute(): void {
    const initialHeights = new Float32Array(WIDTH * WIDTH);

    this.heightStorageA = instancedArray(initialHeights);
    this.heightStorageB = instancedArray(new Float32Array(initialHeights));
    this.prevHeightStorage = instancedArray(new Float32Array(initialHeights));

    this.readFromA = uniform(1);

    this.mousePos = uniform(new THREE.Vector2());
    this.mouseSpeed = uniform(new THREE.Vector2());
    this.mouseSize = uniform(this.params.mouseSizeHover);
    this.mouseDeep = uniform(this.params.mouseDeepHover);
    this.viscosity = uniform(this.params.viscosity);

    this.computeHeightAtoB = this.createComputeHeight(
      this.heightStorageA,
      this.heightStorageB
    );
    this.computeHeightBtoA = this.createComputeHeight(
      this.heightStorageB,
      this.heightStorageA
    );
  }

  private initWater(): void {
    this.waterGeometry = new THREE.PlaneGeometry(
      BOUNDS_X,
      BOUNDS_Y,
      WIDTH - 1,
      WIDTH - 1
    );

    this.waterMaterial = new (THREE as any).MeshStandardNodeMaterial({
      color: new THREE.Color(this.params.color),
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: this.params.opacity,
      side: THREE.DoubleSide,
    });

    this.waterMaterial.normalNode = Fn(() => {
      const { normalX, normalY } = this.getCurrentNormals(
        this.getGridIndexFromPositionTSL()
      );
      return transformNormalToView(
        vec3(normalX.negate(), normalY.negate(), float(1.0))
      ).toVertexStage();
    })();

    this.waterMaterial.positionNode = Fn(() => {
      const h = this.getCurrentHeight(this.getGridIndexFromPositionTSL());
      return vec3(positionLocal.x, positionLocal.y, h);
    })();

    this.water = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    this.scene.add(this.water);
  }

  private initFloor(): void {
    this.floorGeometry = new THREE.PlaneGeometry(30, 20, 1, 1);
    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.floor = new THREE.Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.position.z = -0.4;
    this.scene.add(this.floor);
  }

  private initHelpers(): void {
    this.axesHelper = new THREE.AxesHelper(5);
    this.axesHelper.visible = this.params.showAxes;
    this.scene.add(this.axesHelper);
  }

  private initControls(): void {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enabled = this.params.enableOrbit;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.raycaster = new THREE.Raycaster();
    this.interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.intersectionPointWorld = new THREE.Vector3();
    this.intersectionPointLocal = new THREE.Vector3();
    this.mouseNdc = new THREE.Vector2();
    this.lastMouseWorld = new THREE.Vector2();
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
    this.gui = new GUI();

    const waveFolder = this.gui.addFolder("Wave");
    waveFolder
      .add(this.params, "opacity", 0.3, 1.0, 0.05)
      .name("Opacity")
      .onChange((value: number) => {
        this.waterMaterial.opacity = value;
      });
    waveFolder
      .add(this.params, "mouseSizeHover", 0.05, 0.3, 0.01)
      .name("Hover Size");
    waveFolder
      .add(this.params, "mouseDeepHover", 0.1, 1.0, 0.05)
      .name("Hover Deep");
    waveFolder
      .add(this.params, "mouseSizeClick", 0.1, 0.5, 0.01)
      .name("Click Size");
    waveFolder
      .add(this.params, "mouseDeepClick", 0.2, 1.5, 0.05)
      .name("Click Deep");
    waveFolder
      .add(this.params, "viscosity", 0.9, 0.99, 0.001)
      .name("Viscosity")
      .onChange((value: number) => {
        this.viscosity.value = value;
      });
    waveFolder.add(this.params, "simSpeed", 1, 6, 1).name("Sim Speed");
    waveFolder.open();

    const cameraFolder = this.gui.addFolder("Camera");
    cameraFolder
      .add(this.params, "cameraX", -50, 50, 0.1)
      .name("Pos X")
      .onChange(this.updateCamera);
    cameraFolder
      .add(this.params, "cameraY", -50, 50, 0.1)
      .name("Pos Y")
      .onChange(this.updateCamera);
    cameraFolder
      .add(this.params, "cameraZ", -50, 50, 0.1)
      .name("Pos Z")
      .onChange(this.updateCamera);
    cameraFolder
      .add(this.params, "targetX", -20, 20, 0.1)
      .name("LookAt X")
      .onChange(this.updateCamera);
    cameraFolder
      .add(this.params, "targetY", -20, 20, 0.1)
      .name("LookAt Y")
      .onChange(this.updateCamera);
    cameraFolder
      .add(this.params, "targetZ", -20, 20, 0.1)
      .name("LookAt Z")
      .onChange(this.updateCamera);
    cameraFolder
      .add(this.params, "fov", 20, 100, 1)
      .name("FOV")
      .onChange(this.updateCamera);
    cameraFolder.open();

    const debugFolder = this.gui.addFolder("Debug");
    debugFolder
      .add(this.params, "enableOrbit")
      .name("OrbitControls")
      .onChange((value: boolean) => {
        this.controls.enabled = value;
      });
    debugFolder
      .add(this.params, "showAxes")
      .name("AxesHelper")
      .onChange((value: boolean) => {
        this.axesHelper.visible = value;
      });
    debugFolder.open();
  }

  /*-------------------------------
    TSL helpers (wave simulation)
  -------------------------------*/

  private getNeighborIndicesTSL(index: any): {
    northIndex: any;
    southIndex: any;
    eastIndex: any;
    westIndex: any;
  } {
    const width = uint(WIDTH);
    const x = int(index.mod(WIDTH));
    const y = int(index.div(WIDTH));

    const leftX = max(0, x.sub(1));
    const rightX = min(x.add(1), width.sub(1));

    const bottomY = max(0, y.sub(1));
    const topY = min(y.add(1), width.sub(1));

    const westIndex = y.mul(width).add(leftX);
    const eastIndex = y.mul(width).add(rightX);
    const southIndex = bottomY.mul(width).add(x);
    const northIndex = topY.mul(width).add(x);

    return { northIndex, southIndex, eastIndex, westIndex };
  }

  private getNeighborValuesTSL(
    index: any,
    store: any
  ): { north: any; south: any; east: any; west: any } {
    const { northIndex, southIndex, eastIndex, westIndex } =
      this.getNeighborIndicesTSL(index);

    const north = store.element(northIndex);
    const south = store.element(southIndex);
    const east = store.element(eastIndex);
    const west = store.element(westIndex);

    return { north, south, east, west };
  }

  private createComputeHeight(readBuffer: any, writeBuffer: any): any {
    return Fn(() => {
      const height = readBuffer.element(instanceIndex).toVar();
      const prevHeight = this.prevHeightStorage
        .element(instanceIndex)
        .toVar();

      const { north, south, east, west } = this.getNeighborValuesTSL(
        instanceIndex,
        readBuffer
      );

      const neighborHeight = north.add(south).add(east).add(west);
      neighborHeight.mulAssign(0.5);
      neighborHeight.subAssign(prevHeight);

      let newHeight = neighborHeight.mul(this.viscosity);

      const x = float(instanceIndex.mod(WIDTH)).mul(1 / WIDTH);
      const y = float(instanceIndex.div(WIDTH)).mul(1 / WIDTH);
      const centerVec = vec2(0.5, 0.5);

      const worldPos2 = vec2(x, y)
        .sub(centerVec)
        .mul(vec2(BOUNDS_X, -BOUNDS_Y));

      const mousePhase = clamp(
        length(worldPos2.sub(this.mousePos)).mul(Math.PI).div(this.mouseSize),
        0.0,
        Math.PI
      );

      newHeight = newHeight.add(
        cos(mousePhase)
          .add(1.0)
          .mul(this.mouseDeep)
          .mul(this.mouseSpeed.length())
      );

      this.prevHeightStorage.element(instanceIndex).assign(height);
      writeBuffer.element(instanceIndex).assign(newHeight);
    })().compute(WIDTH * WIDTH);
  }

  private getCurrentHeight(index: any): any {
    return select(
      this.readFromA,
      this.heightStorageA.element(index),
      this.heightStorageB.element(index)
    );
  }

  private getCurrentNormals(index: any): { normalX: any; normalY: any } {
    const { northIndex, southIndex, eastIndex, westIndex } =
      this.getNeighborIndicesTSL(index);

    const north = this.getCurrentHeight(northIndex);
    const south = this.getCurrentHeight(southIndex);
    const east = this.getCurrentHeight(eastIndex);
    const west = this.getCurrentHeight(westIndex);

    const normalX = west.sub(east).mul(WIDTH / BOUNDS_X);
    const normalY = south.sub(north).mul(WIDTH / BOUNDS_Y);

    return { normalX, normalY };
  }

  private getGridIndexFromPositionTSL(): any {
    const x = clamp(
      positionLocal.x.add(BOUNDS_X * 0.5).div(BOUNDS_X).mul(WIDTH - 1),
      0.0,
      WIDTH - 1
    );
    const y = clamp(
      positionLocal.y
        .negate()
        .add(BOUNDS_Y * 0.5)
        .div(BOUNDS_Y)
        .mul(WIDTH - 1),
      0.0,
      WIDTH - 1
    );

    const xIndex = int(x.add(0.5));
    const yIndex = int(y.add(0.5));

    return yIndex.mul(WIDTH).add(xIndex);
  }

  /*-------------------------------
    camera
  -------------------------------*/

  private updateCamera = (): void => {
    this.camera.fov = this.params.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      this.params.cameraX,
      this.params.cameraY,
      this.params.cameraZ
    );
    this.camera.lookAt(
      this.params.targetX,
      this.params.targetY,
      this.params.targetZ
    );
  };

  /*-------------------------------
    pointer / resize events
  -------------------------------*/

  private setMouseCoords(event: PointerEvent): void {
    if (!this.renderer) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
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
    this.hasLastMouseWorld = false;
  };

  private onPointerUp = (): void => {
    this.isMouseDown = false;
    this.hasLastMouseWorld = false;
    this.mouseSpeed.value.set(0, 0);
  };

  private onPointerLeave = (): void => {
    this.hasLastMouseWorld = false;
    this.mouseSpeed.value.set(0, 0);
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    if (this.renderer) {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  };

  /*-------------------------------
    per-frame update
  -------------------------------*/

  private raycast(): void {
    if (!this.renderer) {
      return;
    }

    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    const intersectsPlane = this.raycaster.ray.intersectPlane(
      this.interactionPlane,
      this.intersectionPointWorld
    );

    if (intersectsPlane) {
      this.intersectionPointLocal.copy(this.intersectionPointWorld);
      this.water.worldToLocal(this.intersectionPointLocal);

      const isInsideX =
        Math.abs(this.intersectionPointLocal.x) <= BOUNDS_X * 0.5;
      const isInsideY =
        Math.abs(this.intersectionPointLocal.y) <= BOUNDS_Y * 0.5;

      if (isInsideX && isInsideY) {
        const current = new THREE.Vector2(
          this.intersectionPointLocal.x,
          this.intersectionPointLocal.y
        );

        if (!this.hasLastMouseWorld) {
          this.lastMouseWorld.copy(current);
          this.hasLastMouseWorld = true;
        }

        const dx = current.x - this.lastMouseWorld.x;
        const dy = current.y - this.lastMouseWorld.y;

        this.mousePos.value.set(current.x, current.y);

        const strengthScale = this.isMouseDown ? 1.0 : 0.4;
        this.mouseSpeed.value.set(dx * strengthScale, dy * strengthScale);

        this.lastMouseWorld.copy(current);
        return;
      }
    }

    this.hasLastMouseWorld = false;
    this.mouseSpeed.value.set(0, 0);
  }

  private animate = (): void => {
    if (!this.renderer || !this.postProcessing) {
      return;
    }

    if (this.isMouseDown) {
      this.mouseSize.value = this.params.mouseSizeClick;
      this.mouseDeep.value = this.params.mouseDeepClick;
    } else {
      this.mouseSize.value = this.params.mouseSizeHover;
      this.mouseDeep.value = this.params.mouseDeepHover;
    }

    this.raycast();

    this.frameCounter += 1;
    const frameThreshold = 7 - this.params.simSpeed;
    if (this.frameCounter >= frameThreshold) {
      if (this.pingPong === 0) {
        this.renderer.compute(
          this.computeHeightAtoB,
          this.computeDispatchSize
        );
        this.readFromA.value = 0;
      } else {
        this.renderer.compute(
          this.computeHeightBtoA,
          this.computeDispatchSize
        );
        this.readFromA.value = 1;
      }
      this.pingPong = 1 - this.pingPong;
      this.frameCounter = 0;
    }

    this.controls.update();
    this.postProcessing.render();
  };

  /*-------------------------------
    teardown
  -------------------------------*/

  public dispose(): void {
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
    }

    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("blur", this.onPointerLeave);
    this.gui.destroy();

    if (this.renderer && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(
        this.renderer.domElement
      );
    }

    this.waterGeometry.dispose();
    this.waterMaterial.dispose();
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
    this.axesHelper.geometry.dispose();
    this.axesHelper.material.dispose();
    this.controls.dispose();

    this.renderer = null;
    this.postProcessing = null;
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
