"use client";

// Detects whether the current platform can actually render flag emoji.
//
// macOS / iOS / Android / Noto systems draw 🇨🇭 as a flag; Windows (and Linux
// without a flag-emoji font) fall back to the bare letters "CH". We render an
// image fallback only on the latter, so platforms with native flags keep their
// original look. The result never changes within a session, so memoize it.

let cached: boolean | null = null;

export function flagEmojiSupported(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined") return true; // SSR: assume native flags

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return (cached = true);

    // Switzerland: a flag is mostly red; the letters "CH" would be black.
    ctx.font = "16px sans-serif";
    ctx.fillText("\u{1F1E8}\u{1F1ED}", 0, 14);

    const { data } = ctx.getImageData(0, 0, 16, 16);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 0 && r > 100 && g < 80 && b < 80) return (cached = true);
    }
    return (cached = false);
  } catch {
    return (cached = true);
  }
}
