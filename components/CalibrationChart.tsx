import { packStripRows, reliabilityIsAdequate, type MatchGrade, type ReliabilityBucket } from "@/lib/modelreport";

/**
 * Reliability diagram: predicted win rate (x) vs observed (y). A perfectly
 * calibrated model sits on the diagonal — "when it says 70%, they win 70%".
 * Dots above the line are cautious (under-confident, pitch); below are
 * over-confident (ember = warm warning); on the line is neutral grey. Dot size ∝
 * matches in the band. Pure/server-renderable.
 *
 * A calibration curve is only meaningful with enough events spread across enough
 * bins (see reliabilityIsAdequate). Below that — e.g. a handful of knockout ties —
 * every bin's observed rate collapses to 0%/100% and pins the dots to the chart's
 * rails, which is misleading. In that case, if per-match grades are available, we
 * render an honest "advance-call strip" instead (one mark per game at the model's
 * confidence in the side it called).
 *
 * The plot is drawn in 0..100 coordinates inside a viewBox enlarged with margins
 * (≥ the largest dot radius) so dots on the 0%/100% rails render as full circles,
 * never clipped half-moons.
 */
export function CalibrationChart({
  reliability,
  perMatch,
  advanceCalls = false,
}: {
  reliability: ReliabilityBucket[];
  /** Per-match grades for the same slice; used for the small-sample fallback. */
  perMatch?: MatchGrade[];
  /** This slice is graded as binary "who advances" calls (knockouts). Only then
   *  does the small-sample fallback make sense — a 3-way W/D/L group stage must
   *  never render the advance-call strip (it would mislabel max(home,away) and the
   *  draw mass), so it falls back to its own (sparse) scatter instead. */
  advanceCalls?: boolean;
}) {
  const pts = reliability.filter((r) => r.count > 0);

  if (
    advanceCalls &&
    !reliabilityIsAdequate(reliability) &&
    perMatch &&
    perMatch.length > 0
  ) {
    return <AdvanceCallStrip perMatch={perMatch} />;
  }

  const maxN = Math.max(...pts.map((p) => p.count), 1);

  return (
    <figure className="card mb-6 p-4">
      <div className="mx-auto w-full max-w-[420px]">
        {/* viewBox margins (left/bottom for axis titles, all sides ≥ the 7.3 max
            dot radius) so rail dots show as full circles. Plot math stays 0..100. */}
        <svg
          viewBox="-18 -10 128 130"
          className="w-full"
          role="img"
          aria-label="Calibration chart: predicted versus observed win rate per probability band"
        >
          {/* axis titles, inside the SVG margins (no external rotated gutter) */}
          <text
            transform="rotate(-90 -13 50)"
            x="-13"
            y="50"
            textAnchor="middle"
            className="fill-ink-400 font-semibold uppercase"
            fontSize="4.5"
            letterSpacing="0.4"
          >
            Observed
          </text>
          <text
            x="50"
            y="116"
            textAnchor="middle"
            className="fill-ink-400 font-semibold uppercase"
            fontSize="4.5"
            letterSpacing="0.4"
          >
            Predicted →
          </text>
          {/* plot box + 50% gridlines */}
          <rect x="0" y="0" width="100" height="100" className="fill-none stroke-ink-700" strokeWidth="0.6" />
          <line x1="50" y1="0" x2="50" y2="100" className="stroke-ink-800" strokeWidth="0.6" />
          <line x1="0" y1="50" x2="100" y2="50" className="stroke-ink-800" strokeWidth="0.6" />
          {/* perfect-calibration diagonal (observed = predicted) */}
          <line x1="0" y1="100" x2="100" y2="0" className="stroke-ink-500" strokeWidth="0.8" strokeDasharray="3 3" />
          {/* numeric scale ticks (0/50/100%) so sighted readers can read the axes;
              bottom-left "0" is the shared origin of both axes */}
          <g className="fill-ink-400" fontSize="4">
            <text x="1.5" y="98.5">0</text>
            <text x="50" y="98.5" textAnchor="middle">50</text>
            <text x="98.5" y="98.5" textAnchor="end">100</text>
            <text x="1.5" y="51">50</text>
            <text x="1.5" y="5">100</text>
          </g>
          {pts.map((p) => {
            const cx = p.predicted * 100;
            const cy = 100 - p.observed * 100; // SVG y grows down → flip
            const r = 1.8 + 5.5 * Math.sqrt(p.count / maxN);
            const diff = p.observed - p.predicted;
            // ember = over-confident (below the line), pitch = cautious (above),
            // neutral grey = on the line. Position already encodes direction, so
            // colour stays redundant (CVD-safe).
            const tone =
              diff < -0.02
                ? "fill-accent-ember"
                : diff > 0.02
                  ? "fill-pitch-500"
                  : "fill-ink-400";
            return (
              <circle
                key={p.bucket}
                cx={cx}
                cy={cy}
                r={r}
                className={tone}
                fillOpacity={0.75}
                stroke="#0a0e14"
                strokeWidth="0.6"
              />
            );
          })}
        </svg>
      </div>
      {/* Screen-reader equivalent of the plotted points (the chart is aria-img). */}
      <table className="sr-only">
        <caption>Calibration by predicted-probability band</caption>
        <thead>
          <tr>
            <th>Band</th>
            <th>Predicted</th>
            <th>Observed</th>
            <th>Matches</th>
          </tr>
        </thead>
        <tbody>
          {pts.map((p) => (
            <tr key={p.bucket}>
              <td>
                {p.bucket * 10}–{p.bucket * 10 + 10}%
              </td>
              <td>{Math.round(p.predicted * 100)}%</td>
              <td>{Math.round(p.observed * 100)}%</td>
              <td>{p.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-3 text-xs text-ink-400">
        On the dashed line = perfectly calibrated.{" "}
        <span className="font-medium text-pitch-500">Above</span> = cautious;{" "}
        <span className="font-medium text-accent-ember">below</span> = over-confident.
        Dot size = matches in that band.
      </figcaption>
    </figure>
  );
}

/**
 * Small-sample fallback: one mark per graded match, placed on a 0–100% track at
 * the model's confidence in the side it CALLED (the favourite). ✓ = the call was
 * right, ✗ = wrong (colour + glyph, so it's CVD-safe). Honest where a calibration
 * curve isn't — it shows each individual call without binning a handful of games
 * into a rail-pinned scatter.
 */
function AdvanceCallStrip({ perMatch }: { perMatch: MatchGrade[] }) {
  const hits = perMatch.filter((m) => m.correct).length;
  // Confidence the model placed on the side it picked = the larger advance prob,
  // sorted ascending. x = confidence; y carries no meaning, so we pack marks into
  // rows (packStripRows) such that close confidences never overlap — clustered
  // calls stack onto extra rows rather than colliding.
  const calls = perMatch
    .map((m) => ({ m, conf: Math.max(m.predicted.home, m.predicted.away) }))
    .sort((a, b) => a.conf - b.conf);
  const MIN_DX = 6; // min x-gap between marks sharing a row (clears the ~5.5 glyph)
  const ROW_H = 7;
  const TOP = 6; // baseline of the top row
  const rows = packStripRows(calls.map((c) => c.conf * 100), MIN_DX);
  const rowCount = rows.length ? Math.max(...rows) + 1 : 1;
  const axisY = TOP + (rowCount - 1) * ROW_H + 6;
  const tickY = axisY + 5;

  return (
    <figure className="card mb-6 p-4">
      <p className="mb-3 text-sm text-ink-300">
        Too few games for a calibration curve —{" "}
        <span className="font-display font-semibold tabular-nums text-white">
          {hits} of {perMatch.length}
        </span>{" "}
        advance calls correct.
      </p>
      <div className="mx-auto w-full max-w-[440px]">
        <svg
          viewBox={`-2 -1 104 ${tickY + 5}`}
          className="w-full"
          role="img"
          aria-label="Each knockout call placed at the model's confidence in the side it picked; tick = correct, cross = wrong"
        >
          {/* coin-flip reference + confidence axis (0–100%) */}
          <line x1="50" y1="1" x2="50" y2={axisY} className="stroke-ink-700" strokeWidth="0.5" strokeDasharray="2 2" />
          <line x1="0" y1={axisY} x2="100" y2={axisY} className="stroke-ink-700" strokeWidth="0.5" />
          <g className="fill-ink-400" fontSize="3.6">
            <text x="0" y={tickY}>0</text>
            <text x="50" y={tickY} textAnchor="middle">50% (coin flip)</text>
            <text x="100" y={tickY} textAnchor="end">100%</text>
          </g>
          {calls.map(({ m, conf }, i) => (
            <text
              key={`${m.date}-${m.home}-${m.away}-${i}`}
              x={conf * 100}
              y={TOP + rows[i] * ROW_H}
              textAnchor="middle"
              fontSize="5.5"
              className={m.correct ? "fill-pitch-500" : "fill-accent-ember"}
            >
              {m.correct ? "✓" : "✗"}
            </text>
          ))}
        </svg>
        <div className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-400">
          Confidence in the called side →
        </div>
      </div>
      {/* Screen-reader equivalent of the strip. */}
      <table className="sr-only">
        <caption>Knockout advance calls</caption>
        <thead>
          <tr>
            <th>Match</th>
            <th>Confidence in pick</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {calls.map(({ m, conf }, i) => (
            <tr key={`${m.date}-${m.home}-${m.away}-${i}`}>
              <td>
                {m.home} v {m.away}
              </td>
              <td>{Math.round(conf * 100)}%</td>
              <td>{m.correct ? "Correct call" : "Wrong call"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-3 text-xs text-ink-400">
        Each <span className="font-medium text-pitch-500">✓</span> /{" "}
        <span className="font-medium text-accent-ember">✗</span> is one knockout
        call, placed at the model&rsquo;s confidence in the side it picked. A
        calibration curve appears here once enough knockout games are played.
      </figcaption>
    </figure>
  );
}
