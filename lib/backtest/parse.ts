// Parse the vendored international-results CSV into typed, played-only rows.
// The dataset is unquoted for almost every row; a tiny handful (~19 of ~11.8k)
// quote a city that contains a comma (e.g. "Washington, D.C."), which a naive
// comma split turns into 10 fields. The 9-field guard simply skips those rows —
// a negligible, safe data loss for a calibration corpus.

export interface MatchRow {
  date: string; // ISO yyyy-mm-dd (sortable as a string)
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  tournament: string;
  neutral: boolean;
}

export function parseResults(csv: string): MatchRow[] {
  const rows: MatchRow[] = [];
  const lines = csv.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split(",");
    if (f.length !== 9) continue;
    const [date, home, away, hs, as, tournament, , , neutral] = f;
    const homeGoals = Number(hs);
    const awayGoals = Number(as);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;
    rows.push({
      date,
      home,
      away,
      homeGoals,
      awayGoals,
      tournament,
      neutral: neutral.trim().toUpperCase() === "TRUE",
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}
