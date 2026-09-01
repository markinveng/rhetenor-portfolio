import * as THREE from "three/webgpu";
import type { MediaItem } from "../../types/portfolio";

export type PlayableMediaKind = "image" | "video";

/** mediaItemの種別を判定する。 */
export function resolvePlayableKind(media: MediaItem): PlayableMediaKind {
  return media.type === "img" ? "image" : "video";
}

/** "cloudflareVideo"のmediaItemから再生対象のURLを取り出す。 */
export function getDirectVideoUrl(media: MediaItem): string | null {
  return media.type === "cloudflareVideo" ? media.cloudflareVideoUrl : null;
}

export interface VideoTextureHandle {
  /** THREE.VideoTexture(three/webgpuには@types/threeのサブパス型定義が無いためany)。 */
  texture: any;
  videoEl: HTMLVideoElement;
  /** videoWidth/videoHeightが取得できた時点で解決する(contain計算用)。 */
  ready: Promise<{ width: number; height: number }>;
  dispose(): void;
}

/**
 * 非表示の<video>要素からVideoTextureを作る。
 * WorkListのサムネイルPlane・WorkDetailのスライドPlaneの両方から使う。
 */
export function createVideoTexture(url: string): VideoTextureHandle {
  const videoEl = document.createElement("video");
  videoEl.muted = true;
  videoEl.loop = true;
  videoEl.playsInline = true;
  videoEl.crossOrigin = "anonymous";
  videoEl.preload = "auto";
  videoEl.src = url;

  const texture = new THREE.VideoTexture(videoEl);
  texture.colorSpace = THREE.SRGBColorSpace;

  const ready = new Promise<{ width: number; height: number }>((resolve) => {
    if (videoEl.videoWidth > 0) {
      resolve({ width: videoEl.videoWidth, height: videoEl.videoHeight });
      return;
    }

    videoEl.addEventListener(
      "loadedmetadata",
      () => {
        resolve({ width: videoEl.videoWidth, height: videoEl.videoHeight });
      },
      { once: true },
    );
  });

  videoEl.play().catch(() => {
    /* 自動再生がブロックされても致命的ではないため無視する */
  });

  return {
    texture,
    videoEl,
    ready,
    dispose(): void {
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.load();
      texture.dispose();
    },
  };
}
