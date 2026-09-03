import * as THREE from "three/webgpu";
import {
  Fn,
  vec3,
  float,
  positionLocal,
  clamp,
  transformNormalToView,
  int,
} from "three/tsl";
// three/tsl の型定義には texture/uv/mix/materialColor/vec2 が無いため、any経由で受け取る(既存コードに準拠)。
// @ts-ignore
import * as TSL from "three/tsl";
import {
  WaterCompute,
  WATER_WIDTH,
  WATER_BOUNDS_X,
  WATER_BOUNDS_Y,
} from "./WaterCompute/index";
import type { RockBackdrop } from "../WaterBackground/RockBackdrop";

const { texture, uv, mix, materialColor, vec2, sin, cos, dot, time } =
  TSL as any;

interface WaterParams {
  color: string;
  opacity: number;
  mouseSizeHover: number;
  mouseDeepHover: number;
  mouseSizeClick: number;
  mouseDeepClick: number;
  viscosity: number;
  simSpeed: number;
  /** 波の法線に沿って背景(岩盤)テクスチャのUVをずらす強さ。屈折っぽい歪みの量。 */
  refraction: number;
  /** 背景(岩盤)の色をどれだけ水の色(color)へ寄せるか(0=岩盤そのまま, 1=水の色のみ)。 */
  tint: number;
  /** 常時流れる波(アンビエントフロー)の向き。度数、0=+X、90=+Y。既定は右上から左下(225°)。 */
  flowAngle: number;
  /** アンビエントフローの空間周波数(波長の逆数に相当)。 */
  flowFrequency: number;
  /** アンビエントフローが流れる速さ。 */
  flowSpeed: number;
  /** アンビエントフローの高さ(振幅)。 */
  flowAmplitude: number;
}

/** WATER_BOUNDSぴったりだと画面端に隙間が出ることがあるための余白。 */
const OVERSCAN = 1.08;

export class Water {
  public mesh: any;
  public params: WaterParams = {
    color: "#99e0ff",
    opacity: 0.75,
    mouseSizeHover: 0.3,
    mouseDeepHover: 0.55,
    mouseSizeClick: 0.5,
    mouseDeepClick: 0.8,
    viscosity: 0.96,
    simSpeed: 6,
    refraction: 0.035,
    tint: 5,
    flowAngle: 238,
    flowFrequency: 1.5,
    flowSpeed: 2.0,
    flowAmplitude: 0.09,
  };

  private geometry: any;
  private material: any;
  private compute: WaterCompute;
  private readonly rockBackdrop: RockBackdrop;

  private pingPong = 0;
  private frameCounter = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private hasPointer = false;
  private isPointerDown = false;

  private readonly refractionUniform: any;
  private readonly tintUniform: any;

  private readonly flowAngleUniform: any;
  private readonly flowFrequencyUniform: any;
  private readonly flowSpeedUniform: any;
  private readonly flowAmplitudeUniform: any;

  /**
   * worldPosition(x,y) * worldToLocalScale = Waterのローカル座標(WATER_BOUNDS基準)。
   * update()で毎フレーム更新する。WorkListなど他モジュールがsampleWave()を使う際、
   * 自分のworld座標をこのuniformでWaterのローカル座標系へ変換するために公開している。
   */
  public readonly worldToLocalScale: any = TSL.uniform(new THREE.Vector2(1, 1));

  constructor(scene: any, rockBackdrop: RockBackdrop) {
    this.rockBackdrop = rockBackdrop;

    this.compute = new WaterCompute(
      this.params.mouseSizeHover,
      this.params.mouseDeepHover,
      this.params.viscosity
    );

    this.refractionUniform = TSL.uniform(this.params.refraction);
    this.tintUniform = TSL.uniform(this.params.tint);

    this.flowAngleUniform = TSL.uniform(
      THREE.MathUtils.degToRad(this.params.flowAngle),
    );
    this.flowFrequencyUniform = TSL.uniform(this.params.flowFrequency);
    this.flowSpeedUniform = TSL.uniform(this.params.flowSpeed);
    this.flowAmplitudeUniform = TSL.uniform(this.params.flowAmplitude);

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

    /*
     * Plane自体は縦(z)方向には動かさず、常にフラットなまま置く。
     * 波の見た目は法線(lighting)と屈折(colorNode)だけで表現する
     * (positionNodeでheightを反映すると、パースの影響でPlane全体が
     * 上下に揺れているように見えてしまうため)。
     */
    this.material.normalNode = Fn(() => {
      const wave = this.sampleWave(vec2(positionLocal.x, positionLocal.y));
      return transformNormalToView(
        vec3(wave.normalX.negate(), wave.normalY.negate(), float(1.0))
      ).toVertexStage();
    })();

    /*
     * 水面越しに岩盤(RockBackdrop)が見えるようにする。
     * 波の法線(normalX/Y、インタラクティブな波紋+常時のアンビエントフローの合成)でUVをずらして
     * 屈折っぽい歪みを出し、水の色(materialColor)を薄くtintするだけに留めることで、
     * Water単体の不透明な色面ではなく「透明な水を通して岩盤が揺らいで見える」表現にする。
     * Waterのuv()は画面全体を覆うPlaneのUVであるため、RockBackdropが計算した
     * cover-fit用uniform(coverUv)をそのまま共有して同じ位置の岩盤画素をサンプリングする。
     */
    this.material.colorNode = Fn(() => {
      const wave = this.sampleWave(vec2(positionLocal.x, positionLocal.y));

      const repeat = this.rockBackdrop.coverUv.xy;
      const offset = this.rockBackdrop.coverUv.zw;
      const distortion = vec2(wave.normalX, wave.normalY).mul(this.refractionUniform);

      const rockUv = uv().mul(repeat).add(offset).add(distortion);
      const rockColor = texture(this.rockBackdrop.getTexture(), rockUv);

      return mix(rockColor.rgb, materialColor, this.tintUniform);
    })();

    this.mesh = new THREE.Mesh(this.geometry, this.material);

    /*
     * WorkListのPlaneと同じz=0付近にあるため、透明オブジェクトの
     * 描画順が不定にならないよう明示的に背面へ回す。
     */
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  /**
   * Waterのローカル座標(WATER_BOUNDS基準、原点中心)から、計算用グリッドの添字を求める。
   * Water自身の頂点(positionLocal)だけでなく、他モジュールが自分のワールド座標を
   * worldToLocalScaleで変換した値を渡してサンプリングする用途にも使うため、
   * 引数はpositionLocalに固定せず任意のvec2ノードを受け取る。
   */
  private getGridIndexFromLocalPositionTSL(localPos: any): any {
    const x = clamp(
      localPos.x.add(WATER_BOUNDS_X * 0.5).div(WATER_BOUNDS_X).mul(WATER_WIDTH - 1),
      0.0,
      WATER_WIDTH - 1
    );
    const y = clamp(
      localPos.y
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
   * 指定したWaterローカル座標(localPos)における、水面の高さと法線(x/y方向の傾き)を返す。
   * インタラクティブな波紋シミュレーション(WaterCompute)と、常時流れるアンビエントフロー
   * (flowAngle/flowFrequency/flowSpeed/flowAmplitude)を合成した値。
   * Water自身のシェーダーだけでなく、WorkListのPlaneジオメトリを波に合わせて歪ませる用途にも
   * 使うため、public APIとして公開している(World経由でWaterを取得し、worldToLocalScaleで
   * ワールド座標をlocalPosへ変換してから呼び出す想定)。
   */
  public sampleWave(localPos: any): { height: any; normalX: any; normalY: any } {
    const gridIndex = this.getGridIndexFromLocalPositionTSL(localPos);

    const simHeight = this.compute.getCurrentHeight(gridIndex);
    const { normalX: simNormalX, normalY: simNormalY } =
      this.compute.getCurrentNormals(gridIndex);

    const direction = vec2(cos(this.flowAngleUniform), sin(this.flowAngleUniform));
    const phase = dot(localPos, direction)
      .mul(this.flowFrequencyUniform)
      .sub(time.mul(this.flowSpeedUniform));

    const flowHeight = sin(phase).mul(this.flowAmplitudeUniform);

    /*
     * 高さ = amplitude * sin(phase) の空間微分(傾き)。
     * d(phase)/d(localPos) = frequency * direction なので、
     * d(height)/d(localPos) = amplitude * frequency * cos(phase) * direction。
     * 法線は高さの勾配と逆向きになるためnegateしている。
     */
    const flowSlope = cos(phase)
      .mul(this.flowFrequencyUniform)
      .mul(this.flowAmplitudeUniform)
      .negate();

    return {
      height: simHeight.add(flowHeight),
      normalX: simNormalX.add(flowSlope.mul(direction.x)),
      normalY: simNormalY.add(flowSlope.mul(direction.y)),
    };
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

    /*
     * worldPos = positionLocal * mesh.scale の関係にあるため、
     * 他モジュールが自分のworld座標をWaterのローカル座標へ変換できるよう
     * 逆数(1/scale)を毎フレーム公開する。
     */
    this.worldToLocalScale.value.set(
      1 / this.mesh.scale.x,
      1 / this.mesh.scale.y,
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
    folder
      .add(this.params, "refraction", 0, 0.1, 0.005)
      .name("Refraction")
      .onChange((value: number) => {
        this.refractionUniform.value = value;
      });
    folder
      .add(this.params, "tint", 0, 10, 0.05)
      .name("Tint")
      .onChange((value: number) => {
        this.tintUniform.value = value;
      });

    const flowFolder = folder.addFolder("Ambient Flow");

    flowFolder
      .add(this.params, "flowAngle", 0, 360, 1)
      .name("Angle")
      .onChange((value: number) => {
        this.flowAngleUniform.value = THREE.MathUtils.degToRad(value);
      });
    flowFolder
      .add(this.params, "flowFrequency", 0.05, 1.5, 0.01)
      .name("Frequency")
      .onChange((value: number) => {
        this.flowFrequencyUniform.value = value;
      });
    flowFolder
      .add(this.params, "flowSpeed", 0, 2, 0.05)
      .name("Speed")
      .onChange((value: number) => {
        this.flowSpeedUniform.value = value;
      });
    flowFolder
      .add(this.params, "flowAmplitude", 0, 0.3, 0.01)
      .name("Amplitude")
      .onChange((value: number) => {
        this.flowAmplitudeUniform.value = value;
      });
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
