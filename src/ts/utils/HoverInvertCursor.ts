import gsap from "gsap";

/**
 * マウスポインターに追従する円形カーソル(ラベル表示)。
 * 色反転の視覚効果自体はPlane側のシェーダー(createHoverInvertMaterial)が
 * 担当するため、ここではカーソル自体の表示のみ行う。
 */
export class HoverInvertCursor {
  private readonly cursorEl: HTMLElement;
  private readonly labelEl: HTMLElement;

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
    label: string,
    clientX: number,
    clientY: number,
  ): void {
    this.labelEl.textContent = label;

    gsap.set(this.cursorEl, { x: clientX, y: clientY });

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
  }

  public leave(): void {
    gsap.to(this.cursorEl, {
      autoAlpha: 0,
      duration: 0.3,
      overwrite: true,
    });
  }

  public destroy(): void {
    this.cursorEl.remove();
  }
}
