const ua = navigator.userAgent;

/**
 * SP(スマートフォン/タブレット)判定
 */
export const isSP: boolean =
  ua.indexOf("iPhone") > 0 ||
  ua.indexOf("iPod") > 0 ||
  (ua.indexOf("Android") > 0 && ua.indexOf("Mobile") > 0) ||
  ua.indexOf("iPad") > 0 ||
  ua.indexOf("Android") > 0 ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * デバイスごとに負荷を抑えるための pixelRatio を算出する。
 * SP は高DPIパネルが多いため上限を設け、PC は devicePixelRatio を半分にして負荷を軽減する。
 */
export function getPixelRatio(): number {
  const base = window.devicePixelRatio || 1;

  if (isSP) {
    return Math.min(base, 2);
  }

  return Math.max(1.0, base * 0.5);
}
