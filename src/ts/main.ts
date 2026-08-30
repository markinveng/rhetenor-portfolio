import gsap from "gsap";
// gsap の型定義がWindows上で大文字小文字の衝突を起こすため抑制 (see: gsap/types/index.d.ts の draggable.d.ts 参照)
// @ts-ignore
import { Draggable } from "gsap/Draggable";
// @ts-ignore
import { InertiaPlugin } from "gsap/InertiaPlugin";

gsap.registerPlugin(
  Draggable,
  InertiaPlugin,
);

class WorkListController {
  private readonly element: HTMLElement;
  private readonly track: HTMLElement;
  private readonly items: HTMLElement[];

  private draggable: Draggable | null = null;

  private resizeObserver: ResizeObserver | null = null;

  private hoverCleanups: Array<() => void> = [];

  private resizeFrame: number | null = null;

  private suppressClick = false;

  constructor(element: HTMLElement) {
    this.element = element;

    const track =
      element.querySelector<HTMLElement>(
        "[data-work-list-track]",
      );

    if (!track) {
      throw new Error(
        "WorkList track was not found.",
      );
    }

    this.track = track;

    this.items = Array.from(
      element.querySelectorAll<HTMLElement>(
        "[data-work-item]",
      ),
    );
  }

  /**
   * Angularでいう
   * ngAfterViewInit に近い役割
   */
  init(): void {
    this.initLayout();
    this.initAnimation();
    this.initDrag();
    this.initHover();
    this.initClickGuard();
    this.initResizeObserver();
  }

  /**
   * 作品の位置計算
   *
   * GSAPではなく自前処理。
   */
  private initLayout(
    animate = false,
  ): void {
    const config =
      this.getLayoutConfig();

    const {
      columns,
      cardWidth,
      columnGap,
      rowGap,
      padding,
    } = config;

    /*
     * 先に全カードの幅を確定させる。
     *
     * widthが確定したあとなら
     * offsetHeightから実際の高さを取得できる。
     */
    this.items.forEach((item) => {
      item.style.width =
        `${cardWidth}px`;
    });

    /*
     * 各列の現在のY座標。
     */
    const columnY = Array.from(
      { length: columns },
      () => padding,
    );

    /*
     * 奇数列がまだ最初の要素かどうか。
     */
    const initializedColumns =
      Array.from(
        { length: columns },
        () => false,
      );

    this.items.forEach(
      (item, index) => {
        /*
         * 0
         * 1
         * 2
         * 3
         * 0
         * 1
         * ...
         */
        const column =
          index % columns;

        const itemHeight =
          item.offsetHeight;

        /*
         * 隣の列を
         * 要素の半分だけ下へずらす。
         *
         * ┌────┐
         * │    │
         * └────┘
         *
         *      ┌────┐
         *      │    │
         *      └────┘
         */
        if (
          !initializedColumns[column]
        ) {
          if (column % 2 === 1) {
            columnY[column] +=
              itemHeight / 2;
          }

          initializedColumns[column] =
            true;
        }

        const x =
          padding +
          column *
          (cardWidth +
            columnGap);

        const y =
          columnY[column];

        if (animate) {
          this.animateItemPosition(
            item,
            x,
            y,
          );
        } else {
          gsap.set(item, {
            x,
            y,
          });
        }

        columnY[column] +=
          itemHeight + rowGap;
      },
    );

    /*
     * Canvas全体のサイズを計算。
     */
    const trackWidth =
      padding * 2 +
      columns * cardWidth +
      (columns - 1) *
      columnGap;

    const trackHeight =
      Math.max(...columnY) +
      padding;

    this.track.style.width =
      `${trackWidth}px`;

    this.track.style.height =
      `${trackHeight}px`;
  }

  /**
   * Resize時だけGSAPで
   * 滑らかに再配置。
   *
   * 座標計算自体はGSAPではない。
   */
  private animateItemPosition(
    item: HTMLElement,
    x: number,
    y: number,
  ): void {
    gsap.to(item, {
      x,
      y,

      duration: 0.8,

      ease: "power3.out",

      overwrite: true,
    });
  }

  /**
   * 初期表示アニメーション
   *
   * ここはGSAP。
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
   * Palmer風ドラッグ。
   *
   * Draggable + InertiaPlugin。
   */
  private initDrag(): void {
    this.draggable?.kill();

    const bounds =
      this.getDragBounds();

    const instances =
      Draggable.create(
        this.track,
        {
          type: "x,y",

          /*
           * 慣性。
           */
          inertia: true,

          /*
           * <a>上からでも
           * ドラッグ開始できるようにする。
           */
          dragClickables: true,

          /*
           * Canvas外へ行き過ぎない。
           */
          bounds,

          edgeResistance: 0.8,

          cursor: "grab",
          activeCursor: "grabbing",

          onPress: () => {
            this.element.classList.add(
              "is-dragging",
            );
          },

          onDrag: () => {
            this.suppressClick = true;
          },

          onDragEnd: () => {
            this.element.classList.remove(
              "is-dragging",
            );

            /*
             * drag後にリンククリックが
             * 発火するのを防止。
             */
            window.setTimeout(() => {
              this.suppressClick = false;
            }, 50);
          },
        },
      );

    this.draggable =
      instances[0] ?? null;
  }

  /**
   * Draggableの可動範囲。
   */
  private getDragBounds(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    const viewportWidth =
      this.element.clientWidth;

    const viewportHeight =
      this.element.clientHeight;

    const trackWidth =
      this.track.offsetWidth;

    const trackHeight =
      this.track.offsetHeight;

    return {
      minX: Math.min(
        0,
        viewportWidth -
        trackWidth,
      ),

      maxX: 0,

      minY: Math.min(
        0,
        viewportHeight -
        trackHeight,
      ),

      maxY: 0,
    };
  }

  /**
   * Hover Animation。
   *
   * ここはGSAP。
   */
  private initHover(): void {
    this.items.forEach((item) => {
      const media =
        item.querySelector<HTMLElement>(
          "[data-work-media]",
        );

      if (!media) {
        return;
      }

      const handleEnter = () => {
        gsap.to(media, {
          scale: 0.96,

          duration: 0.6,

          ease: "power3.out",

          overwrite: true,
        });
      };

      const handleLeave = () => {
        gsap.to(media, {
          scale: 1,

          duration: 0.6,

          ease: "power3.out",

          overwrite: true,
        });
      };

      item.addEventListener(
        "pointerenter",
        handleEnter,
      );

      item.addEventListener(
        "pointerleave",
        handleLeave,
      );

      this.hoverCleanups.push(() => {
        item.removeEventListener(
          "pointerenter",
          handleEnter,
        );

        item.removeEventListener(
          "pointerleave",
          handleLeave,
        );
      });
    });
  }

  /**
   * Dragしたときに作品詳細ページへ
   * 遷移してしまうのを防ぐ。
   */
  private initClickGuard(): void {
    this.element.addEventListener(
      "click",
      this.handleClick,
      true,
    );
  }

  private handleClick = (
    event: MouseEvent,
  ): void => {
    if (!this.suppressClick) {
      return;
    }

    const target =
      event.target as HTMLElement;

    const link =
      target.closest("a");

    if (!link) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  /**
   * Responsive。
   *
   * ResizeObserverはブラウザ標準API。
   */
  private initResizeObserver(): void {
    this.resizeObserver =
      new ResizeObserver(() => {
        if (
          this.resizeFrame !== null
        ) {
          cancelAnimationFrame(
            this.resizeFrame,
          );
        }

        this.resizeFrame =
          requestAnimationFrame(
            () => {
              this.handleResize();

              this.resizeFrame =
                null;
            },
          );
      });

    this.resizeObserver.observe(
      this.element,
    );
  }

  private handleResize(): void {
    /*
     * Layout計算し直し。
     */
    this.initLayout(true);

    /*
     * trackサイズが変わったので
     * boundsも再計算する。
     */
    this.initDrag();
  }

  /**
   * Responsive設定。
   */
  private getLayoutConfig(): {
    columns: number;
    cardWidth: number;
    columnGap: number;
    rowGap: number;
    padding: number;
  } {
    const width =
      this.element.clientWidth;

    /*
     * Desktop
     */
    if (width >= 1440) {
      return {
        columns: 5,

        cardWidth: 260,

        columnGap: 100,

        rowGap: 120,

        padding: 160,
      };
    }

    /*
     * Laptop
     */
    if (width >= 1024) {
      return {
        columns: 4,

        cardWidth: 220,

        columnGap: 70,

        rowGap: 100,

        padding: 100,
      };
    }

    /*
     * Tablet
     */
    if (width >= 640) {
      return {
        columns: 3,

        cardWidth: 190,

        columnGap: 50,

        rowGap: 80,

        padding: 70,
      };
    }

    /*
     * Mobile
     */
    return {
      columns: 2,

      cardWidth:
        Math.min(
          160,
          width * 0.4,
        ),

      columnGap: 40,

      rowGap: 60,

      padding: 40,
    };
  }

  /**
   * Angularでいう
   * ngOnDestroy に近い。
   */
  destroy(): void {
    this.draggable?.kill();

    this.draggable = null;

    this.resizeObserver?.disconnect();

    this.resizeObserver = null;

    if (
      this.resizeFrame !== null
    ) {
      cancelAnimationFrame(
        this.resizeFrame,
      );
    }

    this.hoverCleanups.forEach(
      (cleanup) => {
        cleanup();
      },
    );

    this.hoverCleanups = [];

    this.element.removeEventListener(
      "click",
      this.handleClick,
      true,
    );

    gsap.killTweensOf(
      this.items,
    );

    this.items.forEach((item) => {
      const media =
        item.querySelector(
          "[data-work-media]",
        );

      if (media) {
        gsap.killTweensOf(media);
      }
    });
  }
}

/*
 * =====================================================
 * WorkList bootstrap
 * =====================================================
 */

let workListController:
  | WorkListController
  | null = null;

let currentWorkListElement:
  | HTMLElement
  | null = null;

const mountWorkList = (): void => {
  const element =
    document.querySelector<HTMLElement>(
      "[data-work-list]",
    );

  if (!element) {
    workListController?.destroy();

    workListController = null;
    currentWorkListElement = null;

    return;
  }

  /*
   * 同じDOMなら二重初期化しない。
   */
  if (
    element ===
    currentWorkListElement
  ) {
    return;
  }

  workListController?.destroy();

  workListController =
    new WorkListController(
      element,
    );

  currentWorkListElement =
    element;

  workListController.init();
};

const unmountWorkList = (): void => {
  workListController?.destroy();

  workListController = null;
  currentWorkListElement = null;
};

/*
 * module scriptなので
 * 初回はDOM構築後に実行される。
 */
mountWorkList();

/*
 * Astro ClientRouterを
 * 使用した場合にも対応。
 */
document.addEventListener(
  "astro:page-load",
  mountWorkList,
);

document.addEventListener(
  "astro:before-swap",
  unmountWorkList,
);