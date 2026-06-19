import type { ReliabilityBucket } from "@/lib/modelreport";

/**
 * Reliability diagram: predicted win rate (x) vs observed (y). A perfectly
 * calibrated model sits on the diagonal — "when it says 70%, they win 70%".
 * Dots above the line are cautious (under-confident, pitch); below are
 * over-confident (bronze, = model output colour). Dot size ∝ matches in the band.
 * Pure/server-renderable — the visual replacement for the old reliability table.
 */
export function CalibrationChart({
  reliability,
}: {
  reliability: ReliabilityBucket[];
}) {
  const pts = reliability.filter((r) => r.count > 0);
  const maxN = Math.max(...pts.map((p) => p.count), 1);

  return (
    <figure className="card mb-6 p-4">
      <div className="flex items-stretch gap-2">
        <span className="flex items-center text-[10px] font-semibold uppercase tracking-wide text-ink-400">
          <span className="-rotate-90 whitespace-nowrap">Observed</span>
        </span>
        <div className="mx-auto min-w-0 max-w-[320px] flex-1">
          <svg
            viewBox="0 0 100 100"
            className="w-full"
            role="img"
            aria-label="Calibration chart: predicted versus observed win rate per probability band"
          >
            {/* plot box + 50% gridlines */}
            <rect x="0" y="0" width="100" height="100" className="fill-none stroke-ink-700" strokeWidth="0.6" />
            <line x1="50" y1="0" x2="50" y2="100" className="stroke-ink-800" strokeWidth="0.6" />
            <line x1="0" y1="50" x2="100" y2="50" className="stroke-ink-800" strokeWidth="0.6" />
            {/* perfect-calibration diagonal (observed = predicted) */}
            <line x1="0" y1="100" x2="100" y2="0" className="stroke-ink-500" strokeWidth="0.8" strokeDasharray="3 3" />
            {pts.map((p) => {
              const cx = p.predicted * 100;
              const cy = 100 - p.observed * 100; // SVG y grows down → flip
              const r = 1.8 + 5.5 * Math.sqrt(p.count / maxN);
              const overConfident = p.observed < p.predicted - 0.02;
              return (
                <circle
                  key={p.bucket}
                  cx={cx}
                  cy={cy}
                  r={r}
                  className={overConfident ? "fill-accent-gold" : "fill-pitch-500"}
                  fillOpacity={0.75}
                  stroke="#0a0e14"
                  strokeWidth="0.6"
                />
              );
            })}
          </svg>
          <div className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            Predicted →
          </div>
        </div>
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
        <span className="font-medium text-accent-gold">below</span> = over-confident.
        Dot size = matches in that band.
      </figcaption>
    </figure>
  );
}
