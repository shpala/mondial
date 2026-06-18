// Small presentational helpers shared across screens.

export function isUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

/**
 * Resolve a stored flag value to a flag *image* URL.
 *
 * Flags are stored as emoji, but regional-indicator emoji render as their bare
 * 2-letter code ("🇨🇦" → "CA") on platforms without a flag-emoji font (Windows,
 * many Linux/Chrome combos). To render reliably everywhere we map them to
 * flagcdn images (whitelisted in next.config). Returns null for values we can't
 * resolve (e.g. the "⚽" placeholder), so the caller can fall back to text.
 */
export function flagImageUrl(flag: string): string | null {
  if (isUrl(flag)) return flag;
  const cps = [...flag].map((c) => c.codePointAt(0)!);

  // Regional-indicator pair (e.g. 🇨🇦) → ISO 3166-1 alpha-2 ("ca").
  if (cps.length === 2 && cps.every((cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff)) {
    const cc = cps
      .map((cp) => String.fromCharCode(cp - 0x1f1e6 + 0x61))
      .join("");
    return `https://flagcdn.com/${cc}.svg`;
  }

  // Subdivision tag sequence (🏴 + tag letters + cancel tag), e.g. England's
  // "gbeng" → flagcdn "gb-eng". Covers England/Scotland/Wales.
  if (cps[0] === 0x1f3f4) {
    const tags = cps
      .slice(1)
      .filter((cp) => cp >= 0xe0061 && cp <= 0xe007a)
      .map((cp) => String.fromCharCode(cp - 0xe0061 + 0x61))
      .join("");
    if (tags.length >= 4 && tags.startsWith("gb")) {
      return `https://flagcdn.com/${tags.slice(0, 2)}-${tags.slice(2)}.svg`;
    }
  }

  return null;
}

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Local-timezone YYYY-MM-DD key for a timestamp (matches the displayed time). */
export function localDateKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True when the kickoff falls on the current local calendar day. */
export function isToday(iso: string): boolean {
  return localDateKey(iso) === localDateKey(new Date());
}

export function formatKickoff(iso: string): string {
  try {
    return TIME_FMT.format(new Date(iso));
  } catch {
    return iso;
  }
}

export function positionLabel(pos: string): string {
  switch (pos) {
    case "GK":
      return "Goalkeepers";
    case "DEF":
      return "Defenders";
    case "MID":
      return "Midfielders";
    case "FWD":
      return "Forwards";
    default:
      return pos;
  }
}
