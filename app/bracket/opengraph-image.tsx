import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { getTitleOdds, getDataStatus } from "@/lib/data";
import { ogCard } from "@/lib/ogCard";

// Shareable-bracket link-preview card: the model's predicted champion and the
// next contenders. ISR for crawler speed; generic fallback on any error.
export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "The model's predicted 2026 World Cup bracket";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const pct = (p: number) => (p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

export default async function Image() {
  const mark = `data:image/png;base64,${readFileSync(
    fileURLToPath(new URL("../og-cup.png", import.meta.url)),
  ).toString("base64")}`;

  let body = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", marginTop: 16, fontSize: 58, fontWeight: 800 }}>
        2026 World Cup bracket
      </div>
      <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: "#8b93a6" }}>
        The model&apos;s predicted path to the trophy · cup.shpa.la
      </div>
    </div>
  );

  try {
    // In sample mode (live spine down) the odds are a simulation over the
    // snapshot's fabricated group results — keep the generic card, never
    // broadcast an invented champion (mirrors app/opengraph-image.tsx).
    const [titleOdds, { usingSample }] = await Promise.all([
      getTitleOdds(),
      getDataStatus(),
    ]);
    const odds = usingSample
      ? []
      : [...titleOdds]
          .filter((o) => o.champion > 0)
          .sort((a, b) => b.champion - a.champion);
    const top = odds[0];
    if (top) {
      const chasers = odds
        .slice(1, 3)
        .map((o) => `${o.team.name} ${pct(o.champion)}`)
        .join(" · ");
      body = (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", marginTop: 18, fontSize: 30, color: "#aab1c2" }}>
            The model&apos;s predicted champion
          </div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 12 }}>
            <div style={{ display: "flex", fontSize: 80, fontWeight: 800 }}>
              {top.team.name}
            </div>
            <div style={{ display: "flex", marginLeft: 24, fontSize: 80, fontWeight: 800, color: "#e2a23a" }}>
              {pct(top.champion)}
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 26, color: "#8b93a6" }}>
            {chasers ? `then ${chasers} · ` : ""}cup.shpa.la
          </div>
        </div>
      );
    }
  } catch {
    // keep the generic body
  }

  return new ImageResponse(ogCard({ mark, eyebrow: "Mondial26 · Prediction bracket", children: body }), {
    ...size,
  });
}
