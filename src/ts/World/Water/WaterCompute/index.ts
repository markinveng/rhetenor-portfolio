import {
  Fn,
  length,
  vec2,
  float,
  uniform,
  clamp,
  max,
  min,
  instanceIndex,
  instancedArray,
  uint,
  int,
  cos,
  select,
} from "three/tsl";
import * as THREE from "three/webgpu";

export const WATER_WIDTH = 128;

/** 16:9相当の比率。実際の見た目のサイズはWater側でmesh.scaleにより画面へ合わせる。 */
export const WATER_BOUNDS_X = 32;
export const WATER_BOUNDS_Y = 18;

export class WaterCompute {
  public mousePos: any;
  public mouseSpeed: any;
  public mouseSize: any;
  public mouseDeep: any;
  public viscosity: any;

  private heightStorageA: any;
  private heightStorageB: any;
  private prevHeightStorage: any;
  private readFromA: any;

  public computeHeightAtoB: any;
  public computeHeightBtoA: any;
  public readonly dispatchSize: readonly [number, number, number] = [
    WATER_WIDTH / 8,
    WATER_WIDTH / 8,
    1,
  ];

  constructor(mouseSizeInit: number, mouseDeepInit: number, viscosityInit: number) {
    const initialHeights = new Float32Array(WATER_WIDTH * WATER_WIDTH);

    this.heightStorageA = instancedArray(initialHeights);
    this.heightStorageB = instancedArray(new Float32Array(initialHeights));
    this.prevHeightStorage = instancedArray(new Float32Array(initialHeights));
    this.readFromA = uniform(1);

    this.mousePos = uniform(new THREE.Vector2());
    this.mouseSpeed = uniform(new THREE.Vector2());
    this.mouseSize = uniform(mouseSizeInit);
    this.mouseDeep = uniform(mouseDeepInit);
    this.viscosity = uniform(viscosityInit);

    this.computeHeightAtoB = this.createComputeHeight(
      this.heightStorageA,
      this.heightStorageB
    );
    this.computeHeightBtoA = this.createComputeHeight(
      this.heightStorageB,
      this.heightStorageA
    );
  }

  private getNeighborIndicesTSL(index: any): {
    northIndex: any;
    southIndex: any;
    eastIndex: any;
    westIndex: any;
  } {
    const width = uint(WATER_WIDTH);
    const x = int(index.mod(WATER_WIDTH));
    const y = int(index.div(WATER_WIDTH));

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

    return {
      north: store.element(northIndex),
      south: store.element(southIndex),
      east: store.element(eastIndex),
      west: store.element(westIndex),
    };
  }

  private createComputeHeight(readBuffer: any, writeBuffer: any): any {
    return Fn(() => {
      const height = readBuffer.element(instanceIndex).toVar();
      const prevHeight = this.prevHeightStorage.element(instanceIndex).toVar();

      const { north, south, east, west } = this.getNeighborValuesTSL(
        instanceIndex,
        readBuffer
      );

      const neighborHeight = north.add(south).add(east).add(west);
      neighborHeight.mulAssign(0.5);
      neighborHeight.subAssign(prevHeight);

      let newHeight = neighborHeight.mul(this.viscosity);

      const x = float(instanceIndex.mod(WATER_WIDTH)).mul(1 / WATER_WIDTH);
      const y = float(instanceIndex.div(WATER_WIDTH)).mul(1 / WATER_WIDTH);
      const centerVec = vec2(0.5, 0.5);

      const worldPos2 = vec2(x, y)
        .sub(centerVec)
        .mul(vec2(WATER_BOUNDS_X, -WATER_BOUNDS_Y));

      const mousePhase = clamp(
        length(worldPos2.sub(this.mousePos)).mul(Math.PI).div(this.mouseSize),
        0.0,
        Math.PI
      );

      newHeight = newHeight.add(
        cos(mousePhase).add(1.0).mul(this.mouseDeep).mul(this.mouseSpeed.length())
      );

      this.prevHeightStorage.element(instanceIndex).assign(height);
      writeBuffer.element(instanceIndex).assign(newHeight);
    })().compute(WATER_WIDTH * WATER_WIDTH);
  }

  public getCurrentHeight(index: any): any {
    return select(
      this.readFromA,
      this.heightStorageA.element(index),
      this.heightStorageB.element(index)
    );
  }

  public getCurrentNormals(index: any): { normalX: any; normalY: any } {
    const { northIndex, southIndex, eastIndex, westIndex } =
      this.getNeighborIndicesTSL(index);

    const north = this.getCurrentHeight(northIndex);
    const south = this.getCurrentHeight(southIndex);
    const east = this.getCurrentHeight(eastIndex);
    const west = this.getCurrentHeight(westIndex);

    return {
      normalX: west.sub(east).mul(WATER_WIDTH / WATER_BOUNDS_X),
      normalY: south.sub(north).mul(WATER_WIDTH / WATER_BOUNDS_Y),
    };
  }

  public step(pingPong: number): void {
    this.readFromA.value = pingPong === 0 ? 0 : 1;
  }

  public getComputeNode(pingPong: number): any {
    return pingPong === 0 ? this.computeHeightAtoB : this.computeHeightBtoA;
  }
}
