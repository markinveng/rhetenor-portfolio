import * as THREE from "three";
import * as THREEWebGPU from "three/webgpu";
import GUI from "lil-gui";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  Fn,
  clamp,
  cos,
  float,
  instancedArray,
  instanceIndex,
  int,
  length,
  max,
  min,
  pass,
  positionLocal,
  renderOutput,
  select,
  transformNormalToView,
  uint,
  uniform,
  vec2,
  vec3,
  vertexIndex,
} from "three/tsl";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import { UltraHDRLoader } from "three/addons/loaders/UltraHDRLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type WaterBackgroundCleanup = () => void;

export default function initWaterBackground(
  container: HTMLDivElement | null
): WaterBackgroundCleanup {
  if (!container || !("gpu" in navigator)) return () => { };

  const scene = new THREE.Scene();

  const hdrLoader = new UltraHDRLoader();
  hdrLoader.load(
    "/textures/moonless_golf_2k.hdr.jpg",
    (texture: THREE.Texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.needsUpdate = true;
      scene.background = texture;
      scene.environment = texture;
    }
  );

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  const params = {
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
    modelUrl: "/models/PFsite.glb",
    modelTargetSize: 10,
    modelScale: 1,
    modelX: 0,
    modelY: 0,
    modelZ: -0.8,
    modelRotX: 0,
    modelRotY: 0,
    modelRotZ: 0,
    mouseSizeHover: 0.12,
    mouseDeepHover: 0.5,
    mouseSizeClick: 0.2,
    mouseDeepClick: 0.8,
    viscosity: 0.96,
    simSpeed: 5,
  };

  const updateCamera = (): void => {
    camera.fov = params.fov;
    camera.updateProjectionMatrix();
    camera.position.set(params.cameraX, params.cameraY, params.cameraZ);
    camera.lookAt(params.targetX, params.targetY, params.targetZ);
  };
  updateCamera();

  let renderer: any = new (THREEWebGPU as any).WebGPURenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.setClearAlpha(0);
  container.appendChild(renderer.domElement);

  let postProcessing: any = new (THREEWebGPU as any).PostProcessing(renderer);
  postProcessing.outputColorTransform = false;

  const scenePass = pass(scene, camera);
  const outputPass = renderOutput(scenePass);
  const fxaaPass = fxaa(outputPass);
  postProcessing.outputNode = fxaaPass;

  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  let modelRoot: THREE.Object3D | null = null;
  const placeModel = (): void => {
    if (!modelRoot) return;

    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const fitScale = params.modelTargetSize / maxAxis;

    modelRoot.scale.setScalar(fitScale * params.modelScale);

    box.setFromObject(modelRoot);
    const center = new THREE.Vector3();
    box.getCenter(center);
    modelRoot.position.set(-center.x, -center.y, -center.z);

    modelRoot.position.x += params.modelX;
    modelRoot.position.y += params.modelY;
    modelRoot.position.z += params.modelZ;
    modelRoot.rotation.set(params.modelRotX, params.modelRotY, params.modelRotZ);

    modelRoot.updateMatrixWorld(true);
  };

  const gltfLoader = new GLTFLoader();
  gltfLoader.load(
    params.modelUrl,
    (gltf: any) => {
      modelRoot = gltf.scene;
      if (modelRoot) modelRoot.name = "PFsite";

      modelRoot?.traverse((obj: any) => {
        if (obj && obj.isMesh) obj.frustumCulled = true;
      });

      placeModel();
      if (modelRoot) scene.add(modelRoot);
    },
    undefined,
    (error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("Failed to load GLB:", error);
    }
  );

  const WIDTH = 128;
  const BOUNDS_X = 30;
  const BOUNDS_Y = 20;

  const initialHeights = new Float32Array(WIDTH * WIDTH);
  for (let i = 0; i < initialHeights.length; i++) {
    initialHeights[i] = (Math.random() - 0.5) * 0.02;
  }

  const heightStorageA = instancedArray(initialHeights);
  const heightStorageB = instancedArray(new Float32Array(initialHeights));
  const prevHeightStorage = instancedArray(new Float32Array(initialHeights));

  const readFromA = uniform(1);

  const getNeighborIndicesTSL = (index: any): {
    northIndex: any;
    southIndex: any;
    eastIndex: any;
    westIndex: any;
  } => {
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
  };

  const getNeighborValuesTSL = (
    index: any,
    store: any
  ): {
    north: any;
    south: any;
    east: any;
    west: any;
  } => {
    const { northIndex, southIndex, eastIndex, westIndex } =
      getNeighborIndicesTSL(index);

    const north = store.element(northIndex);
    const south = store.element(southIndex);
    const east = store.element(eastIndex);
    const west = store.element(westIndex);

    return { north, south, east, west };
  };

  const mousePos = uniform(new THREE.Vector2());
  const mouseSpeed = uniform(new THREE.Vector2());
  const mouseSize = uniform(params.mouseSizeHover);
  const mouseDeep = uniform(params.mouseDeepHover);
  const viscosity = uniform(params.viscosity);

  const createComputeHeight = (readBuffer: any, writeBuffer: any): any =>
    Fn(() => {
      const height = readBuffer.element(instanceIndex).toVar();
      const prevHeight = prevHeightStorage.element(instanceIndex).toVar();

      const { north, south, east, west } = getNeighborValuesTSL(
        instanceIndex,
        readBuffer
      );

      const neighborHeight = north.add(south).add(east).add(west);
      neighborHeight.mulAssign(0.5);
      neighborHeight.subAssign(prevHeight);

      let newHeight = neighborHeight.mul(viscosity);

      const x = float(instanceIndex.mod(WIDTH)).mul(1 / WIDTH);
      const y = float(instanceIndex.div(WIDTH)).mul(1 / WIDTH);
      const centerVec = vec2(0.5, 0.5);

      const worldPos2 = vec2(x, y).sub(centerVec).mul(vec2(BOUNDS_X, -BOUNDS_Y));

      const mousePhase = clamp(
        length(worldPos2.sub(mousePos)).mul(Math.PI).div(mouseSize),
        0.0,
        Math.PI
      );

      newHeight = newHeight.add(
        cos(mousePhase).add(1.0).mul(mouseDeep).mul(mouseSpeed.length())
      );

      prevHeightStorage.element(instanceIndex).assign(height);
      writeBuffer.element(instanceIndex).assign(newHeight);
    })().compute(WIDTH * WIDTH);

  const computeHeightAtoB = createComputeHeight(heightStorageA, heightStorageB);
  const computeHeightBtoA = createComputeHeight(heightStorageB, heightStorageA);

  const getCurrentHeight = (index: any): any => {
    return select(
      readFromA,
      heightStorageA.element(index),
      heightStorageB.element(index)
    );
  };

  const getCurrentNormals = (index: any): { normalX: any; normalY: any } => {
    const { northIndex, southIndex, eastIndex, westIndex } =
      getNeighborIndicesTSL(index);

    const north = getCurrentHeight(northIndex);
    const south = getCurrentHeight(southIndex);
    const east = getCurrentHeight(eastIndex);
    const west = getCurrentHeight(westIndex);

    const normalX = west.sub(east).mul(WIDTH / BOUNDS_X);
    const normalY = south.sub(north).mul(WIDTH / BOUNDS_Y);

    return { normalX, normalY };
  };

  const waterGeometry = new THREE.PlaneGeometry(BOUNDS_X, BOUNDS_Y, WIDTH - 1, WIDTH - 1);

  const waterMaterial = new (THREEWebGPU as any).MeshStandardNodeMaterial({
    color: new THREE.Color(params.color),
    metalness: 0.9,
    roughness: 0.1,
    transparent: true,
    opacity: params.opacity,
    side: THREE.DoubleSide,
  });

  waterMaterial.normalNode = Fn(() => {
    const { normalX, normalY } = getCurrentNormals(vertexIndex);
    return transformNormalToView(
      vec3(normalX.negate(), normalY.negate(), float(1.0))
    ).toVertexStage();
  })();

  waterMaterial.positionNode = Fn(() => {
    const h = getCurrentHeight(vertexIndex);
    return vec3(positionLocal.x, positionLocal.y, h);
  })();

  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  scene.add(water);

  const floorGeometry = new THREE.PlaneGeometry(30, 20, 1, 1);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.position.z = -0.4;
  scene.add(floor);

  const axesHelper = new THREE.AxesHelper(5);
  axesHelper.visible = params.showAxes;
  scene.add(axesHelper);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enabled = params.enableOrbit;
  controls.target.set(0, 0, 0);
  controls.update();

  const raycaster = new THREE.Raycaster();
  const mouseNdc = new THREE.Vector2();
  const lastMouseWorld = new THREE.Vector2();
  let hasLastMouseWorld = false;
  let isMouseDown = false;

  const setMouseCoords = (event: PointerEvent): void => {
    if (!renderer) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouseNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.isPrimary === false) return;
    setMouseCoords(event);
  };

  const onPointerDown = (event: PointerEvent): void => {
    isMouseDown = true;
    setMouseCoords(event);
    hasLastMouseWorld = false;
  };

  const onPointerUp = (): void => {
    isMouseDown = false;
    hasLastMouseWorld = false;
    mouseSpeed.value.set(0, 0);
  };

  renderer.domElement.style.touchAction = "none";
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  const onResize = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  const gui = new GUI();

  const waveFolder = gui.addFolder("Wave");
  waveFolder
    .add(params, "opacity", 0.3, 1.0, 0.05)
    .name("Opacity")
    .onChange((v: number) => {
      waterMaterial.opacity = v;
    });
  waveFolder
    .add(params, "mouseSizeHover", 0.05, 0.3, 0.01)
    .name("Hover Size")
    .onChange((v: number) => {
      params.mouseSizeHover = v;
    });
  waveFolder
    .add(params, "mouseDeepHover", 0.1, 1.0, 0.05)
    .name("Hover Deep")
    .onChange((v: number) => {
      params.mouseDeepHover = v;
    });
  waveFolder
    .add(params, "mouseSizeClick", 0.1, 0.5, 0.01)
    .name("Click Size")
    .onChange((v: number) => {
      params.mouseSizeClick = v;
    });
  waveFolder
    .add(params, "mouseDeepClick", 0.2, 1.5, 0.05)
    .name("Click Deep")
    .onChange((v: number) => {
      params.mouseDeepClick = v;
    });
  waveFolder
    .add(params, "viscosity", 0.9, 0.99, 0.001)
    .name("Viscosity")
    .onChange((v: number) => {
      viscosity.value = v;
    });
  waveFolder.add(params, "simSpeed", 1, 6, 1).name("Sim Speed");
  waveFolder.open();

  const cameraFolder = gui.addFolder("Camera");
  cameraFolder.add(params, "cameraX", -50, 50, 0.1).name("Pos X").onChange(updateCamera);
  cameraFolder.add(params, "cameraY", -50, 50, 0.1).name("Pos Y").onChange(updateCamera);
  cameraFolder.add(params, "cameraZ", -50, 50, 0.1).name("Pos Z").onChange(updateCamera);
  cameraFolder.add(params, "targetX", -20, 20, 0.1).name("LookAt X").onChange(updateCamera);
  cameraFolder.add(params, "targetY", -20, 20, 0.1).name("LookAt Y").onChange(updateCamera);
  cameraFolder.add(params, "targetZ", -20, 20, 0.1).name("LookAt Z").onChange(updateCamera);
  cameraFolder.add(params, "fov", 20, 100, 1).name("FOV").onChange(updateCamera);
  cameraFolder.open();

  const debugFolder = gui.addFolder("Debug");
  debugFolder
    .add(params, "enableOrbit")
    .name("OrbitControls")
    .onChange((v: boolean) => {
      controls.enabled = v;
    });
  debugFolder
    .add(params, "showAxes")
    .name("AxesHelper")
    .onChange((v: boolean) => {
      axesHelper.visible = v;
    });
  debugFolder.open();

  const modelFolder = gui.addFolder("Model");
  modelFolder.add(params, "modelScale", 0.1, 5.0, 0.01).name("Scale").onChange(() => placeModel());
  modelFolder.add(params, "modelX", -30, 30, 0.01).name("Pos X").onChange(() => placeModel());
  modelFolder.add(params, "modelY", -30, 30, 0.01).name("Pos Y").onChange(() => placeModel());
  modelFolder.add(params, "modelZ", -30, 30, 0.01).name("Pos Z").onChange(() => placeModel());
  modelFolder
    .add(params, "modelRotX", -Math.PI, Math.PI, 0.01)
    .name("Rot X")
    .onChange(() => placeModel());
  modelFolder
    .add(params, "modelRotY", -Math.PI, Math.PI, 0.01)
    .name("Rot Y")
    .onChange(() => placeModel());
  modelFolder
    .add(params, "modelRotZ", -Math.PI, Math.PI, 0.01)
    .name("Rot Z")
    .onChange(() => placeModel());
  modelFolder.open();

  let pingPong = 0;
  let frameCounter = 0;

  const raycast = (): void => {
    if (!renderer) return;

    raycaster.setFromCamera(mouseNdc, camera);
    const intersects = raycaster.intersectObject(water);

    if (intersects.length > 0) {
      const p = intersects[0].point;
      const current = new THREE.Vector2(p.x, p.y);

      if (!hasLastMouseWorld) {
        lastMouseWorld.copy(current);
        hasLastMouseWorld = true;
      }

      const dx = current.x - lastMouseWorld.x;
      const dy = current.y - lastMouseWorld.y;

      mousePos.value.set(current.x, current.y);

      const strengthScale = isMouseDown ? 1.0 : 0.4;
      mouseSpeed.value.set(dx * strengthScale, dy * strengthScale);

      lastMouseWorld.copy(current);
    } else {
      hasLastMouseWorld = false;
      mouseSpeed.value.set(0, 0);
    }
  };

  const animate = (): void => {
    if (!renderer || !postProcessing) return;

    if (isMouseDown) {
      mouseSize.value = params.mouseSizeClick;
      mouseDeep.value = params.mouseDeepClick;
    } else {
      mouseSize.value = params.mouseSizeHover;
      mouseDeep.value = params.mouseDeepHover;
    }

    raycast();

    frameCounter++;
    const frameThreshold = 7 - params.simSpeed;
    if (frameCounter >= frameThreshold) {
      if (pingPong === 0) {
        (renderer as any).compute(computeHeightAtoB, [8, 8, 1]);
        readFromA.value = 0;
      } else {
        (renderer as any).compute(computeHeightBtoA, [8, 8, 1]);
        readFromA.value = 1;
      }
      pingPong = 1 - pingPong;
      frameCounter = 0;
    }

    controls.update();
    postProcessing.render();
  };
  renderer.setAnimationLoop(animate);

  return () => {
    if (renderer) renderer.setAnimationLoop(null);

    window.removeEventListener("resize", onResize);

    if (renderer) {
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    }

    window.removeEventListener("pointerup", onPointerUp);

    gui.destroy();

    if (renderer && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }

    waterGeometry.dispose();
    waterMaterial.dispose();
    floorGeometry.dispose();
    floorMaterial.dispose();
    axesHelper.geometry.dispose();
    (axesHelper.material as THREE.Material).dispose();
    controls.dispose();

    if (modelRoot) {
      scene.remove(modelRoot);
      modelRoot.traverse((obj: any) => {
        if (obj && obj.isMesh) {
          if (obj.geometry) obj.geometry.dispose();
          const material = obj.material;
          if (Array.isArray(material)) {
            material.forEach((m) => m && m.dispose && m.dispose());
          } else if (material && material.dispose) {
            material.dispose();
          }
        }
      });
      modelRoot = null;
    }

    renderer = null;
    postProcessing = null;
  };
}
