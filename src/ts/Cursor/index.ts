import gsap from "gsap";

export interface CursorController {
  /** 作品一覧ホバー時、グレーの点を少しだけ拡大/縮小する。 */
  setHoverActive(active: boolean): void;
  /** 作品詳細のメディアホバー時、点から反転サークル(ラベル付き)へ切り替える。 */
  enterLabel(label: string): void;
  /** 反転サークルから、グレーの点へ戻す。 */
  leaveLabel(): void;
}

const DOT_HOVER_SCALE = 1.8;

let rootEl: HTMLElement | null = null;
let dotEl: HTMLElement | null = null;
let labelEl: HTMLElement | null = null;
let labelTextEl: HTMLElement | null = null;
let controller: CursorController | null = null;

let hasPointer = false;
let handlePointerMove: ((event: PointerEvent) => void) | null = null;
let handleDocumentMouseOut: ((event: MouseEvent) => void) | null = null;

/**
 * サイト共通のカーソル(グレーの点)。ネイティブカーソルの代わりに常時表示する
 * シングルトンで、ページ遷移をまたいで使い回す(main.tsのApp.init/destroyで管理)。
 * 位置追従は内部のpointermoveリスナーが行うため、呼び出し側は状態切り替えのみ行う。
 */
export function getOrCreateCursor(): CursorController {
  if (controller) {
    return controller;
  }

  const root = document.createElement("div");
  root.className = "app-cursor";
  root.innerHTML =
    '<div class="app-cursor__dot" data-cursor-dot></div>' +
    '<div class="app-cursor__label" data-cursor-label>' +
    '<span class="app-cursor__swipe">← Swipe</span>' +
    '<span class="app-cursor__label-text" data-cursor-label-text></span>' +
    "</div>";

  document.body.appendChild(root);

  rootEl = root;
  dotEl = root.querySelector("[data-cursor-dot]");
  labelEl = root.querySelector("[data-cursor-label]");
  labelTextEl = root.querySelector("[data-cursor-label-text]");

  handlePointerMove = (event: PointerEvent): void => {
    if (!rootEl) {
      return;
    }

    if (!hasPointer) {
      hasPointer = true;
      gsap.set(rootEl, { x: event.clientX, y: event.clientY });
      gsap.to(rootEl, { autoAlpha: 1, duration: 0.3 });
      return;
    }

    gsap.to(rootEl, {
      x: event.clientX,
      y: event.clientY,
      duration: 0.3,
      ease: "power3.out",
    });
  };

  /*
   * ウィンドウ外へ出た(relatedTargetがnullになる)ときだけ非表示にする。
   */
  handleDocumentMouseOut = (event: MouseEvent): void => {
    if (event.relatedTarget !== null || !rootEl) {
      return;
    }

    hasPointer = false;
    gsap.to(rootEl, { autoAlpha: 0, duration: 0.3 });
  };

  window.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("mouseout", handleDocumentMouseOut);

  controller = {
    setHoverActive(active) {
      if (!dotEl) {
        return;
      }

      gsap.to(dotEl, {
        scale: active ? DOT_HOVER_SCALE : 1,
        duration: 0.35,
        ease: active ? "power2.in" : "power2.out",
        overwrite: true,
      });
    },

    enterLabel(label) {
      if (labelTextEl) {
        labelTextEl.textContent = label;
      }

      if (dotEl) {
        gsap.to(dotEl, {
          scale: 0,
          autoAlpha: 0,
          duration: 0.25,
          ease: "power2.out",
          overwrite: true,
        });
      }

      if (labelEl) {
        gsap.to(labelEl, {
          scale: 1,
          autoAlpha: 1,
          duration: 0.35,
          ease: "power2.in",
          overwrite: true,
        });
      }
    },

    leaveLabel() {
      if (labelEl) {
        gsap.to(labelEl, {
          scale: 0,
          autoAlpha: 0,
          duration: 0.3,
          ease: "power2.out",
          overwrite: true,
        });
      }

      if (dotEl) {
        gsap.to(dotEl, {
          scale: 1,
          autoAlpha: 1,
          duration: 0.3,
          ease: "power2.out",
          overwrite: true,
        });
      }
    },
  };

  return controller;
}

export function disposeCursor(): void {
  if (handlePointerMove) {
    window.removeEventListener("pointermove", handlePointerMove);
    handlePointerMove = null;
  }

  if (handleDocumentMouseOut) {
    document.removeEventListener("mouseout", handleDocumentMouseOut);
    handleDocumentMouseOut = null;
  }

  rootEl?.remove();
  rootEl = null;
  dotEl = null;
  labelEl = null;
  labelTextEl = null;
  controller = null;
  hasPointer = false;
}
