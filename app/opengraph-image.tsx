import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { getVerdict, getDataStatus } from "@/lib/data";

// Rich link-preview card (WhatsApp, Slack, Twitter, …): the app icon + the model's
// live pick to win the cup + its track record. nodejs runtime so it can read the
// data layer. ISR (not force-dynamic) is essential here: link crawlers — WhatsApp's
// especially — have a tight timeout, so the image MUST be served instantly from the
// edge cache, never regenerated per scrape. Prerendered at build (getVerdict is
// caught → static fallback if data is unavailable), then refreshed hourly.
export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "Mondial26 — the model's pick to win the 2026 World Cup";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // Co-located asset, read inside the handler (so it never runs during build) — a
  // data URI because fetch(file://) isn't supported here.
  const ball = `data:image/png;base64,${readFileSync(
    fileURLToPath(new URL("./og-ball.png", import.meta.url)),
  ).toString("base64")}`;

  // Never broadcast an invented pick. When the live feed is down the data facade
  // silently serves the bundled snapshot, so getVerdict() returns a sample-data
  // favourite rather than throwing — render the generic card in that case (and on
  // any error), so ISR keeps the last good image instead of caching a fake pick.
  let verdict: Awaited<ReturnType<typeof getVerdict>> | null = null;
  try {
    const [v, status] = await Promise.all([getVerdict(), getDataStatus()]);
    verdict = status.usingSample ? null : v;
  } catch {
    verdict = null;
  }
  const fav = verdict?.favourite ?? null;
  const n = verdict?.n ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "72px 84px",
          background: "#0a0e14",
          color: "#f1f5f9",
          fontFamily: "sans-serif",
        }}
      >
        <img src={ball} width={232} height={232} alt="" style={{ borderRadius: 48 }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginLeft: 56,
            paddingLeft: 40,
            borderLeft: "4px solid #16a34a",
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#8b93a6",
            }}
          >
            Mondial26 · 2026 World Cup
          </div>

          {fav ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", marginTop: 18, fontSize: 30, color: "#aab1c2" }}>
                The model&apos;s pick to lift the trophy
              </div>
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 12 }}>
                <div style={{ display: "flex", fontSize: 80, fontWeight: 800 }}>
                  {fav.team.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    marginLeft: 24,
                    fontSize: 80,
                    fontWeight: 800,
                    color: "#e2a23a",
                  }}
                >
                  {Math.round(fav.champion * 100)}%
                </div>
              </div>
              <div style={{ display: "flex", marginTop: 22, fontSize: 26, color: "#8b93a6" }}>
                {n > 0 ? `${verdict!.hits}/${n} group calls correct · ` : ""}cup.shpa.la
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", marginTop: 16, fontSize: 58, fontWeight: 800 }}>
                2026 World Cup predictions
              </div>
              <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: "#8b93a6" }}>
                Live bracket, title odds &amp; a self-grading model · cup.shpa.la
              </div>
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
