import gsap from "gsap";

/**
 * マウスポインターに追従する円形カーソル。
 * ホバーした画像の上に、円の範囲だけ色反転(hue-rotate)する
 * オーバーレイを重ねる。動画(iframe)にはbackground-imageが無いため
 * オーバーレイは作られず、カーソル自体の表示のみ行われる。
 */
export class HoverInvertCursor {
  private readonly cursorEl: HTMLElement;
  private readonly labelEl: HTMLElement;

  private overlayEl: HTMLElement | null = null;
  private activeTarget: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    const cursor = document.createElement("div");
    cursor.className = "hover-invert-cursor";
    cursor.innerHTML =
      '<span class="hover-invert-cursor__swipe">← Swipe</span>' +
      '<span class="hover-invert-cursor__label" data-cursor-label></span>';

    container.appendChild(cursor);

    this.cursorEl = cursor;
    this.labelEl = cursor.querySelector("[data-cursor-label]") as HTMLElement;
  }

  public enter(
    target: HTMLElement,
    label: string,
    clientX: number,
    clientY: number,
  ): void {
    this.activeTarget = target;
    this.labelEl.textContent = label;

    const backgroundImage = target.style.backgroundImage;

    if (backgroundImage && backgroundImage !== "none") {
      const overlay = document.createElement("div");
      overlay.className = "hover-invert-cursor__overlay";
      overlay.style.backgroundImage = backgroundImage;

      target.appendChild(overlay);
      this.overlayEl = overlay;
    }

    gsap.set(this.cursorEl, { x: clientX, y: clientY });
    this.updateClip(clientX, clientY);

    gsap.to(this.cursorEl, {
      autoAlpha: 1,
      duration: 0.3,
      overwrite: true,
    });
  }

  public move(clientX: number, clientY: number): void {
    gsap.to(this.cursorEl, {
      x: clientX,
      y: clientY,
      duration: 0.3,
      ease: "power3.out",
    });

    this.updateClip(clientX, clientY);
  }

  public leave(): void {
    gsap.to(this.cursorEl, {
      autoAlpha: 0,
      duration: 0.3,
      overwrite: true,
    });

    this.overlayEl?.remove();
    this.overlayEl = null;
    this.activeTarget = null;
  }

  private updateClip(clientX: number, clientY: number): void {
    if (!this.overlayEl || !this.activeTarget) {
      return;
    }

    const rect = this.activeTarget.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    this.overlayEl.style.clipPath = `circle(70px at ${localX}px ${localY}px)`;
  }

  public destroy(): void {
    this.overlayEl?.remove();
    this.overlayEl = null;
    this.cursorEl.remove();
  }
}
