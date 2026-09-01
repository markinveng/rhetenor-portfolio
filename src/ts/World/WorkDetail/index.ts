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
  createHoverInvertMaterial,
  type HoverInvertMaterialHandle,
} from "../../materials/createHoverInvertMaterial";
import { HoverInvertCursor } from "../../utils/HoverInvertCursor";
import type { MediaItem, Portfolio } from "../../../types/portfolio";

gsap.registerPlugin(Observer);

const portfolioApi = new PortfolioApi();

const RAIL_WIDTH = 96;
const SLIDE_TRANSITION_DURATION = 0.7;

interface ScreenRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OpenEventDetail {
  slug: string;
  title: string;
  rect: ScreenRect;
  imageUrl: string | null;
}

type SlideKind = "image" | "video";

interface SlideSource {
  kind: SlideKind;
  /** image: Sanity画像URL, video: Cloudflareにホストした動画の直接URL */
  url: string;
  /** レール・クロスフェード用のポスター画像(video種別には無い) */
  posterUrl: string | null;
  aspectRatio: number;
}

interface SlideEntry {
  kind: SlideKind;
  /** THREE.Mesh/THREE.Texture(three/webgpuには@types/threeのサブパス型定義が無いためany)。 */
  mesh: any;
  hover: HoverInvertMaterialHandle;
  videoHandle: VideoTextureHandle | null;
  texture: any;
  aspectRatio: number;
  baseWidth: number;
  baseHeight: number;
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
  /** 可視コンテンツは持たない。ドラッグ/ホイール入力のヒットゾーン。 */
  private readonly scrollEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly closeEl: HTMLElement;
  private readonly closeZoneEl: HTMLElement;

  private heroEl: HTMLElement | null = null;
  private railItemEls: HTMLElement[] = [];

  private world: WorldContext | null = null;
  private readonly slideGroup = new THREE.Group();
  private readonly sharedGeometry = new THREE.PlaneGeometry(1, 1);

  private slideEntries: SlideEntry[] = [];
  private slideSources: SlideSource[] = [];

  private observer: Observer | null = null;

  private isOpen = false;

  private currentSlug: string | null = null;
  private originRect: ScreenRect | null = null;
  private originImageUrl: string | null = null;

  private mediaCount = 0;
  private hasLoop = false;

  /** 論理的な現在位置。実データのindex範囲を超えて連続的に増減する(無限ループ用)。 */
  private activeIndexFloat = 0;
  private activeRealIndex = 0;

  private panelWorldWidth = 0;
  private panelWorldHeight = 0;
  private panelWorldCenterX = 0;
  private panelWorldCenterY = 0;
  private pixelsToWorld = 0;

  private cursor: HoverInvertCursor | null = null;
  private hoveredEntry: SlideEntry | null = null;

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

    this.cursor = new HoverInvertCursor(document.body);

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

    const { slug, title, rect, imageUrl } = event.detail;

    this.currentSlug = slug;
    this.originRect = rect;
    this.originImageUrl = imageUrl;

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

    const animationDone = this.animateHeroIn(rect, imageUrl);
    const portfolio = await this.fetchPortfolio(slug);

    if (!portfolio) {
      await animationDone;
      this.failAndReset();
      return;
    }

    await animationDone;

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
   * クリックされたPlaneの画面上の位置(rect)から、画面左半分いっぱいまで
   * 拡大させるFLIP風アニメーション。ここはGSAP。
   */
  private animateHeroIn(
    rect: ScreenRect,
    imageUrl: string | null,
  ): Promise<void> {
    const hero = document.createElement("div");
    hero.className = "work-detail__hero";

    if (imageUrl) {
      hero.style.backgroundImage = `url(${imageUrl})`;
    }

    hero.style.top = `${rect.top}px`;
    hero.style.left = `${rect.left}px`;
    hero.style.width = `${rect.width}px`;
    hero.style.height = `${rect.height}px`;

    document.body.appendChild(hero);
    this.heroEl = hero;

    const targetWidth = window.innerWidth / 2 - RAIL_WIDTH;
    const targetHeight = window.innerHeight;

    return new Promise((resolve) => {
      let settled = false;

      const finish = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      gsap.to(hero, {
        top: 0,
        left: RAIL_WIDTH,
        width: targetWidth,
        height: targetHeight,
        duration: 0.9,
        ease: "power3.inOut",
        onComplete: finish,
      });

      /*
       * tabが非アクティブ等でアニメーションが進まない場合でも
       * オーバーレイが開いたまま固まらないようにする安全策。
       */
      window.setTimeout(finish, 1500);
    });
  }

  /**
   * 取得したPortfolioデータから、スライド用のPlane群とレールを構築する。
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
    this.hasLoop = this.mediaCount > 1;
    this.activeIndexFloat = 0;
    this.activeRealIndex = 0;

    this.titleEl.textContent = title;

    this.updatePanelWorldRect();
    this.buildSlideEntries();
    this.buildRail(title);
    this.updateSlidePositions();

    /*
     * hero(FLIP用の仮要素)から、Plane側へ見た目そのままバトンタッチする。
     */
    this.slideEntries.forEach((entry) => {
      entry.hover.setOpacity(0, false);
      entry.hover.setOpacity(1);
    });

    window.setTimeout(() => {
      this.heroEl?.remove();
      this.heroEl = null;
    }, 300);

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
   * 各メディアに対応するPlaneを作る。image/video(Cloudflare動画URL)
   * どちらも実テクスチャを焼き込んだPlaneとして描画する。
   */
  private buildSlideEntries(): void {
    this.disposeSlideEntries();

    this.slideEntries = this.slideSources.map((source) => {
      let texture: any;
      let videoHandle: VideoTextureHandle | null = null;

      if (source.kind === "video") {
        videoHandle = createVideoTexture(source.url);
        texture = videoHandle.texture;

        videoHandle.ready.then(({ width, height }) => {
          if (width > 0 && height > 0) {
            source.aspectRatio = width / height;
            this.updateSlidePositions();
          }
        });
      } else {
        const loadedTexture = new THREE.TextureLoader().load(
          source.url,
          (loaded: any) => {
            const image = loaded.image as HTMLImageElement;

            if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
              source.aspectRatio = image.naturalWidth / image.naturalHeight;
            }

            this.updateSlidePositions();
          },
        );
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        texture = loadedTexture;
      }

      const hover = createHoverInvertMaterial(texture);
      const mesh = new THREE.Mesh(this.sharedGeometry, hover.material);

      /*
       * WaterBackground(-1)とWorkListのグリッド(1)より手前に描画し、
       * 選択中の作品が背景に埋もれないようにする。
       */
      mesh.renderOrder = 2;
      this.slideGroup.add(mesh);

      const entry: SlideEntry = {
        kind: source.kind,
        mesh,
        hover,
        videoHandle,
        texture,
        aspectRatio: source.aspectRatio,
        baseWidth: 0,
        baseHeight: 0,
      };

      return entry;
    });
  }

  /**
   * 現在のスクロール位置(activeIndexFloat)から、各Planeの
   * ローカル位置を計算する。実メディア数ぶんのPlaneだけで
   * 無限ループに見せるため、各Planeを「現在位置に一番近い巻き戻し位置」に置く。
   */
  private updateSlidePositions(): void {
    if (!this.world || this.mediaCount === 0) {
      return;
    }

    this.slideEntries.forEach((entry, index) => {
      const fit = containFit(
        entry.aspectRatio,
        this.panelWorldWidth,
        this.panelWorldHeight,
      );

      entry.baseWidth = fit.width;
      entry.baseHeight = fit.height;
      entry.mesh.scale.set(fit.width, fit.height, 1);

      entry.hover?.setPlaneSize(fit.width, fit.height, this.pixelsToWorld);

      let localY = 0;

      if (this.hasLoop) {
        const totalSteps = this.mediaCount;
        const nearestK = Math.round(
          (this.activeIndexFloat - index) / totalSteps,
        );
        const virtualIndex = index + nearestK * totalSteps;

        localY =
          -(virtualIndex - this.activeIndexFloat) * this.panelWorldHeight;
      }

      entry.mesh.position.set(0, localY, 0);
    });

    this.updateActiveRealIndex();
  }

  private updateActiveRealIndex(): void {
    const nearestIndex = mod(
      Math.round(this.activeIndexFloat),
      this.mediaCount || 1,
    );

    if (nearestIndex === this.activeRealIndex) {
      return;
    }

    this.activeRealIndex = nearestIndex;

    this.railItemEls.forEach((railItem, railIndex) => {
      railItem.classList.toggle("is-active", railIndex === nearestIndex);
    });
  }

  /**
   * ホイール/タッチ/ドラッグを1ジェスチャー=1スライドの
   * カルーセル操作として扱う(元DOM実装の scroll-snap-stop: always と同じ挙動)。
   */
  private initScrollObserver(): void {
    this.observer?.kill();

    if (!this.hasLoop) {
      return;
    }

    /*
     * "pointer"は含めない。preventDefault:trueと組み合わせると
     * マウスクリックでのスライド遷移(navigateToWork)を阻害する恐れがあるため、
     * 元のDOM実装と同じくホイール/タッチのみをスクロール操作として扱う。
     */
    this.observer = Observer.create({
      target: this.scrollEl,
      type: "wheel,touch",
      preventDefault: true,
      onUp: () => this.goToSlide(this.activeIndexFloat - 1),
      onDown: () => this.goToSlide(this.activeIndexFloat + 1),
    });
  }

  private goToSlide(targetIndex: number): void {
    gsap.to(this, {
      activeIndexFloat: targetIndex,
      duration: SLIDE_TRANSITION_DURATION,
      ease: "power3.inOut",
      overwrite: true,
      onUpdate: () => this.updateSlidePositions(),
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
        const totalSteps = this.mediaCount;
        const nearestK = Math.round(
          (this.activeIndexFloat - index) / totalSteps,
        );

        this.goToSlide(index + nearestK * totalSteps);
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

  private raycastAt(clientX: number, clientY: number): SlideEntry | null {
    if (!this.world) {
      return null;
    }

    this.pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(
      this.pointerNdc,
      this.world.cameraController.camera,
    );

    const meshes = this.slideEntries.map((entry) => entry.mesh);

    const intersections = this.raycaster.intersectObjects(meshes, false);

    if (intersections.length === 0) {
      return null;
    }

    const hit = intersections[0];
    const entry = this.slideEntries.find((e) => e.mesh === hit.object);

    if (entry && hit.uv) {
      entry.hover?.setPointerUv(hit.uv.x, hit.uv.y);
    }

    return entry ?? null;
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.isOpen) {
      return;
    }

    const entry = this.raycastAt(event.clientX, event.clientY);

    if (entry !== this.hoveredEntry) {
      this.hoveredEntry?.hover?.setActive(false);
      this.hoveredEntry = entry;

      if (entry) {
        entry.hover?.setActive(true);
        this.cursor?.enter("Discover →", event.clientX, event.clientY);
      } else {
        this.cursor?.leave();
      }

      return;
    }

    if (entry) {
      this.cursor?.move(event.clientX, event.clientY);
    }
  };

  private handleClick = (event: MouseEvent): void => {
    if (!this.isOpen) {
      return;
    }

    const entry = this.raycastAt(event.clientX, event.clientY);

    if (entry) {
      this.navigateToWork();
    }
  };

  /*-------------------------------
    リサイズ
  -------------------------------*/

  private initResizeHandler(): void {
    this.resizeHandler = (): void => {
      this.updatePanelWorldRect();
      this.updateSlidePositions();
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
   * 画面右クリックで、拡大前の状態(サムネイルの位置・サイズ)へ
   * 戻すFLIP風アニメーション。ここはGSAP。
   */
  private closeToOrigin = (): void => {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;

    const originRect = this.originRect;

    gsap.set([this.panelEl, this.closeEl], { autoAlpha: 0 });
    document.body.classList.remove("has-open-work-detail");

    if (!originRect) {
      this.resetState();
      return;
    }

    const activeSource = this.slideSources[this.activeRealIndex];
    const activeUrl = activeSource?.posterUrl ?? null;
    const originUrl = this.originImageUrl;

    /*
     * サムネイル以外(previewMediaの2枚目以降)を見ている状態で戻る場合、
     * 表示中の画像とサムネイル画像が異なるため、位置アニメーションの終盤で
     * 画像自体もクロスフェードさせて突然の切り替わりを防ぐ。
     */
    const needsCrossfade = this.activeRealIndex !== 0 && !!originUrl;

    const hero = document.createElement("div");
    hero.className = "work-detail__hero";

    const currentLayer = document.createElement("div");
    currentLayer.className = "work-detail__hero-layer";

    if (activeUrl) {
      currentLayer.style.backgroundImage = `url(${activeUrl})`;
    }

    hero.appendChild(currentLayer);

    let targetLayer: HTMLElement | null = null;

    if (needsCrossfade) {
      targetLayer = document.createElement("div");
      targetLayer.className = "work-detail__hero-layer";
      targetLayer.style.backgroundImage = `url(${originUrl})`;
      targetLayer.style.opacity = "0";

      hero.appendChild(targetLayer);
    }

    hero.style.top = "0px";
    hero.style.left = `${RAIL_WIDTH}px`;
    hero.style.width = `${window.innerWidth / 2 - RAIL_WIDTH}px`;
    hero.style.height = `${window.innerHeight}px`;

    document.body.appendChild(hero);

    this.slideEntries.forEach((entry) => entry.hover.setOpacity(0));

    const timeline = gsap.timeline({
      onComplete: () => {
        hero.remove();
        this.resetState();
      },
    });

    timeline.to(
      hero,
      {
        top: originRect.top,
        left: originRect.left,
        width: originRect.width,
        height: originRect.height,
        duration: 0.7,
        ease: "power3.inOut",
      },
      0,
    );

    if (targetLayer) {
      timeline.to(
        targetLayer,
        {
          opacity: 1,
          duration: 0.3,
          ease: "power2.out",
        },
        0.4,
      );
    }
  };

  /**
   * データ取得に失敗した場合の後始末。
   */
  private failAndReset(): void {
    document.body.classList.remove("has-open-work-detail");

    if (this.heroEl) {
      gsap.to(this.heroEl, {
        autoAlpha: 0,
        duration: 0.4,
        onComplete: () => this.resetState(),
      });

      return;
    }

    this.resetState();
  }

  private disposeSlideEntries(): void {
    this.slideEntries.forEach((entry) => {
      entry.hover.dispose();

      if (entry.videoHandle) {
        /* videoHandle.dispose()がtexture.disposeも兼ねる */
        entry.videoHandle.dispose();
      } else {
        entry.texture?.dispose();
      }

      this.slideGroup.remove(entry.mesh);
    });

    this.slideEntries = [];
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

    this.hoveredEntry?.hover?.setActive(false);
    this.hoveredEntry = null;
    this.cursor?.leave();

    this.heroEl?.remove();
    this.heroEl = null;

    gsap.killTweensOf(this.panelEl);
    gsap.set(this.panelEl, { autoAlpha: 1, x: 0 });

    gsap.set(
      [this.railEl, this.titleEl, this.closeEl],
      { autoAlpha: 0 },
    );

    this.railEl.style.visibility = "hidden";
    this.titleEl.style.visibility = "hidden";
    this.closeEl.style.visibility = "hidden";

    this.railEl.innerHTML = "";

    this.disposeSlideEntries();

    this.railItemEls = [];
    this.slideSources = [];
    this.mediaCount = 0;
    this.hasLoop = false;
    this.activeIndexFloat = 0;
    this.activeRealIndex = 0;

    if (this.currentSlug) {
      document.dispatchEvent(
        new CustomEvent("portfolio:setVisible", {
          detail: { slug: this.currentSlug, visible: true },
        }),
      );
    }

    this.currentSlug = null;
    this.originRect = null;
    this.originImageUrl = null;
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

    this.cursor?.destroy();
    this.cursor = null;

    this.disposeSlideEntries();
    this.sharedGeometry.dispose();

    this.world?.scene.remove(this.slideGroup);

    this.heroEl?.remove();
  }
}
