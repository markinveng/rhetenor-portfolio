import gsap from "gsap";
// gsap の型定義がWindows上で大文字小文字の衝突を起こすため抑制 (see: WorkList/index.tsと同様)
// @ts-ignore
import { Observer } from "gsap/Observer";
import Lenis from "lenis";
import { navigate } from "astro:transitions/client";

import * as THREE from "three/webgpu";

import { getOrCreateWorld, type WorldContext } from "../index";
import { PortfolioApi, urlFor } from "../../Sanity";
import { createVideoTexture, type VideoTextureHandle } from "../../utils/media";
import {
  createDetailSlideMaterial,
  type DetailSlideMaterialHandle,
} from "../../materials/createDetailSlideMaterial";
import { getOrCreateCursor, type CursorController } from "../../Cursor";
import { playSelectSound } from "../../Sound";
import type { MediaItem, Portfolio } from "../../../types/portfolio";

gsap.registerPlugin(Observer);

const portfolioApi = new PortfolioApi();

/**
 * 選択中の作品Planeの傾き(ラジアン)。右奥・左手前になる向き。
 * 数値は微調整しやすいよう独立した定数にしている。
 */
const SLIDE_TILT_Y = THREE.MathUtils.degToRad(8);

/** リビール(波打ちながら上から表示)の所要時間・イージング。 */
const REVEAL_IN_DURATION = 1.1;
const REVEAL_IN_EASE = "power1.out";
const REVEAL_OUT_DURATION = 0.6;
const REVEAL_OUT_EASE = "power1.in";

/** 閉じる際、パネル側のUI(タイトル・レール・閉じるボタン)のフェード時間。 */
const CHROME_FADE_OUT_DURATION = 0.3;

interface OpenEventDetail {
  slug: string;
  title: string;
}

type SlideKind = "image" | "video";

interface SlideSource {
  kind: SlideKind;
  /** image: Sanity画像URL, video: Cloudflareにホストした動画の直接URL */
  url: string;
  /** レール用のポスター画像(video種別には無い) */
  posterUrl: string | null;
  aspectRatio: number;
}

/**
 * mediaItemから、Plane描画に必要な種別・URL・アスペクト比を解決する。
 */
function resolveSlideSource(media: MediaItem): SlideSource {
  if (media.type === "img") {
    const url = urlFor(media.image).width(1400).url();
    return { kind: "image", url, posterUrl: url, aspectRatio: 16 / 9 };
  }

  return {
    kind: "video",
    url: media.cloudflareVideoUrl,
    posterUrl: null,
    aspectRatio: 16 / 9,
  };
}

/** `object-fit: contain` と同じ計算。box内に収まる最大サイズを返す。 */
function containFit(
  aspectRatio: number,
  boxWidth: number,
  boxHeight: number,
): { width: number; height: number } {
  const boxAspect = boxWidth / boxHeight;

  if (aspectRatio > boxAspect) {
    return { width: boxWidth, height: boxWidth / aspectRatio };
  }

  return { width: boxHeight * aspectRatio, height: boxHeight };
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export class WorkDetail {
  private readonly root: HTMLElement;
  private readonly panelEl: HTMLElement;
  private readonly railEl: HTMLElement;
  /** 可視コンテンツは持たない。ホイール/タッチ入力のヒットゾーン。 */
  private readonly scrollEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly closeEl: HTMLElement;
  private readonly closeZoneEl: HTMLElement;

  private railItemEls: HTMLElement[] = [];

  private world: WorldContext | null = null;
  private readonly slideGroup = new THREE.Group();
  private readonly sharedGeometry = new THREE.PlaneGeometry(1, 1);

  private slideSources: SlideSource[] = [];

  /** 現在表示中のスライド1枚ぶんのPlane。切り替え時に作り直す。 */
  private mesh: any = null;
  private currentHandle: DetailSlideMaterialHandle | null = null;
  private currentVideoHandle: VideoTextureHandle | null = null;
  private currentAspectRatio = 16 / 9;

  private observer: Observer | null = null;

  private isOpen = false;
  private isHovering = false;

  private currentSlug: string | null = null;

  private mediaCount = 0;
  private activeRealIndex = 0;

  private panelWorldWidth = 0;
  private panelWorldHeight = 0;
  private panelWorldCenterX = 0;
  private panelWorldCenterY = 0;
  private pixelsToWorld = 0;

  private cursor: CursorController | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();

  private resizeHandler: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;

    this.panelEl = this.requireEl("[data-work-detail-panel]");
    this.railEl = this.requireEl("[data-work-detail-rail]");
    this.scrollEl = this.requireEl("[data-work-detail-scroll]");
    this.titleEl = this.requireEl("[data-work-detail-title]");
    this.closeEl = this.requireEl("[data-work-detail-close]");
    this.closeZoneEl = this.requireEl("[data-work-detail-close-zone]");
  }

  private requireEl(selector: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(selector);

    if (!el) {
      throw new Error(`WorkDetail: ${selector} was not found.`);
    }

    return el;
  }

  public init(): void {
    /*
     * astro:transitionsのキャッシュされたDOMを介して
     * 開いた状態のまま復元されることがあるため、初期化時に必ず閉じた状態へ戻す。
     */
    this.resetState();

    const container = document.querySelector<HTMLDivElement>(
      "[data-water-background]",
    );
    this.world = container ? getOrCreateWorld(container) : null;

    if (this.world) {
      this.world.scene.add(this.slideGroup);
    }

    this.cursor = getOrCreateCursor();

    document.addEventListener(
      "worklist:open",
      this.handleOpen as unknown as EventListener,
    );

    this.closeEl.addEventListener("click", this.closeToOrigin);
    this.closeZoneEl.addEventListener("click", this.closeToOrigin);
  }

  private handleOpen = async (
    event: CustomEvent<OpenEventDetail>,
  ): Promise<void> => {
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;

    const { slug, title } = event.detail;

    this.currentSlug = slug;

    /*
     * 背景のWorkList側(Plane)に選択した作品がそのまま残って
     * 二重に見えてしまうため、選択元のPlaneだけは完全に隠す。
     */
    document.dispatchEvent(
      new CustomEvent("portfolio:setVisible", {
        detail: { slug, visible: false },
      }),
    );

    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-open-work-detail");

    this.showBackdrop();

    const portfolio = await this.fetchPortfolio(slug);

    if (!portfolio) {
      this.failAndReset();
      return;
    }

    await this.showDetail(portfolio, title);
  };

  /**
   * @sanity/client 内部のリトライで待ち時間が長くなりすぎないよう、
   * 一定時間で諦めてオーバーレイを閉じられるようにする。
   */
  private fetchPortfolio(slug: string): Promise<Portfolio | null> {
    const timeout = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), 6000);
    });

    return Promise.race([
      portfolioApi.getBySlug(slug).catch(() => null),
      timeout,
    ]);
  }

  /**
   * 選択した作品に注目させるため、背景(Water/WorkListのグリッド)側全体を
   * ぼかす。実際のボカし(GSAP)はWorkList側が担当するため、
   * ここではイベントで状態を伝えるだけにする。
   */
  private showBackdrop(): void {
    document.dispatchEvent(
      new CustomEvent("workdetail:blur", { detail: { active: true } }),
    );
  }

  private hideBackdrop(): void {
    document.dispatchEvent(
      new CustomEvent("workdetail:blur", { detail: { active: false } }),
    );
  }

  /**
   * 取得したPortfolioデータから、レールと最初のスライドを表示する。
   */
  private async showDetail(
    portfolio: Portfolio,
    title: string,
  ): Promise<void> {
    const mediaList: MediaItem[] = [
      portfolio.thumbnailMedia,
      ...(portfolio.previewMedia ?? []),
    ];

    this.slideSources = mediaList.map((media) => resolveSlideSource(media));
    this.mediaCount = mediaList.length;

    this.titleEl.textContent = title;

    this.updatePanelWorldRect();
    this.buildRail(title);
    this.showSlideAt(0);

    this.titleEl.style.visibility = "visible";
    this.closeEl.style.visibility = "visible";
    this.railEl.style.visibility = "visible";

    gsap.to(
      [this.titleEl, this.closeEl, this.railEl],
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.5,
        stagger: 0.05,
      },
    );

    this.initScrollObserver();
    this.initPointerEvents();
    this.initResizeHandler();
  }

  /**
   * 画面左半分のパネル領域(work-detail__scroll のCSS上の矩形)を
   * world座標に変換する。WorkListのlayout()と同じ px→world 変換を使う。
   */
  private updatePanelWorldRect(): void {
    if (!this.world) {
      return;
    }

    this.pixelsToWorld = this.world.getPixelsToWorld();

    const rect = this.scrollEl.getBoundingClientRect();

    const originX = (-window.innerWidth / 2) * this.pixelsToWorld;
    const originY = (window.innerHeight / 2) * this.pixelsToWorld;

    const centerXpx = rect.left + rect.width / 2;
    const centerYpx = rect.top + rect.height / 2;

    this.panelWorldCenterX = originX + centerXpx * this.pixelsToWorld;
    this.panelWorldCenterY = originY - centerYpx * this.pixelsToWorld;
    this.panelWorldWidth = rect.width * this.pixelsToWorld;
    this.panelWorldHeight = rect.height * this.pixelsToWorld;

    this.slideGroup.position.set(
      this.panelWorldCenterX,
      this.panelWorldCenterY,
      0,
    );
  }

  /**
   * 指定indexのスライドへ切り替える。既存のPlaneは破棄し、
   * 新しいテクスチャを波打ちリビールシェーダーで上から下へ表示する。
   */
  private showSlideAt(index: number): void {
    if (!this.world || this.mediaCount === 0) {
      return;
    }

    const realIndex = mod(index, this.mediaCount);
    const source = this.slideSources[realIndex];

    if (!source) {
      return;
    }

    this.activeRealIndex = realIndex;
    this.currentAspectRatio = source.aspectRatio;

    this.disposeCurrentSlide();

    let map: any;

    if (source.kind === "video") {
      this.currentVideoHandle = createVideoTexture(source.url);
      map = this.currentVideoHandle.texture;

      this.currentVideoHandle.ready.then(({ width, height }) => {
        if (width > 0 && height > 0) {
          source.aspectRatio = width / height;
          this.currentAspectRatio = source.aspectRatio;
          this.applySlideSize();
        }
      });
    } else {
      map = new THREE.TextureLoader().load(source.url, (loaded: any) => {
        const image = loaded.image as HTMLImageElement;

        if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
          source.aspectRatio = image.naturalWidth / image.naturalHeight;
          this.currentAspectRatio = source.aspectRatio;
          this.applySlideSize();
        }
      });
      map.colorSpace = THREE.SRGBColorSpace;
    }

    const handle = createDetailSlideMaterial(map);
    this.currentHandle = handle;

    const mesh = new THREE.Mesh(this.sharedGeometry, handle.material);

    /*
     * WaterBackground(-1)とWorkListのグリッド(1)より手前に描画し、
     * 選択中の作品が背景に埋もれないようにする。
     */
    mesh.renderOrder = 2;

    /*
     * 右奥・左手前になるよう軽くY軸回転させ、平面的に見えないようにする。
     */
    mesh.rotation.y = SLIDE_TILT_Y;

    this.slideGroup.add(mesh);
    this.mesh = mesh;

    this.applySlideSize();

    gsap.to(handle.progress, {
      value: 1,
      duration: REVEAL_IN_DURATION,
      ease: REVEAL_IN_EASE,
      overwrite: true,
    });

    this.updateRailActive();
  }

  private applySlideSize(): void {
    if (!this.mesh || !this.currentHandle) {
      return;
    }

    const fit = containFit(
      this.currentAspectRatio,
      this.panelWorldWidth,
      this.panelWorldHeight,
    );

    this.mesh.scale.set(fit.width, fit.height, 1);
    this.currentHandle.setPlaneSize(fit.width, fit.height, this.pixelsToWorld);
  }

  private updateRailActive(): void {
    this.railItemEls.forEach((railItem, railIndex) => {
      railItem.classList.toggle("is-active", railIndex === this.activeRealIndex);
    });
  }

  /**
   * ホイール/タッチを1ジェスチャー=1スライドの切り替えとして扱う。
   */
  private initScrollObserver(): void {
    this.observer?.kill();

    if (this.mediaCount <= 1) {
      return;
    }

    /*
     * "pointer"は含めない。preventDefault:trueと組み合わせると
     * マウスクリックでのスライド遷移(navigateToWork)を阻害する恐れがあるため、
     * ホイール/タッチのみをスクロール操作として扱う。
     */
    this.observer = Observer.create({
      target: this.scrollEl,
      type: "wheel,touch",
      preventDefault: true,
      onUp: () => this.showSlideAt(this.activeRealIndex - 1),
      onDown: () => this.showSlideAt(this.activeRealIndex + 1),
    });
  }

  private buildRail(title: string): void {
    this.railEl.innerHTML = "";
    this.railItemEls = [];

    this.slideSources.forEach((source, index) => {
      const railItem = document.createElement("button");
      railItem.type = "button";
      railItem.className = "work-detail__rail-item";
      railItem.setAttribute("aria-label", `${title} ${index + 1}`);

      if (source.posterUrl) {
        railItem.style.backgroundImage = `url(${source.posterUrl})`;
      }

      railItem.addEventListener("click", () => {
        if (index !== this.activeRealIndex) {
          this.showSlideAt(index);
        }
      });

      this.railEl.appendChild(railItem);
      this.railItemEls.push(railItem);
    });

    if (this.railItemEls[0]) {
      this.railItemEls[0].classList.add("is-active");
    }
  }

  /*-------------------------------
    ホバー / クリック(raycast)
  -------------------------------*/

  private initPointerEvents(): void {
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("click", this.handleClick);
  }

  private destroyPointerEvents(): void {
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("click", this.handleClick);
  }

  private raycastMesh(clientX: number, clientY: number): boolean {
    if (!this.world || !this.mesh) {
      return false;
    }

    this.pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(
      this.pointerNdc,
      this.world.cameraController.camera,
    );

    const intersections = this.raycaster.intersectObject(this.mesh, false);

    if (intersections.length === 0) {
      return false;
    }

    const hit = intersections[0];

    if (hit.uv) {
      this.currentHandle?.setPointerUv(hit.uv.x, hit.uv.y);
    }

    return true;
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.isOpen) {
      return;
    }

    const isHit = this.raycastMesh(event.clientX, event.clientY);

    if (isHit === this.isHovering) {
      return;
    }

    this.isHovering = isHit;
    this.currentHandle?.setHoverActive(isHit);

    if (isHit) {
      this.cursor?.enterLabel("Discover →");
    } else {
      this.cursor?.leaveLabel();
    }
  };

  private handleClick = (event: MouseEvent): void => {
    if (!this.isOpen) {
      return;
    }

    if (this.raycastMesh(event.clientX, event.clientY)) {
      this.navigateToWork();
    }
  };

  /*-------------------------------
    リサイズ
  -------------------------------*/

  private initResizeHandler(): void {
    this.resizeHandler = (): void => {
      this.updatePanelWorldRect();
      this.applySlideSize();
    };

    window.addEventListener("resize", this.resizeHandler);
  }

  private destroyResizeHandler(): void {
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
  }

  /**
   * スライドクリックで作品詳細ページへ遷移する。
   * Lenisで一度スムーズスクロールしてから遷移する。
   */
  private navigateToWork = (): void => {
    const slug = this.currentSlug;

    const targetUrl = slug
      ? `/discover?prov=${encodeURIComponent(slug)}`
      : "/error";

    /*
     * トランジション(スクロール→ページ遷移)と並行して選択SEを一度だけ鳴らす。
     */
    playSelectSound();

    /*
     * Astroのnavigate()でSPA的に遷移させることで、
     * ClientRouterによるView Transitions(フェード)と
     * 通常のブラウザバック/フォワードの両方が破綻なく機能する。
     */
    const lenis = new Lenis({ autoRaf: true });

    lenis.scrollTo(0, {
      duration: 0.8,
      onComplete: () => {
        lenis.destroy();
        navigate(targetUrl);
      },
    });
  };

  /**
   * 画面右クリックで閉じる。表示中のPlaneを逆再生(下から上へ隠れる)
   * させながら、パネルUIをフェードアウトする。ここはGSAP。
   */
  private closeToOrigin = (): void => {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;

    document.body.classList.remove("has-open-work-detail");
    this.hideBackdrop();

    gsap.to(
      [this.panelEl, this.closeEl, this.railEl, this.titleEl],
      { autoAlpha: 0, duration: CHROME_FADE_OUT_DURATION },
    );

    if (this.currentHandle) {
      gsap.to(this.currentHandle.progress, {
        value: 0,
        duration: REVEAL_OUT_DURATION,
        ease: REVEAL_OUT_EASE,
        overwrite: true,
        onComplete: () => this.resetState(),
      });

      return;
    }

    this.resetState();
  };

  /**
   * データ取得に失敗した場合の後始末。
   */
  private failAndReset(): void {
    document.body.classList.remove("has-open-work-detail");
    this.hideBackdrop();
    this.resetState();
  }

  private disposeCurrentSlide(): void {
    if (this.mesh) {
      this.slideGroup.remove(this.mesh);
      this.mesh = null;
    }

    this.currentHandle?.dispose();
    this.currentHandle = null;

    if (this.currentVideoHandle) {
      /* videoHandle.dispose()がtexture.disposeも兼ねる */
      this.currentVideoHandle.dispose();
      this.currentVideoHandle = null;
    }
  }

  private resetState(): void {
    this.isOpen = false;

    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-open-work-detail");

    this.observer?.kill();
    this.observer = null;

    this.destroyPointerEvents();
    this.destroyResizeHandler();

    this.isHovering = false;
    this.cursor?.leaveLabel();

    gsap.killTweensOf(this.panelEl);
    gsap.set(this.panelEl, { autoAlpha: 1, x: 0 });

    gsap.set(
      [this.railEl, this.titleEl, this.closeEl],
      { autoAlpha: 0 },
    );

    this.hideBackdrop();

    this.railEl.style.visibility = "hidden";
    this.titleEl.style.visibility = "hidden";
    this.closeEl.style.visibility = "hidden";

    this.railEl.innerHTML = "";

    this.disposeCurrentSlide();

    this.railItemEls = [];
    this.slideSources = [];
    this.mediaCount = 0;
    this.activeRealIndex = 0;

    if (this.currentSlug) {
      document.dispatchEvent(
        new CustomEvent("portfolio:setVisible", {
          detail: { slug: this.currentSlug, visible: true },
        }),
      );
    }

    this.currentSlug = null;
  }

  public destroy(): void {
    document.removeEventListener(
      "worklist:open",
      this.handleOpen as unknown as EventListener,
    );

    this.closeEl.removeEventListener("click", this.closeToOrigin);
    this.closeZoneEl.removeEventListener("click", this.closeToOrigin);

    this.observer?.kill();
    this.destroyPointerEvents();
    this.destroyResizeHandler();

    this.cursor = null;

    this.disposeCurrentSlide();
    this.sharedGeometry.dispose();

    this.world?.scene.remove(this.slideGroup);
  }
}
