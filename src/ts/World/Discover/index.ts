import * as THREE from "three/webgpu";
import gsap from "gsap";
// gsap の型定義がWindows上で大文字小文字の衝突を起こすため抑制 (see: WorkList/index.tsと同様)
// @ts-ignore
import { Draggable } from "gsap/Draggable";
// @ts-ignore
import { InertiaPlugin } from "gsap/InertiaPlugin";

import { getOrCreateWorld, disposeWorld, type WorldContext } from "../index";

gsap.registerPlugin(Draggable, InertiaPlugin);

/** Planeの横幅を画面幅の何倍にするか(=横スクロールできる距離。単位: 画面幅)。 */
const PLANE_WIDTH_IN_VIEWPORTS = 5;

/** ホイール操作をドラッグ位置へなめらかに反映させる際の時間・イージング。 */
const WHEEL_EASE_DURATION = 0.6;
const WHEEL_EASE = "power2.out";

/**
 * discoverページの背景。横に長いPlaneMeshへwhite_background.jpgをwidthに合わせて
 * 繰り返し表示し、ドラッグ/ホイールで横スクロールできるようにする。
 * WaterBackground/WorkListと同じ「共有Worldへ登録する薄いラッパー」の考え方に倣い、
 * Scene/Camera/Rendererの生成・破棄は共有Worldに委ねる。
 */
export class DiscoverGallery {
  private readonly root: HTMLElement;

  private world: WorldContext | null = null;
  private readonly group = new THREE.Group();

  private geometry: any = null;
  private material: any = null;
  private texture: any = null;
  private mesh: any = null;

  private draggable: Draggable | null = null;

  /**
   * root(ヒットテスト層)自体を動かすと、click/pointer判定に使う
   * getBoundingClientRectごとビューポート外へずれてしまうため、
   * Draggableの移動対象は別要素にし、rootはtriggerとしてのみ使う(WorkListと同じ理由)。
   */
  private readonly dragProxy = document.createElement("div");

  private planeWidthPx = 0;

  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  public init(): void {
    this.world = getOrCreateWorld(this.root as HTMLDivElement);
    this.world.scene.add(this.group);

    this.dragProxy.style.position = "fixed";
    this.dragProxy.style.top = "0";
    this.dragProxy.style.left = "0";
    this.dragProxy.style.width = "0";
    this.dragProxy.style.height = "0";
    this.dragProxy.style.pointerEvents = "none";
    document.body.appendChild(this.dragProxy);

    this.buildPlane();
    this.layout();
    this.initDrag();
    this.initWheel();
    this.initResizeObserver();
  }

  /**
   * PlaneGeometryは1x1の単位サイズで作り、実サイズはmesh.scaleで表現する(WorkListと同様)。
   * テクスチャはPlaneの横幅ぶん繰り返し表示し、横スクロールの見た目を可視化する。
   */
  private buildPlane(): void {
    this.geometry = new THREE.PlaneGeometry(1, 1);

    this.texture = new THREE.TextureLoader().load(
      "/assets/white_background.jpg",
      (loaded: any) => {
        loaded.colorSpace = THREE.SRGBColorSpace;
      },
    );
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.repeat.set(PLANE_WIDTH_IN_VIEWPORTS, 1);

    this.material = new (THREE as any).MeshBasicNodeMaterial({
      map: this.texture,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);

    /*
     * 共有Worldは常にWaterを持つ(World/index.ts参照)。Waterと同じz=0付近だと
     * 半透明なWaterがこの白背景の上に重なって見えてしまうため、
     * カメラ側へわずかに寄せて深度テストで確実に隠す。
     */
    this.mesh.position.z = 0.5;

    this.group.add(this.mesh);
  }

  /**
   * Planeを画面いっぱいの高さ・画面幅のPLANE_WIDTH_IN_VIEWPORTS倍の横幅で配置する。
   * 初期状態(スクロール前)でPlaneの左端が画面左端に来るようにする。
   */
  private layout(): void {
    if (!this.world || !this.mesh) {
      return;
    }

    const pixelsToWorld = this.world.getPixelsToWorld();
    const viewportWidthPx = window.innerWidth;
    const viewportHeightPx = window.innerHeight;

    this.planeWidthPx = viewportWidthPx * PLANE_WIDTH_IN_VIEWPORTS;

    const planeWidthWorld = this.planeWidthPx * pixelsToWorld;
    const planeHeightWorld = viewportHeightPx * pixelsToWorld;
    const viewportWidthWorld = viewportWidthPx * pixelsToWorld;

    this.mesh.scale.set(planeWidthWorld, planeHeightWorld, 1);
    this.mesh.position.x = planeWidthWorld / 2 - viewportWidthWorld / 2;
  }

  /**
   * 横方向のみドラッグ可能にする。x/yのworld変換はWorkListと同じ考え方。
   */
  private initDrag(): void {
    this.draggable?.kill();

    gsap.set(this.dragProxy, { x: 0 });
    this.group.position.x = 0;

    const instances = Draggable.create(this.dragProxy, {
      trigger: this.root,
      type: "x",
      inertia: true,
      bounds: this.getDragBoundsPx(),
      edgeResistance: 0.8,

      onDrag: () => this.syncGroupFromProxy(),
      onThrowUpdate: () => this.syncGroupFromProxy(),
    });

    this.draggable = instances[0] ?? null;
  }

  private getDragBoundsPx(): { minX: number; maxX: number } {
    const viewportWidthPx = window.innerWidth;

    return {
      minX: Math.min(0, viewportWidthPx - this.planeWidthPx),
      maxX: 0,
    };
  }

  private syncGroupFromProxy(): void {
    if (!this.world || !this.draggable) {
      return;
    }

    this.group.position.x = this.draggable.x * this.world.getPixelsToWorld();
  }

  /**
   * 通常のマウスホイール(縦方向の入力)でも横スクロールできるようにする。
   * dragProxyの位置をなめらかにアニメーションさせ、Draggable.update()で
   * ドラッグ側の内部状態も同期することで、ホイール操作の直後にそのままドラッグへ移っても
   * 位置が飛ばないようにしている。
   */
  private initWheel(): void {
    this.root.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  private handleWheel = (event: WheelEvent): void => {
    if (!this.draggable) {
      return;
    }

    event.preventDefault();

    const bounds = this.getDragBoundsPx();
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;

    const nextX = THREE.MathUtils.clamp(
      this.draggable.x - delta,
      bounds.minX,
      bounds.maxX,
    );

    gsap.to(this.dragProxy, {
      x: nextX,
      duration: WHEEL_EASE_DURATION,
      ease: WHEEL_EASE,
      overwrite: true,

      onUpdate: () => {
        this.draggable?.update();
        this.syncGroupFromProxy();
      },
    });
  };

  private initResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== null) {
        cancelAnimationFrame(this.resizeFrame);
      }

      this.resizeFrame = requestAnimationFrame(() => {
        this.layout();
        this.initDrag();
        this.resizeFrame = null;
      });
    });

    this.resizeObserver.observe(this.root);
  }

  public destroy(): void {
    this.root.removeEventListener("wheel", this.handleWheel);

    this.draggable?.kill();
    this.draggable = null;

    gsap.killTweensOf(this.dragProxy);
    this.dragProxy.remove();

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }

    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh = null;
    }

    this.geometry?.dispose();
    this.material?.dispose();
    this.texture?.dispose();

    this.world?.scene.remove(this.group);

    /*
     * このcontainerを使うのはDiscoverGalleryのみのため、ページ離脱時にまとめて解放する
     * (WaterBackgroundと同じ考え方)。
     */
    disposeWorld();
  }
}
