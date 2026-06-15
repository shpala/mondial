"use client";

import { useEffect, useState } from "react";
import { flagImageUrl, isUrl } from "@/lib/format";
import { flagEmojiSupported } from "@/lib/flagSupport";

export function TeamFlag({
  flag,
  alt,
  size = 22,
  decorative = false,
}: {
  flag: string;
  alt: string;
  size?: number;
  /** When an adjacent visible label already names the team, hide the flag from
   *  assistive tech to avoid double announcements. */
  decorative?: boolean;
}) {
  // An API-provided flag is already an image URL — always render it. An emoji
  // flag is rendered natively (matching macOS/iOS/Android) unless the platform
  // can't draw flag emoji (Windows), in which case we swap in a flagcdn image.
  const directUrl = isUrl(flag) ? flag : null;
  const cdnUrl = directUrl ? null : flagImageUrl(flag);
  const [emojiUnsupported, setEmojiUnsupported] = useState(false);

  useEffect(() => {
    if (cdnUrl && !flagEmojiSupported()) setEmojiUnsupported(true);
  }, [cdnUrl]);

  const src = directUrl ?? (emojiUnsupported ? cdnUrl : null);

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={decorative ? "" : alt}
        aria-hidden={decorative || undefined}
        width={size}
        height={size}
        className="inline-block rounded-sm object-contain align-middle"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      style={{ fontSize: size * 0.9, lineHeight: 1 }}
      aria-label={decorative ? undefined : alt}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
    >
      {flag}
    </span>
  );
}
