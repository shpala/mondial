"""Report-card grader: replicate the /model page's gradeOutcomes scoring on the
2026 World Cup games, parameterised by the SEED RATING SOURCE — to test whether a
pre-cutoff rating other than the shipped registry seeds grades better.

gradeOutcomes (lib/modelreport.ts): seed each team from its rating, then for each
played group game in kickoff order — score it with the Davidson 1X2 at the WC
prediction scale (host-adjusted), then roll the result into the ratings (eloUpdate).
No leakage: a game is scored before its own result is folded in.

Seed sources compared:
  registry      : the shipped World Football Elo seeds (lib/teams/registry.ts)
  corpus_cutoff : Elo rolled over intl_results.csv strictly BEFORE the WC starts
  blend_a       : a*registry + (1-a)*corpus (z-scored to a common scale), swept
All are PRE-CUTOFF (nothing fit on the WC games). The bar is the registry source.
"""
import csv, math, json, statistics
from collections import defaultdict
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

NU, SCALE_WC, SCALE_RATE = 0.8, 500.0, 300.0
HOST_BUMP, K, INIT = 87.5, 45.0, 1500.0
HOSTS = {"United States", "Mexico", "Canada"}

def rows():
    out = []
    for i, line in enumerate(open(ROOT / "data/intl_results.csv")):
        if i == 0: continue
        f = line.rstrip("\n").split(",")
        if len(f) != 9: continue
        try: hg, ag = int(f[3]), int(f[4])
        except ValueError: continue
        out.append((f[0], f[1], f[2], hg, ag, f[5], f[8].strip().upper() == "TRUE"))
    out.sort(key=lambda r: r[0])
    return out
ROWS = rows()

def goal_mult(d):
    d = abs(d); return 1.0 if d <= 1 else 1.5 if d == 2 else (11 + d) / 8
def winprob(ra, rb, scale=SCALE_RATE):
    return 1.0 / (1.0 + 10 ** ((rb - ra) / scale))
def davidson(ra, rb, scale):
    a, b = 10 ** (ra / scale), 10 ** (rb / scale); d = NU * math.sqrt(a * b); z = a + b + d
    return a / z, d / z, b / z

# --- seed source: corpus Elo rolled strictly before the WC starts (cutoff) ---
def corpus_ratings(cutoff):
    r = defaultdict(lambda: INIT)
    for date, h, a, hg, ag, tour, neutral in ROWS:
        if date >= cutoff: break
        eh = r[h] + (0 if neutral else HOST_BUMP); ea = r[a]
        w = 1.0 if hg > ag else 0.5 if hg == ag else 0.0
        d = K * goal_mult(hg - ag) * (w - winprob(eh, ea))
        r[h] += d; r[a] -= d
    return dict(r)

REG = {o["name"]: o for o in json.load(open("/tmp/registry_ratings.json")) if o.get("rating")}
def registry_source(name):
    o = REG.get(name)
    return (float(o["rating"]), bool(o["host"])) if o else None

WC2026 = [r for r in ROWS if r[5] == "FIFA World Cup" and r[0] >= "2026-06-01"]
WC2022 = [r for r in ROWS if r[5] == "FIFA World Cup" and "2022-11-20" <= r[0] <= "2022-12-18"]

def grade(games, seed_fn, label):
    """seed_fn(name)->(rating,host) or None (skip game if a team is unrated)."""
    rating, host = {}, {}
    def ensure(name):
        if name not in rating:
            s = seed_fn(name)
            if s is None: return False
            rating[name], host[name] = s[0], s[1]
        return True
    ll = brier = 0.0; n = hits = 0; skipped = 0
    for date, h, a, hg, ag, tour, neutral in games:
        if not (ensure(h) and ensure(a)): skipped += 1; continue
        eh = rating[h] + (HOST_BUMP if (host[h] or h in HOSTS) else 0)
        ea = rating[a] + (HOST_BUMP if (host[a] or a in HOSTS) else 0)
        ph, pd, pa = davidson(eh, ea, SCALE_WC)
        y = 0 if hg > ag else (1 if hg == ag else 2)
        p = (ph, pd, pa)[y]
        ll += -math.log(max(p, 1e-15))
        for k, pk in enumerate((ph, pd, pa)): brier += (pk - (1 if k == y else 0)) ** 2
        hits += int(max(range(3), key=lambda k: (ph, pd, pa)[k]) == y)
        n += 1
        # roll live (host-adjusted, raw scale)
        d = K * goal_mult(hg - ag) * ((1.0 if hg > ag else 0.5 if hg == ag else 0.0) - winprob(eh, ea))
        rating[h] += d; rating[a] -= d
    print(f"  {label:24s} n={n:2d} skip={skipped:2d}  logloss={ll/n:.4f}  brier={brier/n:.4f}  hits={hits}/{n}")
    return ll / n if n else 0.0

corp26 = corpus_ratings("2026-06-11")
corp22 = corpus_ratings("2022-11-20")
# z-score corpus onto the registry scale for blending (registry spread is wider)
def zblend(a):
    cm = statistics.mean(corp26.values()); cs = statistics.pstdev(corp26.values())
    rm = statistics.mean([v["rating"] for v in REG.values()]); rs = statistics.pstdev([v["rating"] for v in REG.values()])
    def fn(name):
        reg = REG.get(name); cp = corp26.get(name)
        if reg is None and cp is None: return None
        rv = float(reg["rating"]) if reg else None
        cv = (rm + (cp - cm) / cs * rs) if cp is not None else None
        if rv is None: return (cv, name in HOSTS)
        if cv is None: return (rv, bool(reg["host"]))
        return (a * rv + (1 - a) * cv, bool(reg["host"]))
    return fn

def grade_detail(games, seed_fn, scale=SCALE_WC, nu=NU, host_bump=HOST_BUMP, kroll=K):
    """Like grade() but returns per-game log-losses (for bootstrap) + summary.
    seed_fn(name)->(rating,host) or None (skip). Pure; no printing."""
    rating, host = {}, {}
    def ensure(nm):
        if nm not in rating:
            s = seed_fn(nm)
            if s is None: return False
            rating[nm], host[nm] = s[0], s[1]
        return True
    lls, briers = [], []; hits = n = 0
    for date, h, a, hg, ag, tour, neutral in games:
        if not (ensure(h) and ensure(a)): continue
        eh = rating[h] + (host_bump if (host[h] or h in HOSTS) else 0)
        ea = rating[a] + (host_bump if (host[a] or a in HOSTS) else 0)
        a_, b_ = 10 ** (eh / scale), 10 ** (ea / scale); dd = nu * math.sqrt(a_ * b_); z = a_ + b_ + dd
        ph, pd, pa = a_ / z, dd / z, b_ / z
        y = 0 if hg > ag else (1 if hg == ag else 2)
        lls.append(-math.log(max((ph, pd, pa)[y], 1e-15)))
        briers.append(sum((pk - (1 if k == y else 0)) ** 2 for k, pk in enumerate((ph, pd, pa))))
        hits += int(max(range(3), key=lambda k: (ph, pd, pa)[k]) == y); n += 1
        d = kroll * goal_mult(hg - ag) * ((1.0 if hg > ag else 0.5 if hg == ag else 0.0) - winprob(eh, ea))
        rating[h] += d; rating[a] -= d
    return {"logloss": sum(lls) / n, "brier": sum(briers) / n, "hits": hits, "n": n, "per_game": lls}

def paired_bootstrap(ll_a, ll_b, iters=10000, seed=20260619):
    """Mean(B - A) and 95% CI over matched per-game log-losses (B=variant, A=base).
    Positive mean => variant has higher loss (worse). CI excluding 0 => significant."""
    import random
    rng = random.Random(seed); n = len(ll_a); diffs = [b - a for a, b in zip(ll_a, ll_b)]
    means = sorted(sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(iters))
    return {"mean": sum(diffs) / n, "lo": means[int(0.025 * iters)], "hi": means[int(0.975 * iters)]}

if __name__ == "__main__":
    print("=== 2026 report card (the model page surface, n=12) ===")
    grade(WC2026, registry_source, "registry (SHIPPED)")
    grade(WC2026, lambda nm: (corp26.get(nm), nm in HOSTS) if nm in corp26 else None, "corpus-rolled-to-cutoff")
    for a in (0.25, 0.5, 0.75):
        grade(WC2026, zblend(a), f"blend {a:.2f}reg/{1-a:.2f}corp")
    print("\n=== 2022 report card analog (corpus-rolled, n=64; registry is 2026-only) ===")
    grade(WC2022, lambda nm: (corp22.get(nm), False) if nm in corp22 else None, "corpus-rolled-to-2022")
