import gsap from "gsap";
// gsap の型定義がWindows上で大文字小文字の衝突を起こすため抑制 (see: gsap/types/index.d.ts の draggable.d.ts 参照)
// @ts-ignore
import { Draggable } from "gsap/Draggable";
// @ts-ignore
import { InertiaPlugin } from "gsap/InertiaPlugin";

import { urlFor } from "../../Sanity"; import { fetchVimeoInfo } from "../../utils/vimeo";
import { HoverInvertCursor } from "../../utils/HoverInvertCursor";
gsap.registerPlugin(Draggable, InertiaPlugin);

/**
 * 列数の切り替えポイント。
 * WorkList.scss の @media breakpoint と揃える必要がある。
 */
const COLUMN_BREAKPOINTS = [
  { minWidth: 1440, columns: 5 },
  { minWidth: 1024, columns: 4 },
  { minWidth: 640, columns: 3 },
  { minWidth: 0, columns: 2 },
];

export class WorkList {
  private readonly root: HTMLElement;
  private readonly world: HTMLElement;
  private readonly items: HTMLElement[];

  private columnElements: HTMLElement[] = [];

  private draggable: Draggable | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;

  private hoverCleanups: Array<() => void> = [];

  private suppressClick = false;

  private cursor: HoverInvertCursor | null = null;
  private videoObserver: IntersectionObserver | null = null;

  constructor(root: HTMLElement) {
    this.root = root;

    const world = root.querySelector<HTMLElement>(
      "[data-portfolio-world]",
    );

    if (!world) {
      throw new Error("WorkList world was not found.");
    }

    this.world = world;

    this.items = Array.from(
      root.querySelectorAll<HTMLElement>("[data-portfolio-item]"),
    );
  }

  public init(): void {
    this.resolveMedia();
    this.buildColumns();
    this.initAnimation();
    this.initDrag();
    this.cursor = new HoverInvertCursor(document.body);
    this.initHover();
    this.initClickGuard();
    this.initResizeObserver();
  }

  /**
   * data-image-ref から Sanity の画像URLを解決して背景に設定する。
   * data-vimeo-url は画面に入ってからiframeを生成して自動再生する(遅延読み込み)。
   */
  private resolveMedia(): void {
    this.items.forEach((item) => {
      const imageMedia = item.querySelector<HTMLElement>(
        "[data-image-ref]",
      );

      const ref = imageMedia?.dataset.imageRef;

      if (imageMedia && ref) {
        const url = urlFor({
          _type: "image",
          asset: { _type: "reference", _ref: ref },
        })
          .width(600)
          .url();

        imageMedia.style.backgroundImage = `url(${url})`;
      }

      const videoMedia = item.querySelector<HTMLElement>(
        "[data-vimeo-url]",
      );

      const vimeoUrl = videoMedia?.dataset.vimeoUrl;

      if (videoMedia && vimeoUrl) {
        this.observeVideo(videoMedia, vimeoUrl);
      }
    });
  }

  /**
   * 動画は画面内に入ってから読み込む(多数のiframeを同時再生しないための対策)。
   * 処理負荷が気になる場合は、この閾値/rootMarginを調整するか
   * ホバー時にのみ読み込む方式に変更してください。
   */
  private observeVideo(target: HTMLElement, vimeoUrl: string): void {
    if (!this.videoObserver) {
      this.videoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            const el = entry.target as HTMLElement;
            const url = el.dataset.vimeoUrl;

            this.videoObserver?.unobserve(el);

            if (url) {
              this.loadVideo(el, url);
            }
          });
        },
        {
          root: this.root,
          rootMargin: "200px",
        },
      );
    }

    this.videoObserver.observe(target);
  }

  private async loadVideo(
    target: HTMLElement,
    vimeoUrl: string,
  ): Promise<void> {
    const info = await fetchVimeoInfo(vimeoUrl);

    if (!info) {
      return;
    }

    if (info.posterUrl) {
      target.style.backgroundImage = `url(${info.posterUrl})`;
    }

    const iframe = document.createElement("iframe");
    iframe.src = info.embedUrl;
    iframe.allow = "autoplay; fullscreen";
    iframe.setAttribute("loading", "lazy");

    target.appendChild(iframe);
  }

  /**
   * 作品を縦一列(flex-direction: column)ずつの列に振り分け、
   * その列同士を display:flex で横並びにする。
   *
   * GSAPではなく自前のDOM操作。
   */
  private buildColumns(): void {
    const columnCount = this.getColumnCount();

    this.columnElements.forEach((column) => column.remove());

    const columns: HTMLElement[] = Array.from(
      { length: columnCount },
      () => {
        const column = document.createElement("div");
        column.className = "portfolio-canvas__column";
        return column;
      },
    );

    this.items.forEach((item, index) => {
      columns[index % columnCount].appendChild(item);
    });

    columns.forEach((column) => this.world.appendChild(column));

    this.columnElements = columns;

    this.applyStagger();
  }

  /**
   * 隣の列を先頭画像の高さの半分だけ下にずらす。
   *
   * ┌────┐
   * │    │
   * └────┘
   *      ┌────┐
   *      │    │
   *      └────┘
   *
   * GSAPではなく素のstyle操作。
   */
  private applyStagger(): void {
    this.columnElements.forEach((column, index) => {
      const firstItem =
        column.firstElementChild as HTMLElement | null;

      const offset =
        index % 2 === 1 && firstItem
          ? firstItem.offsetHeight / 2
          : 0;

      column.style.marginTop = `${offset}px`;
    });
  }

  private getColumnCount(): number {
    const width = this.root.clientWidth;

    const match = COLUMN_BREAKPOINTS.find(
      (breakpoint) => width >= breakpoint.minWidth,
    );

    return match?.columns ?? 2;
  }

  /**
   * 初期表示アニメーション。ここはGSAP。
   */
  private initAnimation(): void {
    gsap.fromTo(
      this.items,
      {
        autoAlpha: 0,
        scale: 0.96,
      },
      {
        autoAlpha: 1,
        scale: 1,
        duration: 1,
        stagger: {
          amount: 0.5,
          from: "random",
        },
        ease: "power3.out",
      },
    );
  }

  /**
   * Palmer風ドラッグ。Draggable + InertiaPlugin。
   */
  private initDrag(): void {
    this.draggable?.kill();

    const instances = Draggable.create(this.world, {
      type: "x,y",
      inertia: true,
      dragClickables: true,
      bounds: this.getDragBounds(),
      edgeResistance: 0.8,
      cursor: "grab",
      activeCursor: "grabbing",

      onPress: () => {
        this.root.classList.add("is-dragging");
      },

      onDrag: () => {
        this.suppressClick = true;
      },

      onDragEnd: () => {
        this.root.classList.remove("is-dragging");

        /*
         * drag後にリンク/ボタンのクリックが
         * 発火するのを防止。
         */
        window.setTimeout(() => {
          this.suppressClick = false;
        }, 50);
      },
    });

    this.draggable = instances[0] ?? null;
  }

  private getDragBounds(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    const viewportWidth = this.root.clientWidth;
    const viewportHeight = this.root.clientHeight;
    const worldWidth = this.world.offsetWidth;
    const worldHeight = this.world.offsetHeight;

    return {
      minX: Math.min(0, viewportWidth - worldWidth),
      maxX: 0,
      minY: Math.min(0, viewportHeight - worldHeight),
      maxY: 0,
    };
  }

  /**
   * Hover Animation。拡大はGSAP、
   * カーソルの追従・色反転オーバーは HoverInvertCursor に任せる。
   */
  private initHover(): void {
    this.items.forEach((item) => {
      const media = item.querySelector<HTMLElement>(
        "[data-portfolio-media]",
      );

      if (!media) {
        return;
      }

      const handleEnter = (event: PointerEvent) => {
        gsap.to(media, {
          scale: 1.08,
          duration: 0.6,
          ease: "power3.out",
          overwrite: true,
        });

        const label = item.dataset.slug ? "Discover →" : "Back →";
        this.cursor?.enter(media, label, event.clientX, event.clientY);
      };

      const handleMove = (event: PointerEvent) => {
        this.cursor?.move(event.clientX, event.clientY);
      };

      const handleLeave = () => {
        gsap.to(media, {
          scale: 1,
          duration: 0.6,
          ease: "power3.out",
          overwrite: true,
        });

        this.cursor?.leave();
      };

      item.addEventListener("pointerenter", handleEnter);
      item.addEventListener("pointermove", handleMove);
      item.addEventListener("pointerleave", handleLeave);

      this.hoverCleanups.push(() => {
        item.removeEventListener("pointerenter", handleEnter);
        item.removeEventListener("pointermove", handleMove);
        item.removeEventListener("pointerleave", handleLeave);
      });
    });
  }

  /**
   * Dragしたときにボタンのクリックが発火してしまうのを防ぐ。
   * ドラッグでなければ作品詳細(WorkDetail)を開くイベントを発火する。
   */
  private initClickGuard(): void {
    this.root.addEventListener("click", this.handleClick, true);
  }

  private handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>(
      "[data-portfolio-item]",
    );

    if (!item) {
      return;
    }

    if (this.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const media = item.querySelector<HTMLElement>(
      "[data-portfolio-media]",
    );

    const slug = item.dataset.slug;
    const title = item.dataset.title ?? "";

    if (!media || !slug) {
      return;
    }

    document.dispatchEvent(
      new CustomEvent("worklist:open", {
        detail: { slug, title, media },
      }),
    );
  };

  /**
   * Responsive。ResizeObserverはブラウザ標準API。
   */
  private initResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== null) {
        cancelAnimationFrame(this.resizeFrame);
      }

      this.resizeFrame = requestAnimationFrame(() => {
        this.handleResize();
        this.resizeFrame = null;
      });
    });

    this.resizeObserver.observe(this.root);
  }

  private handleResize(): void {
    this.buildColumns();
    this.initDrag();
  }

  public destroy(): void {
    this.draggable?.kill();
    this.draggable = null;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
    }

    this.hoverCleanups.forEach((cleanup) => cleanup());
    this.hoverCleanups = [];

    this.cursor?.destroy();
    this.cursor = null;

    this.videoObserver?.disconnect();
    this.videoObserver = null;

    this.root.removeEventListener("click", this.handleClick, true);

    gsap.killTweensOf(this.items);

    this.items.forEach((item) => {
      const media = item.querySelector("[data-portfolio-media]");

      if (media) {
        gsap.killTweensOf(media);
      }
    });
  }
}
