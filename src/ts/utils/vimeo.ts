const VIMEO_ID_PATTERN = /vimeo\.com\/(?:video\/)?(\d+)/;

export function getVimeoId(url: string): string | null {
  const match = url.match(VIMEO_ID_PATTERN);
  return match ? match[1] : null;
}

/**
 * ミュート・ループ・コントロール非表示の背景動画的な埋め込みURLを作る。
 */
export function getVimeoBackgroundEmbedUrl(url: string): string | null {
  const id = getVimeoId(url);

  if (!id) {
    return null;
  }

  const params = new URLSearchParams({
    autoplay: "1",
    muted: "1",
    loop: "1",
    background: "1",
    controls: "0",
    title: "0",
    byline: "0",
    portrait: "0",
  });

  return `https://player.vimeo.com/video/${id}?${params.toString()}`;
}

interface VimeoOEmbedData {
  thumbnail_url?: string;
  width?: number;
  height?: number;
}

export interface VimeoInfo {
  videoId: string;
  embedUrl: string;
  posterUrl: string | null;
  aspectRatio: number;
}

/**
 * oEmbed APIからサムネイル画像とアスペクト比を取得する。
 * 動画が存在しない/非公開の場合はnullを返す。
 */
export async function fetchVimeoInfo(
  url: string,
): Promise<VimeoInfo | null> {
  const videoId = getVimeoId(url);
  const embedUrl = getVimeoBackgroundEmbedUrl(url);

  if (!videoId || !embedUrl) {
    return null;
  }

  try {
    const response = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
    );

    if (!response.ok) {
      return { videoId, embedUrl, posterUrl: null, aspectRatio: 16 / 9 };
    }

    const data = (await response.json()) as VimeoOEmbedData;

    return {
      videoId,
      embedUrl,
      posterUrl:
        typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
      aspectRatio:
        data.width && data.height ? data.width / data.height : 16 / 9,
    };
  } catch {
    return { videoId, embedUrl, posterUrl: null, aspectRatio: 16 / 9 };
  }
}
