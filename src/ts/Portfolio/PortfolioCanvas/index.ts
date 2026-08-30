import gsap from "gsap";
// gsap の型定義がWindows上で大文字小文字の衝突を起こすため抑制
// @ts-ignore
import { Draggable } from "gsap/Draggable";
// @ts-ignore
import { InertiaPlugin } from "gsap/InertiaPlugin";

import { urlFor } from "../../Sanity";

gsap.registerPlugin(Draggable, InertiaPlugin);

export class PortfolioCanvas {
  private root: HTMLElement;
  private world: HTMLElement;
  private items: HTMLElement[];

  private draggable: Draggable | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(root: HTMLElement) {
    this.root = root;

    const world = root.querySelector<HTMLElement>(
      "[data-portfolio-world]"
    );

    if (!world) {
      throw new Error("PortfolioCanvas world was not found.");
    }

    this.world = world;

    this.items = Array.from(
      root.querySelectorAll<HTMLElement>("[data-portfolio-item]")
    );

    this.resolveMedia();
    this.initDrag();
    this.initResizeObserver();
  }

  /**
   * data-image-ref から Sanity の画像URLを解決して背景に設定する。
   */
  private resolveMedia(): void {
    this.items.forEach((item) => {
      const media = item.querySelector<HTMLElement>(
        "[data-image-ref]"
      );

      const ref = media?.dataset.imageRef;

      if (media && ref) {
        const url = urlFor({
          _type: "image",
          asset: { _type: "reference", _ref: ref },
        })
          .width(600)
          .url();

        media.style.backgroundImage = `url(${url})`;
      }
    });
  }

  private initDrag(): void {
    this.draggable?.kill();

    const instances = Draggable.create(this.world, {
      type: "x,y",
      inertia: true,
      bounds: this.getBounds(),
      edgeResistance: 0.8,
      cursor: "grab",
      activeCursor: "grabbing",
    });

    this.draggable = instances[0] ?? null;
  }

  private getBounds(): {
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

  private initResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.initDrag();
    });

    this.resizeObserver.observe(this.root);
  }

  public dispose(): void {
    this.draggable?.kill();
    this.draggable = null;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }
}
