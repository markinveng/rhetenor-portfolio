import type { PortableTextBlock } from "@portabletext/types";

/**
 * PortableTextの本文をプレーンテキストへ変換する。
 * デザイン未着手の暫定表示用の最小実装で、リッチテキスト(リンク/装飾等)は展開しない。
 */
export function portableTextToPlainText(
  blocks?: PortableTextBlock[],
): string {
  if (!blocks || blocks.length === 0) {
    return "";
  }

  return blocks
    .map((block) => {
      const children = (block as { children?: Array<{ text?: string }> })
        .children;

      return (children ?? []).map((child) => child.text ?? "").join("");
    })
    .filter((text) => text.length > 0)
    .join("\n\n");
}
