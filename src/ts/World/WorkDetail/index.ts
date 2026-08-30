import gsap from "gsap";
import Lenis from "lenis";

import { PortfolioApi, urlFor } from "../../Sanity";
import type {
  MediaItem,
  Portfolio,
} from "../../../types/portfolio";

const portfolioApi = new PortfolioApi();

const RAIL_WIDTH = 96;

/** ドラッグでスワイプ閉じと判定する左方向の距離(px) */
const SWIPE_CLOSE_THRESHOLD = 50;

interface OpenEventDetail {
  slug: string;
  title: string;
  media: HTMLElement;
}

/**
 * Sanityの画像、またはVimeoのサムネイル画像URLを解決する。
 * VimeoはoEmbed APIから動画のサムネイル画像を取得する。
 */
async function resolveMediaUrl(
  media: MediaItem,
): Promise<string | null> {
  if (media.type === "img") {
    return urlFor(media.image).width(1200).url();
  }

  try {
    const response = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(
        media.vimeoUrl,
      )}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      thumbnail_url?: string;
    };

    return typeof data.thumbnail_url === "string"
      ? data.thumbnail_url
      : null;
  } catch {
    return null;
  }
}

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  mode: "none" | "horizontal" | "vertical";
}

export class WorkDetail {
  private readonly root: HTMLElement;
  private readonly panelEl: HTMLElement;
  private readonly railEl: HTMLElement;
  private readonly scrollEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly closeEl: HTMLElement;
  private readonly closeZoneEl: HTMLElement;

  private heroEl: HTMLElement | null = null;
  private slideEls: HTMLElement[] = [];
  private railItemEls: HTMLElement[] = [];

  private slideObserver: IntersectionObserver | null = null;
  private scrollDebounceId: number | null = null;

  private isOpen = false;

  private currentSlug: string | null = null;
  private originMediaEl: HTMLElement | null = null;

  private mediaUrls: Array<string | null> = [];
  private mediaCount = 0;
  private hasLoop = false;
  private activeRealIndex = 0;

  private dragState: DragState = {
    active: false,
    startX: 0,
    startY: 0,
    mode: "none",
  };

  /** ドラッグ後の誤クリック(意図しないスライド遷移)を防ぐフラグ */
  private suppressSlideClick = false;

  constructor(root: HTMLElement) {
    this.root = root;

    this.panelEl = this.requireEl("[data-work-detail-panel]");
    this.railEl = this.requireEl("[data-work-detail-rail]");
    this.scrollEl = this.requireEl("[data-work-detail-scroll]");
    this.titleEl = this.requireEl("[data-work-detail-title]");
    this.closeEl = this.requireEl("[data-work-detail-close]");
    this.closeZoneEl = this.requireEl(
      "[data-work-detail-close-zone]",
    );
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

    document.addEventListener(
      "worklist:open",
      this.handleOpen as EventListener,
    );

    this.closeEl.addEventListener("click", this.closeToOrigin);
    this.closeZoneEl.addEventListener("click", this.closeToOrigin);

    this.panelEl.addEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
  }

  private handleOpen = async (
    event: CustomEvent<OpenEventDetail>,
  ): Promise<void> => {
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;

    const { slug, title, media } = event.detail;

    this.currentSlug = slug;
    this.originMediaEl = media;

    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-open-work-detail");

    const animationDone = this.animateHeroIn(media);
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
   * クリックされたサムネイルの位置から、画面左半分いっぱいまで
   * 拡大させるFLIP風アニメーション。ここはGSAP。
   */
  private animateHeroIn(sourceMedia: HTMLElement): Promise<void> {
    const rect = sourceMedia.getBoundingClientRect();

    const hero = document.createElement("div");
    hero.className = "work-detail__hero";
    hero.style.backgroundImage = sourceMedia.style.backgroundImage;
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
   * 取得したPortfolioデータからサムネイル用レール、
   * スクロールで切り替わるスライドを構築する。
   */
  private async showDetail(
    portfolio: Portfolio,
    title: string,
  ): Promise<void> {
    const mediaList: MediaItem[] = [
      portfolio.thumbnailMedia,
      ...(portfolio.previewMedia ?? []),
    ];

    this.mediaUrls = await Promise.all(
      mediaList.map((media) => resolveMediaUrl(media)),
    );

    this.mediaCount = mediaList.length;
    this.hasLoop = this.mediaCount > 1;
    this.activeRealIndex = 0;

    this.titleEl.textContent = title;

    this.buildSlides();
    this.buildRail(title);
    this.initSlideObserver();

    /*
     * hero(FLIP用の仮要素)から、実スクロール要素へ
     * 見た目そのままバトンタッチする。
     */
    gsap.set(this.scrollEl, { autoAlpha: 0 });
    this.scrollEl.style.visibility = "visible";

    gsap.to(this.scrollEl, {
      autoAlpha: 1,
      duration: 0.3,
      onComplete: () => {
        this.heroEl?.remove();
        this.heroEl = null;
      },
    });

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
  }

  /**
   * 無限スクロールのため前後にクローンを1枚ずつ足し、
   * 境界に到達したら実位置へ瞬間ジャンプさせる(GSAPではない)。
   */
  private buildSlides(): void {
    this.scrollEl.removeEventListener(
      "scroll",
      this.handleInfiniteScroll,
    );

    this.scrollEl.innerHTML = "";

    const extendedCount = this.hasLoop
      ? this.mediaCount + 2
      : this.mediaCount;

    this.slideEls = Array.from(
      { length: extendedCount },
      (_, extIndex) => {
        const realIndex = this.toRealIndex(extIndex);

        const slide = document.createElement("div");
        slide.className = "work-detail__slide";

        const url = this.mediaUrls[realIndex];

        if (url) {
          slide.style.backgroundImage = `url(${url})`;
        }

        slide.addEventListener("click", this.navigateToWork);

        this.scrollEl.appendChild(slide);

        return slide;
      },
    );

    const startExtIndex = this.hasLoop ? 1 : 0;

    requestAnimationFrame(() => {
      this.scrollEl.scrollTop =
        startExtIndex * this.scrollEl.clientHeight;
    });

    if (this.hasLoop) {
      this.scrollEl.addEventListener(
        "scroll",
        this.handleInfiniteScroll,
        { passive: true },
      );
    }
  }

  /**
   * 前後にクローンを足した配列上のindexから、実データ上のindexへ変換する。
   */
  private toRealIndex(extIndex: number): number {
    if (!this.hasLoop) {
      return extIndex;
    }

    return (extIndex - 1 + this.mediaCount) % this.mediaCount;
  }

  /**
   * クローン(先頭/末尾)まで到達したら、対応する実位置へ
   * スクロールを瞬間的に戻すことで無限スクロールに見せる。
   */
  private handleInfiniteScroll = (): void => {
    if (this.scrollDebounceId !== null) {
      window.clearTimeout(this.scrollDebounceId);
    }

    this.scrollDebounceId = window.setTimeout(() => {
      const slideHeight = this.scrollEl.clientHeight;
      const extIndex = Math.round(
        this.scrollEl.scrollTop / slideHeight,
      );

      if (extIndex === 0) {
        this.scrollEl.scrollTop = this.mediaCount * slideHeight;
      } else if (extIndex === this.mediaCount + 1) {
        this.scrollEl.scrollTop = 1 * slideHeight;
      }

      this.scrollDebounceId = null;
    }, 120);
  };

  private buildRail(title: string): void {
    this.railEl.innerHTML = "";

    this.railItemEls = this.mediaUrls.map((url, index) => {
      const railItem = document.createElement("button");
      railItem.type = "button";
      railItem.className = "work-detail__rail-item";
      railItem.setAttribute(
        "aria-label",
        `${title} ${index + 1}`,
      );

      if (url) {
        railItem.style.backgroundImage = `url(${url})`;
      }

      railItem.addEventListener("click", () => {
        const targetExtIndex = this.hasLoop ? index + 1 : index;

        this.scrollEl.scrollTo({
          top: targetExtIndex * this.scrollEl.clientHeight,
          behavior: "smooth",
        });
      });

      this.railEl.appendChild(railItem);

      return railItem;
    });

    if (this.railItemEls[0]) {
      this.railItemEls[0].classList.add("is-active");
    }
  }

  /**
   * 画面左半分だけのスクロールで、
   * サムネイル→メディアリストの順に表示を切り替える。
   * アクティブなレール項目の切り替えは自前処理(GSAPではない)。
   */
  private initSlideObserver(): void {
    this.slideObserver?.disconnect();

    this.slideObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const extIndex = this.slideEls.indexOf(
            entry.target as HTMLElement,
          );

          const realIndex = this.toRealIndex(extIndex);

          this.activeRealIndex = realIndex;

          this.railItemEls.forEach((railItem, railIndex) => {
            railItem.classList.toggle(
              "is-active",
              railIndex === realIndex,
            );
          });
        });
      },
      {
        root: this.scrollEl,
        threshold: 0.6,
      },
    );

    this.slideEls.forEach((slide) => this.slideObserver?.observe(slide));
  }

  /**
   * スライドクリックで作品詳細ページへ遷移する。
   * Lenisで一度スムーズスクロールしてから遷移する。
   */
  private navigateToWork = (): void => {
    if (this.suppressSlideClick) {
      return;
    }

    const slug = this.currentSlug;

    if (!slug) {
      window.location.href = "/error";
      return;
    }

    const targetUrl = `/discover?prov=${encodeURIComponent(slug)}`;

    const lenis = new Lenis({ autoRaf: true });

    lenis.scrollTo(0, {
      duration: 0.8,
      onComplete: () => {
        lenis.destroy();
        window.location.href = targetUrl;
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

    const originRect =
      this.originMediaEl?.isConnected
        ? this.originMediaEl.getBoundingClientRect()
        : null;

    gsap.set([this.panelEl, this.closeEl], { autoAlpha: 0 });
    document.body.classList.remove("has-open-work-detail");

    if (!originRect) {
      this.resetState();
      return;
    }

    const activeUrl = this.mediaUrls[this.activeRealIndex] ?? null;

    const hero = document.createElement("div");
    hero.className = "work-detail__hero";

    if (activeUrl) {
      hero.style.backgroundImage = `url(${activeUrl})`;
    }

    hero.style.top = "0px";
    hero.style.left = `${RAIL_WIDTH}px`;
    hero.style.width = `${window.innerWidth / 2 - RAIL_WIDTH}px`;
    hero.style.height = `${window.innerHeight}px`;

    document.body.appendChild(hero);

    gsap.to(hero, {
      top: originRect.top,
      left: originRect.left,
      width: originRect.width,
      height: originRect.height,
      duration: 0.7,
      ease: "power3.inOut",
      onComplete: () => {
        hero.remove();
        this.resetState();
      },
    });
  };

  /**
   * 左スワイプで閉じる場合は、パネルごとそのまま画面外(左)へ
   * スライドさせる。元のサムネイルは位置移動ではなく
   * フェードで自然に浮かび上がる(has-open-work-detail解除によるCSS transition)。
   */
  private closeBySwipe(): void {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;

    document.body.classList.remove("has-open-work-detail");

    gsap.to(this.panelEl, {
      x: -window.innerWidth,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => this.resetState(),
    });

    gsap.to(this.closeEl, {
      autoAlpha: 0,
      duration: 0.25,
    });
  }

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

  private resetState(): void {
    this.isOpen = false;

    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-open-work-detail");

    this.slideObserver?.disconnect();
    this.slideObserver = null;

    if (this.scrollDebounceId !== null) {
      window.clearTimeout(this.scrollDebounceId);
      this.scrollDebounceId = null;
    }

    this.scrollEl.removeEventListener(
      "scroll",
      this.handleInfiniteScroll,
    );

    this.heroEl?.remove();
    this.heroEl = null;

    gsap.killTweensOf(this.panelEl);
    gsap.set(this.panelEl, { autoAlpha: 1, x: 0 });

    gsap.set(
      [this.scrollEl, this.railEl, this.titleEl, this.closeEl],
      { autoAlpha: 0 },
    );

    this.scrollEl.style.visibility = "hidden";
    this.railEl.style.visibility = "hidden";
    this.titleEl.style.visibility = "hidden";
    this.closeEl.style.visibility = "hidden";

    this.scrollEl.innerHTML = "";
    this.railEl.innerHTML = "";

    this.slideEls = [];
    this.railItemEls = [];
    this.mediaUrls = [];
    this.mediaCount = 0;
    this.hasLoop = false;
    this.activeRealIndex = 0;

    this.currentSlug = null;
    this.originMediaEl = null;
  }

  /**
   * 画面左のパネルを長押しドラッグして左にスワイプすると閉じる。
   * 横方向への動きだけを検知し、縦方向は通常のスクロールに任せる。
   */
  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.isOpen) {
      return;
    }

    this.dragState = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      mode: "none",
    };

    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp, {
      once: true,
    });
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragState.active) {
      return;
    }

    const dx = event.clientX - this.dragState.startX;
    const dy = event.clientY - this.dragState.startY;

    if (this.dragState.mode === "none") {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        return;
      }

      this.dragState.mode =
        Math.abs(dx) > Math.abs(dy) && dx < 0
          ? "horizontal"
          : "vertical";
    }

    if (this.dragState.mode === "horizontal") {
      event.preventDefault();

      this.suppressSlideClick = true;

      /*
       * 画面端まで手動でドラッグさせなくても、
       * 閾値を超えた時点で自動的に閉じ切る。
       */
      if (dx <= -SWIPE_CLOSE_THRESHOLD) {
        this.finishSwipeDrag();
        return;
      }

      gsap.set(this.panelEl, { x: dx });
    }
  };

  private finishSwipeDrag(): void {
    window.removeEventListener("pointermove", this.handlePointerMove);

    this.dragState.active = false;
    this.dragState.mode = "none";

    this.closeBySwipe();

    window.setTimeout(() => {
      this.suppressSlideClick = false;
    }, 50);
  }

  private handlePointerUp = (event: PointerEvent): void => {
    window.removeEventListener("pointermove", this.handlePointerMove);

    const dx = event.clientX - this.dragState.startX;

    if (this.dragState.mode === "horizontal") {
      if (dx <= -SWIPE_CLOSE_THRESHOLD) {
        this.closeBySwipe();
      } else {
        gsap.to(this.panelEl, {
          x: 0,
          duration: 0.3,
          ease: "power2.out",
        });
      }

      window.setTimeout(() => {
        this.suppressSlideClick = false;
      }, 50);
    }

    this.dragState.active = false;
    this.dragState.mode = "none";
  };

  public destroy(): void {
    document.removeEventListener(
      "worklist:open",
      this.handleOpen as EventListener,
    );

    this.closeEl.removeEventListener("click", this.closeToOrigin);
    this.closeZoneEl.removeEventListener("click", this.closeToOrigin);
    this.panelEl.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
    );

    window.removeEventListener("pointermove", this.handlePointerMove);

    this.scrollEl.removeEventListener(
      "scroll",
      this.handleInfiniteScroll,
    );

    this.slideObserver?.disconnect();
    this.heroEl?.remove();
  }
}
