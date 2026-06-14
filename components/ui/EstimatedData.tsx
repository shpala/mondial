// Provenance affordances for fabricated (generated) squads/lineups. Visually
// distinct from the gold "◆ Predicted" status tag — generated ≠ predicted.

export function EstimatedTag({ label = "Estimated" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-300">
      ≈ {label}
    </span>
  );
}

export function EstimatedNotice({ kind }: { kind: "squad" | "lineups" }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-slate-500/25 bg-slate-500/10 px-4 py-3 text-sm text-slate-300">
      <span className="text-base leading-none">≈</span>
      <p>
        <strong>Estimated {kind === "squad" ? "squad" : "line-ups"}.</strong>{" "}
        Our free data source hasn&apos;t published the official{" "}
        {kind === "squad" ? "roster" : "starting elevens"} for this{" "}
        {kind === "squad" ? "team" : "match"} yet — the player names, clubs and
        numbers shown here are illustrative placeholders, not real call-ups.
      </p>
    </div>
  );
}
