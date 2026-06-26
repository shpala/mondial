import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { getTeam, getTeams, getTitleOdds, getDataStatus } from "@/lib/data";
import { ogCard } from "@/lib/ogCard";

// Per-team link-preview card: the nation + the model's title odds and strength
// rank. ISR for crawler speed; generic fallback on any error.
export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "A 2026 World Cup team — the model's title odds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const pct = (p: number) => (p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const mark = `data:image/png;base64,${readFileSync(
    fileURLToPath(new URL("../../og-cup.png", import.meta.url)),
  ).toString("base64")}`;

  let eyebrow = "Mondial26 · 2026 World Cup";
  let body = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", marginTop: 16, fontSize: 58, fontWeight: 800 }}>
        2026 World Cup team
      </div>
      <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: "#8b93a6" }}>
        Squad, fixtures &amp; the model&apos;s title odds · cup.shpa.la
      </div>
    </div>
  );

  try {
    const { id } = await params;
    const teamId = Number(id);
    const [team, titleOdds, teams, { usingSample }] = await Promise.all([
      getTeam(teamId),
      getTitleOdds(),
      getTeams(),
      getDataStatus(),
    ]);
    if (team) {
      eyebrow = `Mondial26 · Group ${team.group}`;
      // Sample-mode odds simulate over fabricated group results — don't unfurl
      // them as a real model claim; the strength rank (real Elo) stays.
      const odds = usingSample
        ? undefined
        : titleOdds.find((o) => o.team.id === teamId);
      const rank =
        [...teams].sort((a, b) => b.rating - a.rating).findIndex((t) => t.id === teamId) + 1;

      body = (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", marginTop: 14, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            {team.name}
          </div>
          {odds ? (
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 16 }}>
              <div style={{ display: "flex", fontSize: 40, fontWeight: 800, color: "#e2a23a" }}>
                {pct(odds.champion)}
              </div>
              <div style={{ display: "flex", marginLeft: 18, fontSize: 32, color: "#aab1c2" }}>
                to win the cup · {pct(odds.reachFinal)} to reach the final
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", marginTop: 16, fontSize: 32, color: "#aab1c2" }}>
              Squad, fixtures &amp; title odds
            </div>
          )}
          <div style={{ display: "flex", marginTop: 18, fontSize: 26, color: "#8b93a6" }}>
            {rank > 0 ? `#${rank} of ${teams.length} by model strength · ` : ""}
            cup.shpa.la
          </div>
        </div>
      );
    }
  } catch {
    // keep the generic body
  }

  return new ImageResponse(ogCard({ mark, eyebrow, children: body }), { ...size });
}
