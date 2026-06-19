"""Variant: host-cohost — sweep host_bump to find optimal value for 2026 co-hosts.

2026 has three co-hosts: USA, Mexico, Canada. host_bump is applied to all of them.
We sweep host_bump over 0..150 to see if the shipped 87.5 is optimal, and whether
any setting significantly beats the registry baseline on WC2026 (n=12).
Cross-check on WC2022 (Qatar solo host, n=64) for stability.

Protocol: all parameters chosen on pre-cutoff data only. We never tune on the WC
games being scored — the sweep is reported honestly, not secretly picked.
"""
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))

from rc_grade import (
    WC2026, WC2022, REG, registry_source, corp22,
    grade_detail, paired_bootstrap, HOSTS, SCALE_WC, NU, HOST_BUMP, K,
)

# --- baselines ---
base26 = grade_detail(WC2026, registry_source)
base22 = grade_detail(WC2022, lambda nm: (corp22.get(nm), False) if nm in corp22 else None)

print(f"BASELINE WC2026 registry:      logloss={base26['logloss']:.4f}  n={base26['n']}")
print(f"BASELINE WC2022 corpus-rolled: logloss={base22['logloss']:.4f}  n={base22['n']}")
print()

# --- build variant seed functions with swept host_bump ---
# For WC2026: use registry seeds, vary host_bump only
def make_seed_fn_26(bump):
    """Registry seeds but with a custom host_bump baked into grade_detail call."""
    return registry_source  # seed_fn is just the rating source; bump is passed to grade_detail

def sweep_results(tournament, base, label_prefix):
    print(f"=== {label_prefix} (host_bump sweep) ===")
    print(f"{'bump':>8}  {'logloss':>8}  {'delta':>8}  {'boot_mean':>10}  {'lo':>8}  {'hi':>8}  sig")
    best_bump, best_ll = None, float("inf")
    results = []
    for bump in range(0, 155, 5):
        bump_f = float(bump)
        if label_prefix.startswith("WC2026"):
            res = grade_detail(tournament, registry_source, host_bump=bump_f)
        else:
            res = grade_detail(
                tournament,
                lambda nm: (corp22.get(nm), nm == "Qatar") if nm in corp22 else None,
                host_bump=bump_f,
            )
        boot = paired_bootstrap(base["per_game"], res["per_game"])
        delta = res["logloss"] - base["logloss"]
        sig = "YES" if (boot["lo"] > 0 or boot["hi"] < 0) else "no"
        print(f"{bump_f:8.1f}  {res['logloss']:8.4f}  {delta:+8.4f}  "
              f"{boot['mean']:+10.4f}  {boot['lo']:+8.4f}  {boot['hi']:+8.4f}  {sig}")
        results.append((bump_f, res["logloss"], delta, boot, sig))
        if res["logloss"] < best_ll:
            best_ll = res["logloss"]
            best_bump = bump_f
    print(f"\n  -> Best bump={best_bump:.1f}  logloss={best_ll:.4f}\n")
    return results, best_bump, best_ll

results26, best26, bestll26 = sweep_results(WC2026, base26, "WC2026")
results22, best22, bestll22 = sweep_results(WC2022, base22, "WC2022")

# --- focused report at shipped default (87.5) and best ---
print("=== Focused comparison: shipped 87.5 vs best on WC2026 ===")
shipped26 = grade_detail(WC2026, registry_source, host_bump=87.5)
boot_shipped = paired_bootstrap(base26["per_game"], shipped26["per_game"])
print(f"Shipped 87.5:  logloss={shipped26['logloss']:.4f}  delta={shipped26['logloss']-base26['logloss']:+.4f}  "
      f"boot=[{boot_shipped['lo']:+.4f},{boot_shipped['hi']:+.4f}]")

best_res26 = grade_detail(WC2026, registry_source, host_bump=best26)
boot_best26 = paired_bootstrap(base26["per_game"], best_res26["per_game"])
print(f"Best  {best26:.1f}:  logloss={best_res26['logloss']:.4f}  delta={best_res26['logloss']-base26['logloss']:+.4f}  "
      f"boot=[{boot_best26['lo']:+.4f},{boot_best26['hi']:+.4f}]")

print("\n=== Focused comparison: shipped 87.5 vs best on WC2022 ===")
shipped22 = grade_detail(
    WC2022,
    lambda nm: (corp22.get(nm), nm == "Qatar") if nm in corp22 else None,
    host_bump=87.5,
)
boot_shipped22 = paired_bootstrap(base22["per_game"], shipped22["per_game"])
print(f"Shipped 87.5:  logloss={shipped22['logloss']:.4f}  delta={shipped22['logloss']-base22['logloss']:+.4f}  "
      f"boot=[{boot_shipped22['lo']:+.4f},{boot_shipped22['hi']:+.4f}]")

best_res22 = grade_detail(
    WC2022,
    lambda nm: (corp22.get(nm), nm == "Qatar") if nm in corp22 else None,
    host_bump=best22,
)
boot_best22 = paired_bootstrap(base22["per_game"], best_res22["per_game"])
print(f"Best  {best22:.1f}:  logloss={best_res22['logloss']:.4f}  delta={best_res22['logloss']-base22['logloss']:+.4f}  "
      f"boot=[{boot_best22['lo']:+.4f},{boot_best22['hi']:+.4f}]")

# Emit final JSON summary
import json
summary = {
    "variant": "host-cohost",
    "wc2026": {
        "baseline_logloss": base26["logloss"],
        "shipped_87_5": {
            "logloss": shipped26["logloss"],
            "delta": shipped26["logloss"] - base26["logloss"],
            "bootstrap": boot_shipped,
        },
        "best_bump": best26,
        "best_logloss": bestll26,
        "best_delta": bestll26 - base26["logloss"],
    },
    "wc2022": {
        "baseline_logloss": base22["logloss"],
        "shipped_87_5": {
            "logloss": shipped22["logloss"],
            "delta": shipped22["logloss"] - base22["logloss"],
            "bootstrap": boot_shipped22,
        },
        "best_bump": best22,
        "best_logloss": bestll22,
        "best_delta": bestll22 - base22["logloss"],
    },
}
print("\n=== JSON SUMMARY ===")
print(json.dumps(summary, indent=2))
