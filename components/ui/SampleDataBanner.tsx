import { getDataStatus } from "@/lib/data";

export async function SampleDataBanner() {
  const { usingSample } = await getDataStatus();
  if (!usingSample) return null;
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-accent-gold/30 bg-accent-gold/10 px-4 py-3 text-sm text-amber-200">
      <span className="text-base leading-none">⚠️</span>
      <p>
        Showing <strong>sample data</strong> — the live feed
        (openfootball) is unreachable right now. Fixtures, groups and results
        normally come from it automatically; no key required.{" "}
        <span className="text-amber-200/80">
          Scores, standings and model predictions below are based on sample
          fixtures, not live results.
        </span>
      </p>
    </div>
  );
}
