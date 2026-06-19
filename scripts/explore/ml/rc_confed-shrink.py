"""Confederation-prior shrinkage of registry seeds.

SPEC: Shrink each registry seed toward its confederation mean (or global mean)
by a factor tuned on WC2022. Tests whether the registry over/under-rates whole
confederations. Grade WC2026 + bootstrap vs registry baseline.

PROTOCOL: shrinkage factor alpha tuned only on WC2022 (pre-cutoff).
WC2026 is read-once for the final report card — no tuning on it.
"""
import sys, math, statistics
sys.path.insert(0, "scripts/explore/ml")
from rc_grade import (
    WC2026, WC2022, REG, registry_source, corp22,
    grade_detail, paired_bootstrap, HOSTS, SCALE_WC, NU, HOST_BUMP, K,
)

# --- Confederation membership (FIFA confederations, pre-cutoff data) ---
# Only teams that appear in REG need mapping; also cover WC2022/WC2026 teams that
# might get corp22 seeds in the WC2022 grading path.
CONFED = {
    # UEFA
    "Argentina":              "CONMEBOL",
    "Australia":              "AFC",
    "Belgium":                "UEFA",
    "Bosnia and Herzegovina": "UEFA",
    "Brazil":                 "CONMEBOL",
    "Canada":                 "CONCACAF",
    "Croatia":                "UEFA",
    "Curaçao":                "CONCACAF",
    "Czech Republic":         "UEFA",
    "Ecuador":                "CONMEBOL",
    "England":                "UEFA",
    "France":                 "UEFA",
    "Germany":                "UEFA",
    "Ghana":                  "CAF",
    "Haiti":                  "CONCACAF",
    "Iran":                   "AFC",
    "Ivory Coast":            "CAF",
    "Japan":                  "AFC",
    "Mexico":                 "CONCACAF",
    "Morocco":                "CAF",
    "Netherlands":            "UEFA",
    "Paraguay":               "CONMEBOL",
    "Portugal":               "UEFA",
    "Qatar":                  "AFC",
    "Saudi Arabia":           "AFC",
    "Scotland":               "UEFA",
    "Senegal":                "CAF",
    "South Africa":           "CAF",
    "South Korea":            "AFC",
    "Spain":                  "UEFA",
    "Sweden":                 "UEFA",
    "Switzerland":            "UEFA",
    "Tunisia":                "CAF",
    "Turkey":                 "UEFA",
    "United States":          "CONCACAF",
    "Uruguay":                "CONMEBOL",
    # WC2022 teams not in REG (will fall back to corp22, no shrinkage needed for those)
    "Cameroon":               "CAF",
    "Costa Rica":             "CONCACAF",
    "Denmark":                "UEFA",
    "Poland":                 "UEFA",
    "Serbia":                 "UEFA",
    "Wales":                  "UEFA",
}

def confed_shrink_registry_source(alpha):
    """Return a seed_fn that shrinks registry ratings toward confederation mean.

    For each team in REG:
        shrunk_rating = (1 - alpha) * raw_rating + alpha * confed_mean_rating

    alpha=0 => pure registry; alpha=1 => all teams at confederation mean.
    Confederation mean is computed over all REG teams in that confederation.
    Teams not in REG get None (skipped).
    """
    # Compute confederation means from REG
    confed_ratings = {}
    for name, info in REG.items():
        c = CONFED.get(name, "OTHER")
        confed_ratings.setdefault(c, []).append(float(info["rating"]))
    confed_mean = {c: statistics.mean(vs) for c, vs in confed_ratings.items()}
    global_mean = statistics.mean(float(info["rating"]) for info in REG.values())

    def seed_fn(name):
        o = REG.get(name)
        if o is None:
            return None
        raw = float(o["rating"])
        c = CONFED.get(name, "OTHER")
        mean = confed_mean.get(c, global_mean)
        shrunk = (1.0 - alpha) * raw + alpha * mean
        return (shrunk, bool(o["host"]))

    return seed_fn


# ---- Tune alpha on WC2022 --------------------------------------------------------
# WC2022 baseline: corpus-rolled seeds (same as rc_grade.py baseline for 2022)
base22_seed = lambda nm: (corp22.get(nm), False) if nm in corp22 else None
base22 = grade_detail(WC2022, base22_seed)

# For the shrinkage variant on WC2022: use shrunken registry for teams in REG,
# fall back to corp22 for the 6 WC2022 teams not in REG (Cameroon, Costa Rica,
# Denmark, Poland, Serbia, Wales) so we score the same games as the baseline.
def make_hybrid22_seed(alpha):
    """Registry (shrunken) when available; corp22 fallback — full WC2022 coverage."""
    reg_fn = confed_shrink_registry_source(alpha)
    def seed_fn(name):
        s = reg_fn(name)
        if s is not None:
            return s
        # fallback: corpus-rolled, never a host in 2022
        v = corp22.get(name)
        return (v, False) if v is not None else None
    return seed_fn

# Search alpha in [0, 1] on WC2022 logloss.
best_alpha = 0.0
best_ll = float("inf")
alpha_results = {}
for a100 in range(0, 101, 5):
    alpha = a100 / 100.0
    fn = make_hybrid22_seed(alpha)
    res = grade_detail(WC2022, fn)
    alpha_results[alpha] = res["logloss"]
    if res["logloss"] < best_ll:
        best_ll = res["logloss"]
        best_alpha = alpha

print("=== Alpha sweep on WC2022 (registry-shrunken + corp22 fallback) ===")
for a, ll in sorted(alpha_results.items()):
    marker = " <-- best" if a == best_alpha else ""
    print(f"  alpha={a:.2f}  logloss={ll:.4f}{marker}")
print(f"\nBest alpha={best_alpha:.2f}  logloss={best_ll:.4f}")

# ---- WC2022 final report ---------------------------------------------------------
fn_best22 = make_hybrid22_seed(best_alpha)
var22 = grade_detail(WC2022, fn_best22)

# WC2022 bootstrap vs corp22 baseline (as specified)
boot22 = paired_bootstrap(base22["per_game"], var22["per_game"])
print(f"\n=== WC2022 report card (alpha={best_alpha}) ===")
print(f"  baseline (corp22)  logloss={base22['logloss']:.4f}  n={base22['n']}")
print(f"  variant            logloss={var22['logloss']:.4f}  n={var22['n']}")
print(f"  bootstrap delta (variant - baseline): mean={boot22['mean']:+.4f}  95%CI=[{boot22['lo']:+.4f}, {boot22['hi']:+.4f}]")

# ---- WC2026 final report card (alpha fixed from tuning, read-once) ---------------
base26 = grade_detail(WC2026, registry_source)
fn_best = confed_shrink_registry_source(best_alpha)  # WC2026: all teams in REG
var26 = grade_detail(WC2026, fn_best)
boot26 = paired_bootstrap(base26["per_game"], var26["per_game"])
print(f"\n=== WC2026 report card (alpha={best_alpha}, registry shrunk) ===")
print(f"  registry baseline  logloss={base26['logloss']:.4f}  n={base26['n']}")
print(f"  confed-shrink      logloss={var26['logloss']:.4f}  n={var26['n']}")
print(f"  bootstrap delta (variant - baseline): mean={boot26['mean']:+.4f}  95%CI=[{boot26['lo']:+.4f}, {boot26['hi']:+.4f}]")
sig26 = (boot26["lo"] > 0 or boot26["hi"] < 0)
sig22 = (boot22["lo"] > 0 or boot22["hi"] < 0)
print(f"  Significant on WC2026? {sig26}  (n=12, noise floor ~0.24)")
print(f"  Significant on WC2022? {sig22}  (n={base22['n']})")
