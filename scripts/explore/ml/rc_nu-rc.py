"""
Variant: nu-rc — sweep draw-weight (nu) on WC2022, pick best pre-cutoff, read WC2026.

Protocol: sweep nu on WC2022 (pre-cutoff analog, n=64) to choose nu, then
score WC2026 with that nu. No tuning on WC2026 games.
"""
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))

from rc_grade import (
    WC2026, WC2022, REG, registry_source, corp22, corp26,
    grade_detail, paired_bootstrap, SCALE_WC, HOST_BUMP, K
)

# --- WC2022 baseline (corpus-rolled-to-2022, nu=0.8) ---
def corp22_seed(nm):
    return (corp22[nm], False) if nm in corp22 else None

base22 = grade_detail(WC2022, corp22_seed, nu=0.8)
print(f"WC2022 baseline (nu=0.8): logloss={base22['logloss']:.4f}  n={base22['n']}")

# --- Sweep nu on WC2022 to pick best value (pre-cutoff tuning) ---
nus = [round(x * 0.1, 1) for x in range(5, 13)]  # 0.5, 0.6, ..., 1.2
print("\nnu sweep on WC2022 (corpus-rolled seeds, n=64):")
best_nu = 0.8
best_ll = float("inf")
sweep_results = {}
for nu in nus:
    res = grade_detail(WC2022, corp22_seed, nu=nu)
    sweep_results[nu] = res
    print(f"  nu={nu:.1f}  logloss={res['logloss']:.4f}  hits={res['hits']}/{res['n']}")
    if res["logloss"] < best_ll:
        best_ll = res["logloss"]
        best_nu = nu

print(f"\nBest nu on WC2022: {best_nu:.1f} (logloss={best_ll:.4f})")

# --- WC2022 paired bootstrap: best_nu vs baseline nu=0.8 ---
boot22 = paired_bootstrap(base22["per_game"], sweep_results[best_nu]["per_game"])
print(f"\nWC2022 paired bootstrap (nu={best_nu:.1f} vs nu=0.8):")
print(f"  mean={boot22['mean']:+.4f}  95% CI [{boot22['lo']:+.4f}, {boot22['hi']:+.4f}]")
sig22 = not (boot22["lo"] <= 0 <= boot22["hi"])
print(f"  Significant on WC2022: {sig22}")

# --- WC2026 baseline (registry seeds, nu=0.8) ---
base26 = grade_detail(WC2026, registry_source, nu=0.8)
print(f"\nWC2026 baseline (registry, nu=0.8): logloss={base26['logloss']:.4f}  n={base26['n']}")

# --- WC2026 variant: use best_nu with registry seeds ---
var26 = grade_detail(WC2026, registry_source, nu=best_nu)
print(f"WC2026 variant  (registry, nu={best_nu:.1f}): logloss={var26['logloss']:.4f}  n={var26['n']}")

# --- WC2026 paired bootstrap ---
boot26 = paired_bootstrap(base26["per_game"], var26["per_game"])
print(f"\nWC2026 paired bootstrap (nu={best_nu:.1f} vs nu=0.8):")
print(f"  mean={boot26['mean']:+.4f}  95% CI [{boot26['lo']:+.4f}, {boot26['hi']:+.4f}]")
sig26 = not (boot26["lo"] <= 0 <= boot26["hi"])
print(f"  Significant on WC2026: {sig26}")

# --- Summary ---
print("\n=== SUMMARY ===")
print(f"Chosen nu: {best_nu:.1f} (selected by WC2022 sweep, no WC2026 leakage)")
print(f"WC2022 baseline logloss: {base22['logloss']:.4f}")
print(f"WC2022 variant  logloss: {sweep_results[best_nu]['logloss']:.4f}  delta={sweep_results[best_nu]['logloss'] - base22['logloss']:+.4f}")
print(f"WC2026 baseline logloss: {base26['logloss']:.4f}")
print(f"WC2026 variant  logloss: {var26['logloss']:.4f}  delta={var26['logloss'] - base26['logloss']:+.4f}")
print(f"Bootstrap CI: [{boot26['lo']:+.4f}, {boot26['hi']:+.4f}]  mean={boot26['mean']:+.4f}")
print(f"Significant on WC2026 (12 games): {sig26}")

# --- Also show WC2022 baseline vs best_nu vs corpus baseline 1.0567 ---
print(f"\nReference baselines: WC2026 registry=0.9594, WC2022 corpus=1.0567")
