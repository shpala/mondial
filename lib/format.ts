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
