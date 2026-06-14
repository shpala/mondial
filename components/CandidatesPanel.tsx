import Link from "next/link";
import type { Candidate } from "@/lib/qualifiers";
import { TeamFlag } from "@/components/ui/TeamFlag";

function Chip({ c }: { c: Candidate }) {
  return (
    <Link
      href={`/teams/${c.team.id}`}
      title={`${c.team.name} — ${c.place} in Group ${c.group}, ${c.points} pts from ${c.played} game(s)`}
      className={`flex flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-xs transition hover:bg-ink-700/60 ${
        c.confirmed
          ? "border-emerald-600/40 bg-emerald-700/10"
          : "border-dashed border-ink-600"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <TeamFlag flag={c.team.flag} alt={c.team.name} size={16} decorative />
        <span className="font-semibold">{c.team.code}</span>
        {c.confirmed && (
          <span
            className="ml-auto text-[10px] text-emerald-400"
            title="Group complete"
          >
            ✓
          </span>
        )}
      </div>
      <div className="text-[10px] text-ink-400">
        {c.place} · Grp {c.group} · {c.points} pts
      </div>
    </Link>
  );
}

function Bucket({
  title,
  hint,
  candidates,
}: {
  title: string;
  hint: string;
  candidates: Candidate[];
}) {
  return (
    <div className="card p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-sm font-bold">{title}</h3>
        <span className="text-[10px] uppercase tracking-wide text-ink-400">
          {hint}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {candidates.map((c) => (
          <Chip key={`${c.group}-${c.team.id}`} c={c} />
        ))}
      </div>
    </div>
  );
}

export function CandidatesPanel({
  winners,
  runnersUp,
  bestThirds,
}: {
  winners: Candidate[];
  runnersUp: Candidate[];
  bestThirds: Candidate[];
}) {
  const confirmed =
    [...winners, ...runnersUp, ...bestThirds].filter((c) => c.confirmed)
      .length;
  const total = winners.length + runnersUp.length + bestThirds.length;

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">
          Round-of-32 candidates
        </h2>
        <span className="text-xs text-ink-400">
          from games played · {confirmed}/{total} positions confirmed (
          <span className="text-emerald-400">✓</span> = group complete)
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Bucket title="Group winners" hint="1st × 12" candidates={winners} />
        <Bucket title="Runners-up" hint="2nd × 12" candidates={runnersUp} />
        <Bucket title="Best thirds" hint="top 8 of 12" candidates={bestThirds} />
      </div>
      <p className="mt-2 text-xs text-ink-400">
        Positions reflect the current standings and shift as more group games are
        played. Dashed = provisional; green ✓ = group finished.
      </p>
    </section>
  );
}
