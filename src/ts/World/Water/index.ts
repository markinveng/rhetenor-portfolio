import * as THREE from "three/webgpu";
import { Fn, vec3, float, positionLocal, clamp, transformNormalToView, int } from "three/tsl";
import {
  WaterCompute,
  WATER_WIDTH,
  WATER_BOUNDS_X,
  WATER_BOUNDS_Y,
} from "./WaterCompute/index";

interface WaterParams {
  color: string;
  opacity: number;
  mouseSizeHover: number;
  mouseDeepHover: number;
  mouseSizeClick: number;
  mouseDeepClick: number;
  viscosity: number;
  simSpeed: number;
}

/** WATER_BOUNDSぴったりだと画面端に隙間が出ることがあるための余白。 */
const OVERSCAN = 1.08;

export class Water {
  public mesh: any;
  public params: WaterParams = {
    color: "#99e0ff",
    opacity: 0.5,
    mouseSizeHover: 0.3,
    mouseDeepHover: 0.55,
    mouseSizeClick: 0.5,
    mouseDeepClick: 0.8,
    viscosity: 0.96,
    simSpeed: 6,
  };

  private geometry: any;
  private material: any;
  private compute: WaterCompute;

  private pingPong = 0;
  private frameCounter = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private hasPointer = false;
  private isPointerDown = false;

  constructor(scene: any) {
    this.compute = new WaterCompute(
      this.params.mouseSizeHover,
      this.params.mouseDeepHover,
      this.params.viscosity
    );

    this.geometry = new THREE.PlaneGeometry(
      WATER_BOUNDS_X,
      WATER_BOUNDS_Y,
      WATER_WIDTH - 1,
      WATER_WIDTH - 1
    );

    this.material = new (THREE as any).MeshStandardNodeMaterial({
      color: new THREE.Color(this.params.color),
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: this.params.opacity,
      side: THREE.DoubleSide,
      /*
       * 画面全体を覆う大きさにした際、WorkListのPlane(同じz付近)と
       * 深度テストが拮ち合い残存して見えなくなるのを防ぐ。
       */
      depthWrite: false,
    });

    this.material.normalNode = Fn(() => {
      const { normalX, normalY } = this.compute.getCurrentNormals(
        this.getGridIndexFromPositionTSL()
      );
      return transformNormalToView(
        vec3(normalX.negate(), normalY.negate(), float(1.0))
      ).toVertexStage();
    })();

    this.material.positionNode = Fn(() => {
      const h = this.compute.getCurrentHeight(this.getGridIndexFromPositionTSL());
      return vec3(positionLocal.x, positionLocal.y, h);
    })();

    this.mesh = new THREE.Mesh(this.geometry, this.material);

    /*
     * WorkListのPlaneと同じz=0付近にあるため、透明オブジェクトの
     * 描画順が不定にならないよう明示的に背面へ回す。
     */
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  private getGridIndexFromPositionTSL(): any {
    const x = clamp(
      positionLocal.x.add(WATER_BOUNDS_X * 0.5).div(WATER_BOUNDS_X).mul(WATER_WIDTH - 1),
      0.0,
      WATER_WIDTH - 1
    );
    const y = clamp(
      positionLocal.y
        .negate()
        .add(WATER_BOUNDS_Y * 0.5)
        .div(WATER_BOUNDS_Y)
        .mul(WATER_WIDTH - 1),
      0.0,
      WATER_WIDTH - 1
    );

    const xIndex = int(x.add(0.5));
    const yIndex = int(y.add(0.5));

    return yIndex.mul(WATER_WIDTH).add(xIndex);
  }

  /**
   * 画面上のポインタ座標をraycasterでWaterのローカル座標に変換し、波紋の発生源として渡す。
   * mesh.worldToLocal()で変換するため、mesh.scale(画面サイズへの拡大)の影響を受けない。
   */
  public updatePointer(clientX: number, clientY: number, camera: any): void {
    this.pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, camera);

    const hit = this.raycaster.intersectObject(this.mesh, false)[0];

    if (!hit) {
      return;
    }

    const local = this.mesh.worldToLocal(hit.point.clone());

    if (this.hasPointer) {
      this.compute.mouseSpeed.value.set(
        local.x - this.compute.mousePos.value.x,
        local.y - this.compute.mousePos.value.y,
      );
    }

    this.compute.mousePos.value.set(local.x, local.y);
    this.hasPointer = true;
  }

  public setPointerDown(isDown: boolean): void {
    this.isPointerDown = isDown;
  }

  /**
   * ポインタが画面外に出たときに波紋の勢いを止める。
   */
  public clearPointer(): void {
    this.hasPointer = false;
    this.compute.mouseSpeed.value.set(0, 0);
  }

  public update(renderPipelineCompute: (node: any, dispatchSize: readonly [number, number, number]) => void, pixelsToWorld: number): void {
    const visibleWidth = pixelsToWorld * window.innerWidth;
    const visibleHeight = pixelsToWorld * window.innerHeight;

    /*
     * WATER_BOUNDS_X/Yはcompute側の固定座標系のため、
     * 見た目のサイズはmesh.scaleで画面いっぱいに広げる。
     */
    this.mesh.scale.set(
      (visibleWidth / WATER_BOUNDS_X) * OVERSCAN,
      (visibleHeight / WATER_BOUNDS_Y) * OVERSCAN,
      1,
    );

    this.compute.mouseSize.value = this.isPointerDown
      ? this.params.mouseSizeClick
      : this.params.mouseSizeHover;
    this.compute.mouseDeep.value = this.isPointerDown
      ? this.params.mouseDeepClick
      : this.params.mouseDeepHover;

    this.frameCounter += 1;
    const frameThreshold = 7 - this.params.simSpeed;
    if (this.frameCounter >= frameThreshold) {
      renderPipelineCompute(
        this.compute.getComputeNode(this.pingPong),
        this.compute.dispatchSize
      );
      this.compute.step(this.pingPong);
      this.pingPong = 1 - this.pingPong;
      this.frameCounter = 0;
    }
  }

  public registerGUI(folder: any): void {
    folder
      .addColor(this.params, "color")
      .name("Color")
      .onChange((value: string) => {
        this.material.color.set(value);
      });
    folder
      .add(this.params, "opacity", 0.3, 1.0, 0.05)
      .name("Opacity")
      .onChange((value: number) => {
        this.material.opacity = value;
      });
    folder.add(this.params, "mouseSizeHover", 0.05, 0.3, 0.01).name("Hover Size");
    folder.add(this.params, "mouseDeepHover", 0.1, 1.0, 0.05).name("Hover Deep");
    folder.add(this.params, "mouseSizeClick", 0.1, 0.5, 0.01).name("Click Size");
    folder.add(this.params, "mouseDeepClick", 0.2, 1.5, 0.05).name("Click Deep");
    folder
      .add(this.params, "viscosity", 0.9, 0.99, 0.001)
      .name("Viscosity")
      .onChange((value: number) => {
        this.compute.viscosity.value = value;
      });
    folder.add(this.params, "simSpeed", 1, 6, 1).name("Sim Speed");
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
