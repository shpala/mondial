import Link from "next/link";
import type { OutcomeReport } from "@/lib/modelreport";

export function ModelReportCard({
  report,
  sample = false,
}: {
  report: OutcomeReport;
  /** Serving the bundled snapshot — the calls are graded on sample fixtures. */
  sample?: boolean;
}) {
  const edge = report.baselineLogLoss - report.logLoss; // >0 = beats a coin flip
  const smallSample = report.n < 16; // too few matches for the edge to be stable
  return (
    <Link href="/model" className="card block p-4 hover:border-accent-gold/50">
      <h2 className="font-display text-sm font-semibold text-white">
        Model report card
      </h2>
      {report.n === 0 ? (
        <p className="mt-1 text-sm text-ink-400">
          No results scored yet — the model’s calls will be graded here as
          matches finish. <span className="text-pitch-500">See detail →</span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-ink-300">
          Called{" "}
          <strong className="font-display tabular-nums">
            {report.hits} of {report.n}
          </strong>{" "}
          {sample ? "sample group" : "group"} results —{" "}
          {/* The raw log-loss is jargon on the dashboard (the most casual touch
              point); keep the legible "blind guess" framing and tuck the number
              into a tooltip — /model shows it in full. */}
          <span
            title={`${edge >= 0 ? "+" : "−"}${Math.abs(edge).toFixed(2)} log-loss vs a no-skill baseline`}
          >
            {edge >= 0 ? "beating" : "trailing"} a blind guess
          </span>
          {smallSample ? (
            <span className="text-ink-400"> (early days — small sample)</span>
          ) : null}
          . <span className="text-pitch-500">See detail →</span>
        </p>
      )}
    </Link>
  );
}
