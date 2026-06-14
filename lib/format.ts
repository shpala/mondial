// Small presentational helpers shared across screens.

export function isUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
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

/** Deterministic accent color from a team code, for chips/borders. */
export function teamAccent(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 70% 55%)`;
}
