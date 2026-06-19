"""
Variant: best-seed-source
Which pre-cutoff seed source grades best on WC2026 (rigorous, with bootstrap CIs)?

Head-to-head: registry vs corpus-rolled vs blends (0.25/0.5/0.75) vs even-prior.
Baseline for bootstrap: registry (logloss ~0.9594).
WC2022 corpus-rolled (logloss ~1.0567) used as larger analog for significance.
"""
import sys, json
sys.path.insert(0, "scripts/explore/ml")
from rc_grade import (WC2026, WC2022, REG, registry_source, corp26, corp22,
    corpus_ratings, grade_detail, paired_bootstrap, HOSTS, SCALE_WC, NU, HOST_BUMP, K,
    davidson, winprob, goal_mult, zblend)

# --- seed sources ---
def corp26_source(nm):
    v = corp26.get(nm)
    return (v, nm in HOSTS) if v is not None else None

def corp22_source(nm):
    v = corp22.get(nm)
    return (v, False) if v is not None else None

# even-prior: all teams rated equal (INIT=1500), so Davidson gives uniform probs
def even_prior(nm):
    return (1500.0, nm in HOSTS)

# --- WC2026 baselines & variants ---
base26  = grade_detail(WC2026, registry_source)
corp26r = grade_detail(WC2026, corp26_source)
blend25 = grade_detail(WC2026, zblend(0.25))
blend50 = grade_detail(WC2026, zblend(0.50))
blend75 = grade_detail(WC2026, zblend(0.75))
even26  = grade_detail(WC2026, even_prior)

# --- WC2022 baselines ---
base22  = grade_detail(WC2022, corp22_source)

# --- bootstrap vs registry baseline ---
def boot26(variant):
    return paired_bootstrap(base26["per_game"], variant["per_game"])

results_26 = {
    "registry (baseline)":   {"grade": base26,  "boot_vs_registry": {"mean":0.0,"lo":0.0,"hi":0.0}},
    "corpus-rolled":         {"grade": corp26r, "boot_vs_registry": boot26(corp26r)},
    "blend 0.25reg/0.75corp":{"grade": blend25, "boot_vs_registry": boot26(blend25)},
    "blend 0.50reg/0.50corp":{"grade": blend50, "boot_vs_registry": boot26(blend50)},
    "blend 0.75reg/0.25corp":{"grade": blend75, "boot_vs_registry": boot26(blend75)},
    "even-prior":            {"grade": even26,  "boot_vs_registry": boot26(even26)},
}

print("=== WC2026 (n=12) ===")
print(f"{'Source':<32} {'logloss':>8}  {'boot mean':>10}  {'boot 95% CI':>20}  significant")
for name, d in results_26.items():
    g = d["grade"]
    b = d["boot_vs_registry"]
    sig = (b["lo"] > 0 or b["hi"] < 0)
    print(f"  {name:<30} {g['logloss']:8.4f}  {b['mean']:+10.4f}  [{b['lo']:+.4f}, {b['hi']:+.4f}]  {'YES' if sig else 'no'}")

print()
print("=== WC2022 analog (n=64, corpus-rolled baseline) ===")
print(f"  corpus-rolled logloss: {base22['logloss']:.4f}  n={base22['n']}")

# detailed JSON output
output = {
    "wc2026": {
        name: {
            "logloss": round(d["grade"]["logloss"], 6),
            "n": d["grade"]["n"],
            "boot_vs_registry_mean": round(d["boot_vs_registry"]["mean"], 6),
            "boot_95ci": [round(d["boot_vs_registry"]["lo"], 6),
                          round(d["boot_vs_registry"]["hi"], 6)],
            "significant": bool(d["boot_vs_registry"]["lo"] > 0 or d["boot_vs_registry"]["hi"] < 0),
        }
        for name, d in results_26.items()
    },
    "wc2022": {
        "corpus_rolled": {
            "logloss": round(base22["logloss"], 6),
            "n": base22["n"],
        }
    }
}
print()
print(json.dumps(output, indent=2))
