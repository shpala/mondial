"""Report-card variant: blend registry Elo with FIFA world ranking points.

FIFA points (pre-cutoff) are z-scored onto the registry Elo scale, then blended
as:  blended = a * registry + (1-a) * fifa_zscored

Blend weight 'a' is chosen on WC2022 (pre-cutoff) to avoid any leakage from WC2026.
WC2026 is the held-out evaluation surface.

FIFA ranking sources:
  WC2026 variant : September 2025 rankings (id14870, last available before 2026-06-11)
  WC2022 variant : October 2022 rankings (id13792, last available before 2022-11-20)

Name mapping (FIFA name -> intl_results.csv name):
  Czechia         -> Czech Republic
  IR Iran         -> Iran
  Korea Republic  -> South Korea
  Türkiye         -> Turkey
  USA             -> United States
  Côte d'Ivoire is not in FIFA Sep2025 data as such; nearest match:
    - "Ivory Coast" is in registry; not found by those names, use registry only
  Curaçao - small team, likely not in FIFA rankings; use registry only
"""
import sys, json, statistics
sys.path.insert(0, "scripts/explore/ml")
from rc_grade import (
    WC2026, WC2022, REG, registry_source, corp22,
    grade_detail, paired_bootstrap, HOSTS, SCALE_WC, NU, HOST_BUMP, K
)

# ---------------------------------------------------------------------------
# FIFA name -> intl_results name mapping
# ---------------------------------------------------------------------------
FIFA_NAME_MAP = {
    "Czechia":         "Czech Republic",
    "IR Iran":         "Iran",
    "Korea Republic":  "South Korea",
    "Türkiye":         "Turkey",
    "USA":             "United States",
    "Côte d'Ivoire":   "Ivory Coast",
    "Curaçao":         "Curaçao",   # same unicode in intl_results
}

def load_fifa_json(path):
    """Load {name: {rank, points, code}} and apply name mapping."""
    raw = json.load(open(path))
    result = {}
    for name, v in raw.items():
        mapped = FIFA_NAME_MAP.get(name, name)
        result[mapped] = v["points"]
    return result

# Load pre-cutoff FIFA points for each tournament window
fifa26 = load_fifa_json("/tmp/fifa_rankings_2025_sep.json")   # Sep 2025
fifa22 = load_fifa_json("/tmp/fifa_rankings_2022_oct.json")   # Oct 2022

# ---------------------------------------------------------------------------
# Build blend seed functions
# ---------------------------------------------------------------------------

def make_blend_fn(alpha, fifa_pts, window="26"):
    """Return a seed_fn(name) -> (rating, host) for the given blend weight.

    alpha=1.0 => pure registry (=registry_source for WC2026)
    alpha=0.0 => pure FIFA (z-scored to registry scale)

    For WC2022 we can't use registry (it's a 2026-specific snapshot), so we
    use corp22 as the Elo side and the FIFA Oct2022 points as the FIFA side.
    """
    reg_vals = [float(o["rating"]) for o in REG.values()]
    reg_mean = statistics.mean(reg_vals)
    reg_std  = statistics.pstdev(reg_vals)

    fifa_vals = list(fifa_pts.values())
    fifa_mean = statistics.mean(fifa_vals)
    fifa_std  = statistics.pstdev(fifa_vals)

    def zscore_fifa(pts):
        """Map FIFA points onto the registry Elo scale."""
        return reg_mean + (pts - fifa_mean) / fifa_std * reg_std

    if window == "26":
        def seed_fn(name):
            reg_entry = REG.get(name)
            fifa_p    = fifa_pts.get(name)
            if reg_entry is None and fifa_p is None:
                return None
            rv = float(reg_entry["rating"]) if reg_entry else None
            fv = zscore_fifa(fifa_p)         if fifa_p  is not None else None
            if rv is None:
                blended = fv
            elif fv is None:
                blended = rv
            else:
                blended = alpha * rv + (1 - alpha) * fv
            is_host = bool(reg_entry["host"]) if reg_entry else (name in HOSTS)
            return (blended, is_host)
    else:  # WC2022: Elo side = corp22
        # z-score corp22 onto same registry scale for fair blend
        cp_vals  = list(corp22.values())
        cp_mean  = statistics.mean(cp_vals)
        cp_std   = statistics.pstdev(cp_vals)

        def zscore_corp(r):
            return reg_mean + (r - cp_mean) / cp_std * reg_std

        def seed_fn(name):
            cp   = corp22.get(name)
            fifa_p = fifa_pts.get(name)
            if cp is None and fifa_p is None:
                return None
            rv = zscore_corp(cp)    if cp     is not None else None
            fv = zscore_fifa(fifa_p) if fifa_p is not None else None
            if rv is None:
                blended = fv
            elif fv is None:
                blended = rv
            else:
                blended = alpha * rv + (1 - alpha) * fv
            return (blended, False)  # no host bump for 2022 (Qatar neutral)

    return seed_fn


# ---------------------------------------------------------------------------
# Baselines (registry for WC2026; corpus-rolled for WC2022)
# ---------------------------------------------------------------------------
base26 = grade_detail(WC2026, registry_source)
base22 = grade_detail(WC2022, lambda nm: (corp22.get(nm), False) if nm in corp22 else None)

print("=== Baselines ===")
print(f"  WC2026 registry          logloss={base26['logloss']:.4f}  n={base26['n']}")
print(f"  WC2022 corpus-rolled     logloss={base22['logloss']:.4f}  n={base22['n']}")

# ---------------------------------------------------------------------------
# Sweep alpha on WC2022 to pick best blend weight (no leakage from WC2026)
# ---------------------------------------------------------------------------
print("\n=== WC2022 alpha sweep (choosing blend weight on pre-cutoff data) ===")
best_alpha22 = None
best_ll22    = float("inf")
alpha_results = {}

for alpha in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]:
    fn = make_blend_fn(alpha, fifa22, window="22")
    res = grade_detail(WC2022, fn)
    ll  = res["logloss"]
    delta = ll - base22["logloss"]
    alpha_results[alpha] = res
    print(f"  alpha={alpha:.1f}  logloss={ll:.4f}  delta={delta:+.4f}")
    if ll < best_ll22:
        best_ll22  = ll
        best_alpha22 = alpha

print(f"\n  -> Best alpha on WC2022: {best_alpha22}  (logloss={best_ll22:.4f})")

# ---------------------------------------------------------------------------
# Apply best alpha to WC2026 (the held-out surface)
# ---------------------------------------------------------------------------
chosen_fn26 = make_blend_fn(best_alpha22, fifa26, window="26")
var26 = grade_detail(WC2026, chosen_fn26)
delta26 = var26["logloss"] - base26["logloss"]
boot26  = paired_bootstrap(base26["per_game"], var26["per_game"])

print(f"\n=== WC2026 VARIANT (alpha={best_alpha22} chosen on WC2022) ===")
print(f"  fifa-blend  logloss={var26['logloss']:.4f}  n={var26['n']}")
print(f"  registry    logloss={base26['logloss']:.4f}")
print(f"  delta       {delta26:+.4f}  (negative=better)")
print(f"  bootstrap   mean={boot26['mean']:+.4f}  95%CI=[{boot26['lo']:+.4f}, {boot26['hi']:+.4f}]")
sig = not (boot26['lo'] <= 0 <= boot26['hi'])
print(f"  significant: {sig}  (CI excludes 0 => significant)")

# Also report WC2022 delta for the chosen alpha
var22_chosen = alpha_results[best_alpha22]
delta22 = var22_chosen["logloss"] - base22["logloss"]
boot22  = paired_bootstrap(base22["per_game"], var22_chosen["per_game"])
sig22   = not (boot22['lo'] <= 0 <= boot22['hi'])
print(f"\n=== WC2022 VARIANT (alpha={best_alpha22}) ===")
print(f"  fifa-blend  logloss={var22_chosen['logloss']:.4f}  n={var22_chosen['n']}")
print(f"  corpus-base logloss={base22['logloss']:.4f}")
print(f"  delta       {delta22:+.4f}")
print(f"  bootstrap   mean={boot22['mean']:+.4f}  95%CI=[{boot22['lo']:+.4f}, {boot22['hi']:+.4f}]")
print(f"  significant: {sig22}")

# ---------------------------------------------------------------------------
# Summary JSON
# ---------------------------------------------------------------------------
print("\n=== SUMMARY JSON ===")
summary = {
    "variant": "fifa-blend",
    "chosen_alpha": best_alpha22,
    "fifa_source_wc2026": "FIFA Men's World Ranking Sep 2025 (id14870, fetched from inside.fifa.com)",
    "fifa_source_wc2022": "FIFA Men's World Ranking Oct 2022 (id13792, fetched from inside.fifa.com)",
    "wc2026": {
        "logloss": round(var26["logloss"], 4),
        "delta_vs_registry": round(delta26, 4),
        "bootstrap_mean": round(boot26["mean"], 4),
        "bootstrap_ci_lo": round(boot26["lo"], 4),
        "bootstrap_ci_hi": round(boot26["hi"], 4),
        "significant": sig,
        "n": var26["n"],
    },
    "wc2022": {
        "logloss": round(var22_chosen["logloss"], 4),
        "delta_vs_corpus": round(delta22, 4),
        "bootstrap_mean": round(boot22["mean"], 4),
        "bootstrap_ci_lo": round(boot22["lo"], 4),
        "bootstrap_ci_hi": round(boot22["hi"], 4),
        "significant": sig22,
        "n": var22_chosen["n"],
    },
}
print(json.dumps(summary, indent=2))
