import * as THREE from "three/webgpu";
import Lenis from "lenis";

import { getOrCreateWorld, disposeWorld, type WorldContext } from "../index";

/** マウスドラッグをスクロールとして扱い始めるまでの移動量(px)。単純なクリックと区別するため。 */
const DRAG_THRESHOLD_PX = 4;

/**
 * discoverページの背景。横に長いPlaneMeshへwhite_background.jpgを、実際のスクロール可能幅
 * (=作品説明セクション群の合計幅)に合わせて繰り返し表示する。
 * スクロールはLenis(horizontal)で滑らかにし、実際のDOM(scrollEl/contentEl)を
 * ネイティブにスクロールさせることでスクロール範囲を厳密に(=端でのオーバーシュートなしに)
 * クランプする。WaterBackground/WorkListと同じ「共有Worldへ登録する薄いラッパー」の考え方に倣い、
 * Scene/Camera/Rendererの生成・破棄は共有Worldに委ねる。
 */
export class Discover {
  private readonly root: HTMLElement;
  private scrollEl: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;

  private world: WorldContext | null = null;
  private readonly group = new THREE.Group();

  private geometry: any = null;
  private material: any = null;
  private texture: any = null;
  private mesh: any = null;

  private lenis: Lenis | null = null;
  private unregisterUpdate: (() => void) | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;

  private isDragging = false;
  private dragMoved = false;
  private dragStartX = 0;
  private dragStartScrollLeft = 0;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  public init(): void {
    this.scrollEl = this.root.querySelector<HTMLElement>(
      "[data-discover-scroll]",
    );
    this.contentEl = this.root.querySelector<HTMLElement>(
      "[data-discover-scroll-content]",
    );

    if (!this.scrollEl || !this.contentEl) {
      return;
    }

    this.world = getOrCreateWorld(this.root as HTMLDivElement);
    this.world.scene.add(this.group);

    this.buildPlane();

    this.lenis = new Lenis({
      wrapper: this.scrollEl,
      content: this.contentEl,
      orientation: "horizontal",
      gestureOrientation: "both",
      autoRaf: false,
    });

    this.lenis.on("scroll", this.handleLenisScroll);

    this.unregisterUpdate = this.world.registerUpdate(() => {
      this.lenis?.raf(performance.now());
    });

    this.initDrag();
    this.initResizeObserver();

    this.layout();
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

    this.material = new (THREE as any).MeshBasicNodeMaterial({
      map: this.texture,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);

    /*
     * discoverページの共有WorldはWaterBackgroundを含まないためWaterは存在しないが、
     * 将来的な描画順の変化に備え、Water(renderOrder=-1想定)より必ず手前に来るよう
     * カメラ側へわずかに寄せておく。
     */
    this.mesh.position.z = 0.5;

    this.group.add(this.mesh);
  }

  /**
   * Planeを画面いっぱいの高さ・作品説明セクション群の合計幅(contentEl.scrollWidth)で配置する。
   * テクスチャの繰り返し回数も、その幅を「画面幅の何個ぶんか」で再計算する。
   */
  private layout(): void {
    if (!this.world || !this.mesh || !this.contentEl || !this.texture) {
      return;
    }

    const pixelsToWorld = this.world.getPixelsToWorld();
    const viewportWidthPx = window.innerWidth;
    const viewportHeightPx = window.innerHeight;

    const contentWidthPx = Math.max(
      this.contentEl.scrollWidth,
      viewportWidthPx,
    );

    const planeWidthWorld = contentWidthPx * pixelsToWorld;
    const planeHeightWorld = viewportHeightPx * pixelsToWorld;
    const viewportWidthWorld = viewportWidthPx * pixelsToWorld;

    this.mesh.scale.set(planeWidthWorld, planeHeightWorld, 1);
    this.mesh.position.x = planeWidthWorld / 2 - viewportWidthWorld / 2;

    this.texture.repeat.set(contentWidthPx / viewportWidthPx, 1);

    this.lenis?.resize();
    this.syncGroupFromScroll();
  }

  private handleLenisScroll = (lenis: Lenis): void => {
    if (!this.world) {
      return;
    }

    this.group.position.x = -lenis.scroll * this.world.getPixelsToWorld();
  };

  private syncGroupFromScroll(): void {
    if (!this.world || !this.scrollEl) {
      return;
    }

    this.group.position.x =
      -this.scrollEl.scrollLeft * this.world.getPixelsToWorld();
  }

  /**
   * 通常のマウスドラッグ(クリック&ドラッグ)でも横スクロールできるようにする。
   * scrollEl.scrollLeftを直接動かすことで、ネイティブのスクロール範囲によって
   * 自動的に端でクランプされる(オーバーシュートしない)。Lenisはこの結果生じる
   * scrollイベントを検知して追従するため、Draggableのような別系統の同期は不要。
   * リンク等への単純なクリックを妨げないよう、一定距離動くまではドラッグ扱いにしない。
   */
  private initDrag(): void {
    this.scrollEl?.addEventListener("pointerdown", this.handlePointerDown);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.scrollEl) {
      return;
    }

    this.isDragging = true;
    this.dragMoved = false;
    this.dragStartX = event.clientX;
    this.dragStartScrollLeft = this.scrollEl.scrollLeft;

    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.isDragging || !this.scrollEl) {
      return;
    }

    const deltaX = event.clientX - this.dragStartX;

    if (!this.dragMoved && Math.abs(deltaX) < DRAG_THRESHOLD_PX) {
      return;
    }

    this.dragMoved = true;
    this.scrollEl.scrollLeft = this.dragStartScrollLeft - deltaX;
  };

  private handlePointerUp = (): void => {
    this.isDragging = false;

    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
  };

  private initResizeObserver(): void {
    if (!this.contentEl) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== null) {
        cancelAnimationFrame(this.resizeFrame);
      }

      this.resizeFrame = requestAnimationFrame(() => {
        this.layout();
        this.resizeFrame = null;
      });
    });

    this.resizeObserver.observe(this.contentEl);
  }

  public destroy(): void {
    this.scrollEl?.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.isDragging = false;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }

    this.unregisterUpdate?.();
    this.unregisterUpdate = null;

    this.lenis?.destroy();
    this.lenis = null;

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
