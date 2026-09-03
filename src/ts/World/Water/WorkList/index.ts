import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import gsap from "gsap";
// gsap の型定義がWindows上で大文字小文字の衝突を起こすため抑制 (see: gsap/types/index.d.ts の draggable.d.ts 参照)
// @ts-ignore
import { Draggable } from "gsap/Draggable";
// @ts-ignore
import { InertiaPlugin } from "gsap/InertiaPlugin";

import { getOrCreateWorld, type WorldContext } from "../../index";
import { urlFor } from "../../../Sanity";
import { createVideoTexture, type VideoTextureHandle } from "../../../utils/media";
import {
  createBackgroundBlurMaterial,
  type BackgroundBlurMaterialHandle,
} from "../../../materials/createBackgroundBlurMaterial";
import { getOrCreateCursor, type CursorController } from "../../../Cursor";
import type { PortfolioSummary } from "../../../../types/portfolio";

gsap.registerPlugin(Draggable, InertiaPlugin);

/**
 * 列数の切り替えポイント。旧DOM実装(WorkList.scss)のbreakpointを踏襲。
 */
const COLUMN_BREAKPOINTS = [
  { minWidth: 1440, columns: 5, cardWidth: 260, columnGap: 100, rowGap: 120, padding: 160 },
  { minWidth: 1024, columns: 4, cardWidth: 220, columnGap: 70, rowGap: 100, padding: 100 },
  { minWidth: 640, columns: 3, cardWidth: 190, columnGap: 50, rowGap: 80, padding: 70 },
  { minWidth: 0, columns: 2, cardWidth: 160, columnGap: 40, rowGap: 60, padding: 40 },
];

/** サムネイルのアスペクト比(幅/高さ)。サンプル画像に合わせて300:169。 */
const ASPECT_RATIO = 300 / 169;

/** Water背景がうっすら透けて見えるよう、Planeは完全な不透明にはしない。 */
const REST_OPACITY = 0.9;

/** 作品詳細を開いている間の背景ボカシ。数値は微調整しやすいよう独立させている。 */
const BACKGROUND_BLUR_FADE_IN_DURATION = 0.7;
const BACKGROUND_BLUR_FADE_OUT_DURATION = 0.5;
const BACKGROUND_BLUR_EASE = "power2.out";

interface PlaneEntry {
  portfolio: PortfolioSummary;
  /** THREE.Mesh(three/webgpuには@types/threeのサブパス型定義が無いためany)。 */
  mesh: any;
  material: any;
  /** ホバー時の波紋(リップル)の中心/強さを制御するハンドル。 */
  ripple: BackgroundBlurMaterialHandle;
  /** ホバー時の拡大に対する基準スケール(world単位)。 */
  baseScale: { x: number; y: number };
  /** サムネイルが動画の場合の再生ハンドル(dispose用)。 */
  videoHandle: VideoTextureHandle | null;
}

/**
 * 作品一覧をDOMではなくThree.jsのPlaneGeometryで描画するギャラリー。
 * WaterBackgroundと同じCanvas/Sceneに統合される(getOrCreateWorld参照)。
 */
export class WorkList {
  private readonly root: HTMLElement;
  private readonly portfolios: PortfolioSummary[];

  private world: WorldContext | null = null;
  private readonly group = new THREE.Group();
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly sharedGeometry = new THREE.PlaneGeometry(1, 1);

  private entries: PlaneEntry[] = [];

  private trackWidthPx = 0;
  private trackHeightPx = 0;

  private draggable: Draggable | null = null;
  private suppressClick = false;

  /**
   * root(ヒットテスト層)自体を動かすと、click/pointer判定に使う
   * getBoundingClientRectごとビューポート外へずれてしまうため、
   * Draggableの移動対象は別要素にし、rootはtriggerとしてのみ使う。
   */
  private readonly dragProxy = document.createElement("div");

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private hoveredEntry: PlaneEntry | null = null;

  private cursor: CursorController | null = null;

  /** 作品詳細を開いている間、背景全体をぼかすための共有uniform(0〜1)。 */
  private readonly backgroundBlur = uniform(0);

  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;

    const dataEl = root.querySelector<HTMLScriptElement>(
      "[data-portfolio-data]",
    );

    this.portfolios = dataEl?.textContent
      ? (JSON.parse(dataEl.textContent) as PortfolioSummary[])
      : [];

    this.textureLoader.crossOrigin = "anonymous";
  }

  public init(): void {
    const container = document.querySelector<HTMLDivElement>(
      "[data-water-background]",
    );

    if (!container) {
      return;
    }

    this.world = getOrCreateWorld(container);
    this.world.scene.add(this.group);

    this.cursor = getOrCreateCursor();

    this.dragProxy.style.position = "fixed";
    this.dragProxy.style.top = "0";
    this.dragProxy.style.left = "0";
    this.dragProxy.style.width = "0";
    this.dragProxy.style.height = "0";
    this.dragProxy.style.pointerEvents = "none";
    document.body.appendChild(this.dragProxy);

    this.buildPlanes();
    this.layout();
    this.initEntranceAnimation();
    this.initDrag();
    this.initPointerEvents();
    this.initResizeObserver();

    document.addEventListener(
      "portfolio:setVisible",
      this.handleSetVisible as EventListener,
    );

    document.addEventListener(
      "workdetail:blur",
      this.handleBlurToggle as EventListener,
    );
  }

  /**
   * PlaneGeometryはすべて1x1の単位サイズで作り、実サイズはmesh.scaleで表現する。
   * テクスチャはTextureLoader.load()の戻り値(画像ロード前でも同一インスタンス)を
   * そのままcolorNodeへ渡すため、マテリアルはテクスチャ確定後に生成する。
   */
  private buildPlanes(): void {
    this.entries = this.portfolios.map((portfolio) => {
      const { material, ripple, videoHandle } = this.createEntryMaterial(
        portfolio.thumbnailMedia,
      );

      const mesh = new THREE.Mesh(this.sharedGeometry, material);

      /*
       * Water(renderOrder=-1)より必ず手前に描画されるようにする。
       */
      mesh.renderOrder = 1;

      this.group.add(mesh);

      const entry: PlaneEntry = {
        portfolio,
        mesh,
        material,
        ripple,
        baseScale: { x: 1, y: 1 },
        videoHandle,
      };

      return entry;
    });
  }

  /**
   * SanityのCDN画像、またはCloudflareにホストした動画をテクスチャとして読み込み、
   * ぼかし/波紋シェーダー付きマテリアルを作る。
   */
  private createEntryMaterial(
    media: PortfolioSummary["thumbnailMedia"],
  ): {
    material: any;
    ripple: BackgroundBlurMaterialHandle;
    videoHandle: VideoTextureHandle | null;
  } {
    /*
     * createEntryMaterialはbuildPlanes()経由でのみ呼ばれ、その時点でinit()内の
     * `this.world = getOrCreateWorld(container)` が必ず先に実行済みのためnullにならない。
     */
    const water = this.world!.water;

    if (media.type === "cloudflareVideo") {
      const videoHandle = createVideoTexture(media.cloudflareVideoUrl);
      const handle = createBackgroundBlurMaterial(
        videoHandle.texture,
        this.backgroundBlur,
        ASPECT_RATIO,
        water,
      );

      handle.material.color.set(0xffffff);
      handle.material.opacity = REST_OPACITY;

      return { material: handle.material, ripple: handle, videoHandle };
    }

    const url = urlFor(media.image).width(600).url();

    const texture = this.textureLoader.load(url, (loaded: any) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      handle.material.color.set(0xffffff);
      handle.material.needsUpdate = true;
    });

    const handle = createBackgroundBlurMaterial(
      texture,
      this.backgroundBlur,
      ASPECT_RATIO,
      water,
    );
    handle.material.color.set(0x1a1a1a);
    handle.material.opacity = REST_OPACITY;

    return { material: handle.material, ripple: handle, videoHandle: null };
  }

  private getBreakpoint(): (typeof COLUMN_BREAKPOINTS)[number] {
    const width = this.root.clientWidth;

    return (
      COLUMN_BREAKPOINTS.find((bp) => width >= bp.minWidth) ??
      COLUMN_BREAKPOINTS[COLUMN_BREAKPOINTS.length - 1]
    );
  }

  /**
   * 縦一列ずつ積み上げ、奇数列を半分だけ下にずらす(旧DOM実装と同じロジック)。
   * 座標計算はCSSのtop-left基準(x右・y下)で行い、最後にworld座標へ変換する。
   */
  private layout(): void {
    if (!this.world) {
      return;
    }

    const { columns, cardWidth, columnGap, rowGap, padding } =
      this.getBreakpoint();

    const cardHeight = cardWidth / ASPECT_RATIO;

    const columnY = Array.from({ length: columns }, () => padding);
    const initializedColumns = Array.from({ length: columns }, () => false);

    const pixelsToWorld = this.world.getPixelsToWorld();

    const viewportWidth = this.root.clientWidth;
    const viewportHeight = this.root.clientHeight;

    /*
     * ビューポート左上を world原点として、そこからpx→world変換する。
     */
    const originX = (-viewportWidth / 2) * pixelsToWorld;
    const originY = (viewportHeight / 2) * pixelsToWorld;

    this.entries.forEach((entry, index) => {
      const column = index % columns;

      if (!initializedColumns[column]) {
        if (column % 2 === 1) {
          columnY[column] += cardHeight / 2;
        }

        initializedColumns[column] = true;
      }

      const xPx =
        padding + column * (cardWidth + columnGap) + cardWidth / 2;
      const yPx = columnY[column] + cardHeight / 2;

      entry.mesh.position.set(
        originX + xPx * pixelsToWorld,
        originY - yPx * pixelsToWorld,
        0,
      );

      entry.baseScale = {
        x: cardWidth * pixelsToWorld,
        y: cardHeight * pixelsToWorld,
      };

      entry.mesh.scale.set(entry.baseScale.x, entry.baseScale.y, 1);

      columnY[column] += cardHeight + rowGap;
    });

    this.trackWidthPx =
      padding * 2 + columns * cardWidth + (columns - 1) * columnGap;

    this.trackHeightPx = Math.max(...columnY) + padding;
  }

  /**
   * 初期表示アニメーション。ここはGSAP。
   */
  private initEntranceAnimation(): void {
    this.entries.forEach((entry) => {
      const delay = Math.random() * 0.5;

      gsap.fromTo(
        entry.mesh.scale,
        {
          x: entry.baseScale.x * 0.96,
          y: entry.baseScale.y * 0.96,
        },
        {
          x: entry.baseScale.x,
          y: entry.baseScale.y,
          duration: 1,
          delay,
          ease: "power3.out",
        },
      );

      gsap.fromTo(
        entry.material,
        { opacity: 0 },
        { opacity: REST_OPACITY, duration: 1, delay, ease: "power3.out" },
      );
    });
  }

  /**
   * Palmer風ドラッグ。GSAPはCSS値しか直接操作できないため、
   * 透明なヒットテスト層(root)自体をDraggableで動かし、
   * そのx/yをThree.jsのgroup位置に変換して反映する。
   */
  private initDrag(): void {
    this.draggable?.kill();

    const initial = this.getCenteredPositionPx();
    const pixelsToWorld = this.world?.getPixelsToWorld() ?? 0;

    gsap.set(this.dragProxy, { x: initial.x, y: initial.y });
    this.group.position.set(
      initial.x * pixelsToWorld,
      -initial.y * pixelsToWorld,
      0,
    );

    const syncGroup = (instance: Draggable): void => {
      if (!this.world) {
        return;
      }

      const pixelsToWorld = this.world.getPixelsToWorld();

      this.group.position.x = instance.x * pixelsToWorld;
      this.group.position.y = -instance.y * pixelsToWorld;
    };

    const instances = Draggable.create(this.dragProxy, {
      trigger: this.root,
      type: "x,y",
      inertia: true,
      bounds: this.getDragBoundsPx(),
      edgeResistance: 0.8,

      onPress: () => {
        this.root.classList.add("is-dragging");
      },

      onDrag: function () {
        syncGroup(this as Draggable);
      },

      onThrowUpdate: function () {
        syncGroup(this as Draggable);
      },

      onDragStart: () => {
        this.suppressClick = true;
      },

      onDragEnd: () => {
        this.root.classList.remove("is-dragging");

        /*
         * drag後にクリックが発火してしまうのを防止。
         */
        window.setTimeout(() => {
          this.suppressClick = false;
        }, 50);
      },
    });

    this.draggable = instances[0] ?? null;
  }

  private getDragBoundsPx(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    const viewportWidth = this.root.clientWidth;
    const viewportHeight = this.root.clientHeight;

    return {
      minX: Math.min(0, viewportWidth - this.trackWidthPx),
      maxX: 0,
      minY: Math.min(0, viewportHeight - this.trackHeightPx),
      maxY: 0,
    };
  }

  /**
   * 初期表示時、グリッド全体の中央がビューポート中央に来るオフセットを
   * ドラッグ範囲内にクランプして求める。
   */
  private getCenteredPositionPx(): { x: number; y: number } {
    const bounds = this.getDragBoundsPx();
    const viewportWidth = this.root.clientWidth;
    const viewportHeight = this.root.clientHeight;

    const centerX = (viewportWidth - this.trackWidthPx) / 2;
    const centerY = (viewportHeight - this.trackHeightPx) / 2;

    return {
      x: Math.min(Math.max(centerX, bounds.minX), bounds.maxX),
      y: Math.min(Math.max(centerY, bounds.minY), bounds.maxY),
    };
  }

  private initPointerEvents(): void {
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("pointermove", this.handlePointerMove);
    this.root.addEventListener("pointerleave", this.handlePointerLeave);
  }

  /**
   * uv(戻り値)はTHREE.Vector2だが、three/webgpuには型定義が無いためany。
   */
  private raycastAt(
    clientX: number,
    clientY: number,
  ): { entry: PlaneEntry; uv: any } | null {
    if (!this.world) {
      return null;
    }

    this.pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(
      this.pointerNdc,
      this.world.cameraController.camera,
    );

    const meshes = this.entries.map((entry) => entry.mesh);
    const intersections = this.raycaster.intersectObjects(meshes, false);

    if (intersections.length === 0) {
      return null;
    }

    const hit = intersections[0];
    const entry = this.entries.find((candidate) => candidate.mesh === hit.object);

    if (!entry || !hit.uv) {
      return null;
    }

    return { entry, uv: hit.uv };
  }

  private handleClick = (event: MouseEvent): void => {
    if (this.suppressClick) {
      return;
    }

    const hit = this.raycastAt(event.clientX, event.clientY);

    if (!hit) {
      return;
    }

    document.dispatchEvent(
      new CustomEvent("worklist:open", {
        detail: {
          slug: hit.entry.portfolio.slug.current,
          title: hit.entry.portfolio.title,
        },
      }),
    );
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const hit = this.raycastAt(event.clientX, event.clientY);
    const entry = hit?.entry ?? null;

    if (entry !== this.hoveredEntry) {
      if (this.hoveredEntry) {
        this.setHoverScale(this.hoveredEntry, 1);
        this.hoveredEntry.ripple.setHoverActive(false);
      }

      this.hoveredEntry = entry;

      if (entry) {
        this.setHoverScale(entry, 1.08);
        entry.ripple.setHoverActive(true);

        this.cursor?.setHoverActive(true);
      } else {
        this.cursor?.setHoverActive(false);
      }
    }

    if (hit) {
      hit.entry.ripple.setPointerUv(hit.uv.x, hit.uv.y);
    }
  };

  private handlePointerLeave = (): void => {
    if (this.hoveredEntry) {
      this.setHoverScale(this.hoveredEntry, 1);
      this.hoveredEntry.ripple.setHoverActive(false);
      this.hoveredEntry = null;
    }

    this.cursor?.setHoverActive(false);
  };

  private setHoverScale(entry: PlaneEntry, multiplier: number): void {
    gsap.to(entry.mesh.scale, {
      x: entry.baseScale.x * multiplier,
      y: entry.baseScale.y * multiplier,
      duration: 0.6,
      ease: "power3.out",
      overwrite: true,
    });
  }

  /**
   * WorkDetailが開いている間、選択中の作品のPlaneを隠す
   * (背景に薄く二重表示されるのを防ぐ)。
   */
  private handleSetVisible = (
    event: CustomEvent<{ slug: string; visible: boolean }>,
  ): void => {
    const entry = this.entries.find(
      (candidate) =>
        candidate.portfolio.slug.current === event.detail.slug,
    );

    if (entry) {
      entry.mesh.visible = event.detail.visible;
    }
  };

  /**
   * 作品詳細の開閉に合わせ、背景全体(自身のPlane)をボカす/戻す。
   */
  private handleBlurToggle = (
    event: CustomEvent<{ active: boolean }>,
  ): void => {
    gsap.to(this.backgroundBlur, {
      value: event.detail.active ? 1 : 0,
      duration: event.detail.active
        ? BACKGROUND_BLUR_FADE_IN_DURATION
        : BACKGROUND_BLUR_FADE_OUT_DURATION,
      ease: BACKGROUND_BLUR_EASE,
      overwrite: true,
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
    this.draggable?.kill();
    this.draggable = null;

    this.dragProxy.remove();

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
    }

    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("pointermove", this.handlePointerMove);
    this.root.removeEventListener("pointerleave", this.handlePointerLeave);

    document.removeEventListener(
      "portfolio:setVisible",
      this.handleSetVisible as EventListener,
    );

    document.removeEventListener(
      "workdetail:blur",
      this.handleBlurToggle as EventListener,
    );

    this.cursor = null;

    gsap.killTweensOf(this.entries.map((entry) => entry.mesh.scale));
    gsap.killTweensOf(this.entries.map((entry) => entry.material));

    this.entries.forEach((entry) => {
      if (entry.videoHandle) {
        entry.videoHandle.dispose();
      } else {
        entry.material.map?.dispose();
      }

      entry.material.dispose();
      this.group.remove(entry.mesh);
    });

    this.sharedGeometry.dispose();
    this.entries = [];

    this.world?.scene.remove(this.group);
  }
}
