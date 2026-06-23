"""
Variant: scale-rc — sweep Davidson scale (300..700) for report-card scoring.
Is the shipped 500 still best on WC2026 AND WC2022?

Protocol: scale is chosen on pre-cutoff grounds (WC2022 corpus-rolled analog).
We sweep on WC2022 to pick the best scale, then report both windows honestly.
No peeking at WC2026 to pick the scale.
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from rc_grade import (
    WC2026, WC2022, REG, registry_source, corp26, corp22,
    corpus_ratings, grade_detail, paired_bootstrap,
    HOSTS, SCALE_WC, NU, HOST_BUMP, K,
    davidson, winprob, goal_mult
)

SCALES = list(range(300, 701, 50))

# --- WC2022 corpus seed function ---
def corp22_fn(nm):
    v = corp22.get(nm)
    return (v, False) if v is not None else None

# --- WC2026 registry seed function (already imported as registry_source) ---

print("=== Scale sweep on WC2022 (pre-cutoff tuning window, n=64) ===")
print(f"{'scale':>6}  {'logloss':>10}  {'delta_vs_500':>14}")

results_22 = {}
for sc in SCALES:
    r = grade_detail(WC2022, corp22_fn, scale=sc, nu=NU, host_bump=HOST_BUMP, kroll=K)
    results_22[sc] = r
    print(f"  {sc:>4d}  {r['logloss']:>10.4f}")

best_scale_22 = min(results_22, key=lambda s: results_22[s]['logloss'])
print(f"\nBest scale on WC2022 (pre-cutoff): {best_scale_22}  logloss={results_22[best_scale_22]['logloss']:.4f}")
print(f"Shipped 500 logloss on WC2022:      {results_22[500]['logloss']:.4f}")

print("\n=== Scale sweep on WC2026 (held-out; for report card only) ===")
print(f"{'scale':>6}  {'logloss':>10}")

results_26 = {}
for sc in SCALES:
    r = grade_detail(WC2026, registry_source, scale=sc, nu=NU, host_bump=HOST_BUMP, kroll=K)
    results_26[sc] = r
    print(f"  {sc:>4d}  {r['logloss']:>10.4f}")

best_scale_26 = min(results_26, key=lambda s: results_26[s]['logloss'])
print(f"\nBest scale on WC2026 (observed): {best_scale_26}  logloss={results_26[best_scale_26]['logloss']:.4f}")
print(f"Shipped 500 logloss on WC2026:    {results_26[500]['logloss']:.4f}")

# --- Baselines ---
base26 = grade_detail(WC2026, registry_source, scale=500, nu=NU, host_bump=HOST_BUMP, kroll=K)
base22 = grade_detail(WC2022, corp22_fn, scale=500, nu=NU, host_bump=HOST_BUMP, kroll=K)

print(f"\n=== Baselines ===")
print(f"WC2026 registry@500: logloss={base26['logloss']:.4f}  n={base26['n']}")
print(f"WC2022 corpus@500:   logloss={base22['logloss']:.4f}  n={base22['n']}")

# --- Choose variant scale: best on WC2022 (pre-cutoff), not peeking at WC2026 ---
chosen_scale = best_scale_22
print(f"\n=== Variant: scale={chosen_scale} (chosen on WC2022 pre-cutoff tuning) ===")

var26 = grade_detail(WC2026, registry_source, scale=chosen_scale, nu=NU, host_bump=HOST_BUMP, kroll=K)
var22 = grade_detail(WC2022, corp22_fn, scale=chosen_scale, nu=NU, host_bump=HOST_BUMP, kroll=K)

print(f"WC2026: logloss={var26['logloss']:.4f}  delta={var26['logloss']-base26['logloss']:+.4f}")
print(f"WC2022: logloss={var22['logloss']:.4f}  delta={var22['logloss']-base22['logloss']:+.4f}")

boot26 = paired_bootstrap(base26['per_game'], var26['per_game'])
boot22 = paired_bootstrap(base22['per_game'], var22['per_game'])

print(f"\nPaired bootstrap vs WC2026 baseline (mean variant-base; positive=worse):")
print(f"  mean={boot26['mean']:+.4f}  95% CI [{boot26['lo']:+.4f}, {boot26['hi']:+.4f}]")
sig26 = boot26['lo'] > 0 or boot26['hi'] < 0
print(f"  CI excludes 0: {sig26}  (significant: {sig26})")

print(f"\nPaired bootstrap vs WC2022 baseline:")
print(f"  mean={boot22['mean']:+.4f}  95% CI [{boot22['lo']:+.4f}, {boot22['hi']:+.4f}]")
sig22 = boot22['lo'] > 0 or boot22['hi'] < 0
print(f"  CI excludes 0: {sig22}  (significant: {sig22})")

print("\n=== Summary ===")
print(f"Chosen scale: {chosen_scale} (from WC2022 sweep)")
print(f"WC2026 variant logloss: {var26['logloss']:.4f}  delta: {var26['logloss']-base26['logloss']:+.4f}")
print(f"WC2022 variant logloss: {var22['logloss']:.4f}  delta: {var22['logloss']-base22['logloss']:+.4f}")
print(f"WC2026 boot: mean={boot26['mean']:+.4f} [{boot26['lo']:+.4f},{boot26['hi']:+.4f}]  sig={sig26}")
print(f"WC2022 boot: mean={boot22['mean']:+.4f} [{boot22['lo']:+.4f},{boot22['hi']:+.4f}]  sig={sig22}")
