import {
  packStripRows,
  reliabilityIsAdequate,
  wilsonInterval,
  type MatchGrade,
  type ReliabilityBucket,
} from "@/lib/modelreport";

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
 * render a single honest "favourite calibration dot" instead (the favourites'
 * mean predicted advance rate vs the observed rate, with a wide Wilson 95% band),
 * on the same axes so it morphs into the full scatter as games accrue.
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
    return <FavouriteCalibrationDot perMatch={perMatch} />;
  }

  const maxN = Math.max(...pts.map((p) => p.count), 1);

  return (
    <figure className="card mb-6 p-4 md:flex md:items-center md:gap-6">
      <div className="mx-auto w-full max-w-[420px] md:mx-0 md:shrink-0">
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
      <figcaption className="mt-4 text-xs text-ink-400 md:mt-0 md:flex-1 md:text-sm">
        On the dashed line = perfectly calibrated.{" "}
        <span className="font-medium text-pitch-500">Above</span> = cautious;{" "}
        <span className="font-medium text-accent-ember">below</span> = over-confident.
        Dot size = matches in that band.
      </figcaption>
    </figure>
  );
}

/**
 * Small-sample fallback for the knockout stage: one aggregate "favourite
 * calibration dot" — the model's favourites were predicted to advance at a mean
 * rate (x) and actually advanced at the observed rate (y) — carrying a Wilson
 * 95% interval (vertical whisker) that is wide at small n, so it visibly shows
 * whether the result is even distinguishable from perfect calibration. Drawn on
 * the SAME axes + diagonal as the full scatter, so it reads continuously and
 * hands off cleanly once the sample is adequate. A per-tie ✓/✗ rug along the
 * predicted axis (packed so it never overlaps) keeps the individual calls.
 */
function FavouriteCalibrationDot({ perMatch }: { perMatch: MatchGrade[] }) {
  // Each tie: the model's confidence in its pick = the favourite's advance prob.
  const calls = perMatch
    .map((m) => ({
      m,
      conf: Math.max(m.predicted.home, m.predicted.away),
      fav: m.predicted.home >= m.predicted.away ? m.home : m.away,
    }))
    .sort((a, b) => a.conf - b.conf);
  const n = calls.length;
  const k = calls.filter((c) => c.m.correct).length; // favourites that advanced
  const meanConf = calls.reduce((s, c) => s + c.conf, 0) / n;
  const observed = k / n;
  const { lo, hi } = wilsonInterval(k, n);
  // Does the uncertainty band still contain the "perfect" rate (= mean predicted)?
  // If so we can't yet distinguish the model from well-calibrated.
  const bandCrossesDiagonal = lo <= meanConf && meanConf <= hi;

  // Aggregate point + interval on the 0..100 calibration plane (y flipped).
  const dotX = meanConf * 100;
  const dotY = 100 - observed * 100;
  const ciTopY = 100 - hi * 100;
  const ciBotY = 100 - lo * 100;

  // Per-tie rug below the plot, aligned to the predicted x-axis; pack rows so
  // close confidences never overlap.
  const RUG_TOP = 108;
  const RUG_H = 6;
  const rugRows = packStripRows(calls.map((c) => c.conf * 100), 6);
  const rugRowCount = rugRows.length ? Math.max(...rugRows) + 1 : 1;
  const predictedLabelY = RUG_TOP + (rugRowCount - 1) * RUG_H + 9;
  const vbHeight = predictedLabelY + 14;

  return (
    <figure className="card mb-6 p-4 md:flex md:items-center md:gap-6">
      <div className="mx-auto w-full max-w-[420px] md:mx-0 md:shrink-0">
        <svg
          viewBox={`-18 -10 128 ${vbHeight}`}
          className="w-full"
          role="img"
          aria-label={`Knockout calibration: the model's favourites were predicted to advance ${Math.round(
            meanConf * 100,
          )} percent on average and ${k} of ${n} (${Math.round(
            observed * 100,
          )} percent) did, with a 95 percent uncertainty band; each tie marked below.`}
        >
          {/* axis titles */}
          <text transform="rotate(-90 -13 50)" x="-13" y="50" textAnchor="middle" className="fill-ink-400 font-semibold uppercase" fontSize="4.5" letterSpacing="0.4">
            Observed
          </text>
          <text x="50" y={predictedLabelY} textAnchor="middle" className="fill-ink-400 font-semibold uppercase" fontSize="4.5" letterSpacing="0.4">
            Predicted →
          </text>
          {/* plot box + 50% gridlines */}
          <rect x="0" y="0" width="100" height="100" className="fill-none stroke-ink-700" strokeWidth="0.6" />
          <line x1="50" y1="0" x2="50" y2="100" className="stroke-ink-800" strokeWidth="0.6" />
          <line x1="0" y1="50" x2="100" y2="50" className="stroke-ink-800" strokeWidth="0.6" />
          {/* perfect-calibration diagonal */}
          <line x1="0" y1="100" x2="100" y2="0" className="stroke-ink-500" strokeWidth="0.8" strokeDasharray="3 3" />
          {/* numeric ticks */}
          <g className="fill-ink-400" fontSize="4">
            <text x="1.5" y="98.5">0</text>
            <text x="50" y="98.5" textAnchor="middle">50</text>
            <text x="98.5" y="98.5" textAnchor="end">100</text>
            <text x="1.5" y="51">50</text>
            <text x="1.5" y="5">100</text>
          </g>
          {/* Wilson 95% interval whisker (vertical) + end caps */}
          <line x1={dotX} y1={ciTopY} x2={dotX} y2={ciBotY} className="stroke-ink-400" strokeWidth="0.8" />
          <line x1={dotX - 3} y1={ciTopY} x2={dotX + 3} y2={ciTopY} className="stroke-ink-400" strokeWidth="0.8" />
          <line x1={dotX - 3} y1={ciBotY} x2={dotX + 3} y2={ciBotY} className="stroke-ink-400" strokeWidth="0.8" />
          {/* the favourites' aggregate calibration point */}
          <circle cx={dotX} cy={dotY} r="2.8" className="fill-ink-100" stroke="#0a0e14" strokeWidth="0.6" />
          {/* per-tie rug along the predicted axis */}
          {calls.map(({ m, conf }, i) => (
            <text
              key={`${m.date}-${m.home}-${m.away}-${i}`}
              x={conf * 100}
              y={RUG_TOP + rugRows[i] * RUG_H}
              textAnchor="middle"
              fontSize="4.5"
              className={m.correct ? "fill-pitch-500" : "fill-accent-ember"}
            >
              {m.correct ? "✓" : "✗"}
            </text>
          ))}
        </svg>
      </div>
      {/* Screen-reader equivalent (the visible chip list is aria-hidden, so this
          is the only per-tie listing for SR users — it names the model's pick).
          A <figcaption> must be a direct child of <figure>, so the explanatory
          right column IS the figcaption (the figure's last child). */}
      <table className="sr-only">
        <caption>
          Knockout favourites: the model&rsquo;s pick, its confidence, and whether
          that pick advanced
        </caption>
        <thead>
          <tr>
            <th>Match</th>
            <th>Model&rsquo;s pick</th>
            <th>Confidence</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {calls.map(({ m, conf, fav }, i) => (
            <tr key={`${m.date}-${m.home}-${m.away}-${i}`}>
              <td>
                {m.home} v {m.away}
              </td>
              <td>{fav}</td>
              <td>{Math.round(conf * 100)}%</td>
              <td>
                {fav} {m.correct ? "advanced (correct)" : "eliminated (upset)"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-4 md:mt-0 md:flex-1">
        <p className="text-sm text-ink-300">
          Too few games for a full calibration curve — here&rsquo;s how the
          model&rsquo;s knockout favourites have fared so far ({n}{" "}
          {n === 1 ? "tie" : "ties"}).
        </p>
        <p className="mt-3 text-xs text-ink-400">
          The dot is the model&rsquo;s knockout favourites: predicted to advance{" "}
          <span className="font-medium text-ink-200">{Math.round(meanConf * 100)}%</span>{" "}
          on average, {k} of {n} ({Math.round(observed * 100)}%) did. The bar is how
          uncertain that is with so few games —{" "}
          {bandCrossesDiagonal
            ? "it still crosses the dashed line, so there's no clear over- or under-confidence yet."
            : observed < meanConf
              ? "it sits below the dashed line, an early hint the model has been over-confident."
              : "it sits above the dashed line, an early hint the model has been cautious."}{" "}
          Each <span className="font-medium text-pitch-500">✓</span>/
          <span className="font-medium text-accent-ember">✗</span>{" "}is one tie at the
          model&rsquo;s confidence in its pick.
        </p>
        {/* Per-tie list (the rug's labelled counterpart): the model's pick + how
            sure it was + whether it advanced. */}
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-hidden>
          {[...calls]
            .sort((a, b) => b.conf - a.conf)
            .map(({ m, conf, fav }, i) => (
              <li
                key={`${m.date}-${m.home}-${m.away}-${i}`}
                className="flex items-center gap-1.5"
              >
                <span className={m.correct ? "text-pitch-500" : "text-accent-ember"}>
                  {m.correct ? "✓" : "✗"}
                </span>
                <span className="truncate text-ink-200">{fav}</span>
                <span className="ml-auto shrink-0 tabular-nums text-ink-400">
                  {Math.round(conf * 100)}%
                </span>
              </li>
            ))}
        </ul>
      </figcaption>
    </figure>
  );
}
