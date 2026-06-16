import Link from "next/link";
import type { OutcomeReport } from "@/lib/modelreport";

export function ModelReportCard({ report }: { report: OutcomeReport }) {
  if (report.n === 0) {
    return (
      <Link href="/model" className="card block p-4 hover:border-accent-gold/50">
        <h3 className="text-sm font-semibold text-white">Model report card</h3>
        <p className="mt-1 text-sm text-ink-400">
          No results scored yet — the model’s calls will be graded here as
          matches finish. <span className="text-pitch-500">see detail →</span>
        </p>
      </Link>
    );
  }
  const edge = report.baselineLogLoss - report.logLoss; // >0 = beats a coin flip
  return (
    <Link href="/model" className="card block p-4 hover:border-accent-gold/50">
      <h3 className="text-sm font-semibold text-white">Model report card</h3>
      <p className="mt-1 text-sm text-ink-300">
        Called{" "}
        <strong>
          {report.hits} of {report.n}
        </strong>{" "}
        group results — {edge >= 0 ? "beating" : "trailing"} a blind guess by{" "}
        <strong>{Math.abs(edge).toFixed(2)}</strong> log-loss.{" "}
        <span className="text-pitch-500">see detail →</span>
      </p>
    </Link>
  );
}
