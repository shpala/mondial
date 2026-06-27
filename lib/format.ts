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

// Time formatters, cached per IANA timezone. The default UTC keeps server-
// rendered output deterministic (Vercel runs in UTC) and is the no-JS /
// pre-hydration fallback; the client re-renders kickoff times in the viewer's
// own timezone via <LocalKickoff>. A short zone name keeps every time self-
// labelled ("…UTC" / "…CEST"), unambiguous for a global, multi-venue event.
const timeFmtCache = new Map<string, Intl.DateTimeFormat>();
function timeFmt(timeZone: string): Intl.DateTimeFormat {
  let fmt = timeFmtCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    });
    timeFmtCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Format a kickoff for display, in the given IANA timezone (default UTC). */
export function formatKickoff(iso: string, timeZone = "UTC"): string {
  try {
    return timeFmt(timeZone).format(new Date(iso));
  } catch {
    return iso;
  }
}

// YYYY-MM-DD day keys, cached per timezone. Assembled from formatToParts so the
// order is locale-independent.
const keyFmtCache = new Map<string, Intl.DateTimeFormat>();
function keyFmt(timeZone: string): Intl.DateTimeFormat {
  let fmt = keyFmtCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
    keyFmtCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Calendar-day key (YYYY-MM-DD) for a timestamp in the given timezone (default
 *  UTC). Matches the day of the displayed time and is computed identically on
 *  server and client for a given zone, so day grouping and "today" don't drift. */
export function dateKey(iso: string | Date, timeZone = "UTC"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = keyFmt(timeZone);
  } catch {
    fmt = keyFmt("UTC");
  }
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** True when the kickoff falls on the current calendar day in the given timezone
 *  (default UTC — used for server-side scheduling buckets in lib/data). */
export function isToday(iso: string, timeZone = "UTC"): boolean {
  return dateKey(iso, timeZone) === dateKey(new Date(), timeZone);
}

/** The viewer's IANA timezone (e.g. "Europe/Madrid"), for client-side display.
 *  Falls back to UTC if unavailable. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
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
