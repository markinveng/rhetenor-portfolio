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

export class Water {
  public mesh: any;
  public params: WaterParams = {
    color: "#99e0ff",
    opacity: 0.9,
    mouseSizeHover: 0.12,
    mouseDeepHover: 0.5,
    mouseSizeClick: 0.2,
    mouseDeepClick: 0.8,
    viscosity: 0.96,
    simSpeed: 5,
  };

  private geometry: any;
  private material: any;
  private compute: WaterCompute;

  private pingPong = 0;
  private frameCounter = 0;

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

  public update(renderPipelineCompute: (node: any, dispatchSize: readonly [number, number, number]) => void, isMouseDown: boolean): void {
    this.compute.mouseSize.value = isMouseDown
      ? this.params.mouseSizeClick
      : this.params.mouseSizeHover;
    this.compute.mouseDeep.value = isMouseDown
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
