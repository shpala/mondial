import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { getFixtures, getDataStatus } from "@/lib/data";
import { fixtureHomeWinProb } from "@/lib/displayProbs";
import { ogCard } from "@/lib/ogCard";

// Per-match link-preview card: the tie + the real score (if played) or the
// model's pre-match prediction. ISR (not force-dynamic) so link crawlers get a
// cached image instantly; falls back to a generic card on any error.
export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "A 2026 World Cup match — score and the model's prediction";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
        2026 World Cup match
      </div>
      <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: "#8b93a6" }}>
        Line-ups, live score &amp; the model&apos;s prediction · cup.shpa.la
      </div>
    </div>
  );

  try {
    const { id } = await params;
    const [fixtures, { usingSample }] = await Promise.all([
      getFixtures(),
      getDataStatus(),
    ]);
    const fixture = fixtures.find((f) => f.id === Number(id));
    if (fixture) {
      eyebrow = `Mondial26 · ${fixture.group ? `Group ${fixture.group}` : fixture.stage}`;
      // A score is real only with the live feed up, or a genuine ESPN overlay —
      // never a bundled-snapshot score, which is RNG-fabricated whether the
      // inferred status is "finished" OR "live". Otherwise fall through to the
      // honest, rating-based prediction. (isFabricatedResult is finished-only, so
      // we gate on the underlying provenance directly here.)
      const realScore = !usingSample || fixture.liveOverlaid;
      const played =
        realScore &&
        fixture.homeGoals !== null &&
        fixture.awayGoals !== null;
      const realTeams = fixture.home.id !== 0 && fixture.away.id !== 0;
      // Only predict on real data: in sample mode the ratings have been moved by
      // the snapshot's fabricated results (computeLiveRatings), so the prediction
      // itself would be contaminated. Fall through to the neutral line instead
      // (the tie + group are real and stay). Matches the bracket/team cards and
      // the root OG, which show no model output in sample mode.
      const homePct =
        !usingSample && realTeams
          ? Math.round(fixtureHomeWinProb(fixture) * 100)
          : null;

      const result =
        played ? (
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 14 }}>
            <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: "#e2a23a" }}>
              {fixture.homeGoals}&nbsp;–&nbsp;{fixture.awayGoals}
            </div>
            <div style={{ display: "flex", marginLeft: 28, fontSize: 30, color: "#8b93a6" }}>
              {fixture.status === "live" ? "Live" : "Full-time"}
            </div>
          </div>
        ) : homePct !== null ? (
          <div style={{ display: "flex", marginTop: 18, fontSize: 34, color: "#aab1c2" }}>
            Model prediction · {fixture.home.code} {homePct}% · {fixture.away.code}{" "}
            {100 - homePct}%
          </div>
        ) : (
          <div style={{ display: "flex", marginTop: 18, fontSize: 30, color: "#8b93a6" }}>
            Predicted line-ups &amp; scoreline
          </div>
        );

      body = (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", marginTop: 16, fontSize: 60, fontWeight: 800, lineHeight: 1.1 }}>
            {fixture.home.name} v {fixture.away.name}
          </div>
          {result}
          <div style={{ display: "flex", marginTop: 22, fontSize: 26, color: "#8b93a6" }}>
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
