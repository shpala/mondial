"""
rc_recency-refresh.py

Variant: "recency-refresh"
Roll the registry seeds FORWARD with eloUpdate over corpus matches dated in
[cutoff_start, 2026-06-10] — i.e. freshen each registry-seeded team with its
most-recent pre-tournament form.

The seed_fn for WC2026:
  1. Start from the registry rating for each team.
  2. For each corpus match in [cutoff_start, 2026-06-10] where at least one
     participant already has a registry seed, update using eloUpdate (K=45,
     host_bump=87.5).  Teams never in the registry get a corpus-only fallback.
  3. Return the freshened rating.

This is purely PRE-CUTOFF (all data is from before the WC starts).

For WC2022 the analog uses corpus-rolled-to-2022 as the base (registry seeds
are 2026-specific), then rolls an additional window [2022-01-01, 2022-11-19].
We compare against the standard corp22 baseline to test whether the recency
window helps on the larger 64-game set.
"""

import sys, math, json
sys.path.insert(0, "/home/shpala/dev/mondial/scripts/explore/ml")

from rc_grade import (
    WC2026, WC2022, REG, registry_source, corp22, ROWS,
    corpus_ratings, grade_detail, paired_bootstrap,
    HOSTS, SCALE_WC, NU, HOST_BUMP, K,
    davidson, winprob, goal_mult,
)

# ---------------------------------------------------------------------------
# Recency-refresh for WC2026
# ---------------------------------------------------------------------------
CUTOFF_START_2026 = "2026-01-01"
CUTOFF_END_2026   = "2026-06-10"   # exclusive upper bound (WC starts 2026-06-11)

def build_refreshed_ratings_2026(cutoff_start=CUTOFF_START_2026, cutoff_end=CUTOFF_END_2026):
    """
    Start from registry seeds; roll forward over corpus rows in
    [cutoff_start, cutoff_end]. Teams not in registry start from INIT=1500
    if they appear only in the corpus window.
    """
    # Seed from registry
    rating = {}
    is_host = {}
    for name, o in REG.items():
        rating[name] = float(o["rating"])
        is_host[name] = bool(o["host"])

    for date, h, a, hg, ag, tour, neutral in ROWS:
        if date < cutoff_start:
            continue
        if date > cutoff_end:
            break

        # Ensure both teams have a rating (use corpus-based init for unknowns)
        from rc_grade import INIT
        if h not in rating:
            rating[h] = INIT
            is_host[h] = (h in HOSTS)
        if a not in rating:
            rating[a] = INIT
            is_host[a] = (a in HOSTS)

        eh = rating[h] + (HOST_BUMP if (is_host[h] or h in HOSTS) else 0) if not neutral else rating[h]
        ea = rating[a] + (HOST_BUMP if (is_host[a] or a in HOSTS) else 0) if not neutral else rating[a]
        # Use standard rating scale for update (SCALE_RATE=300 as in the harness)
        SCALE_RATE = 300.0
        w = 1.0 if hg > ag else 0.5 if hg == ag else 0.0
        d = K * goal_mult(hg - ag) * (w - winprob(eh, ea, SCALE_RATE))
        rating[h] += d
        rating[a] -= d

    return rating, is_host

refreshed_2026, refreshed_host_2026 = build_refreshed_ratings_2026()

def recency_refresh_seed_2026(name):
    if name in refreshed_2026:
        return (refreshed_2026[name], refreshed_host_2026.get(name, name in HOSTS))
    # Fallback: registry only
    o = REG.get(name)
    return (float(o["rating"]), bool(o["host"])) if o else None


# ---------------------------------------------------------------------------
# Recency-refresh for WC2022 (analogous, to test on 64 games)
# ---------------------------------------------------------------------------
CUTOFF_START_2022 = "2022-01-01"
CUTOFF_END_2022   = "2022-11-19"   # WC2022 starts 2022-11-20

def build_refreshed_ratings_2022(cutoff_start=CUTOFF_START_2022, cutoff_end=CUTOFF_END_2022):
    """
    Start from corp22 (corpus rolled to 2022-11-20) baseline ratings, then
    also test a corp_pre2022 (rolled to 2022-01-01) + recency window approach.
    We roll from corpus_ratings("2022-01-01") forward through [2022-01-01, 2022-11-19].
    """
    from rc_grade import INIT
    corp_pre = corpus_ratings("2022-01-01")

    rating = dict(corp_pre)
    is_host = {name: False for name in rating}

    for date, h, a, hg, ag, tour, neutral in ROWS:
        if date < cutoff_start:
            continue
        if date > cutoff_end:
            break
        if h not in rating:
            rating[h] = INIT
            is_host[h] = False
        if a not in rating:
            rating[a] = INIT
            is_host[a] = False

        eh = rating[h] + (HOST_BUMP if (is_host[h]) else 0) if not neutral else rating[h]
        ea = rating[a] + (HOST_BUMP if (is_host[a]) else 0) if not neutral else rating[a]
        SCALE_RATE = 300.0
        w = 1.0 if hg > ag else 0.5 if hg == ag else 0.0
        d = K * goal_mult(hg - ag) * (w - winprob(eh, ea, SCALE_RATE))
        rating[h] += d
        rating[a] -= d

    return rating, is_host

refreshed_2022, refreshed_host_2022 = build_refreshed_ratings_2022()

def recency_refresh_seed_2022(name):
    if name in refreshed_2022:
        return (refreshed_2022[name], refreshed_host_2022.get(name, False))
    return None


# ---------------------------------------------------------------------------
# Grade and compare
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 64)
    print("Recency-Refresh Variant — Report Card")
    print("=" * 64)

    # --- WC2026 ---
    print("\n--- WC2026 (n=12) ---")
    base_2026 = grade_detail(WC2026, registry_source)
    var_2026  = grade_detail(WC2026, recency_refresh_seed_2026)

    print(f"  registry baseline : logloss={base_2026['logloss']:.4f}  n={base_2026['n']}")
    print(f"  recency-refresh   : logloss={var_2026['logloss']:.4f}  n={var_2026['n']}")
    delta_2026 = var_2026["logloss"] - base_2026["logloss"]
    print(f"  delta (var-base)  : {delta_2026:+.4f}  ({'better' if delta_2026 < 0 else 'worse'})")

    bs_2026 = paired_bootstrap(base_2026["per_game"], var_2026["per_game"])
    print(f"  bootstrap (B-A)   : mean={bs_2026['mean']:+.4f}  95%CI=[{bs_2026['lo']:+.4f}, {bs_2026['hi']:+.4f}]")
    sig_2026 = not (bs_2026["lo"] <= 0 <= bs_2026["hi"])
    print(f"  significant?      : {'YES' if sig_2026 else 'NO (CI includes 0)'}")

    # --- WC2022 ---
    print("\n--- WC2022 (n=64) ---")
    def corp22_seed(nm):
        v = corp22.get(nm)
        return (v, False) if v is not None else None

    base_2022 = grade_detail(WC2022, corp22_seed)
    var_2022  = grade_detail(WC2022, recency_refresh_seed_2022)

    print(f"  corp22 baseline   : logloss={base_2022['logloss']:.4f}  n={base_2022['n']}")
    print(f"  recency-refresh   : logloss={var_2022['logloss']:.4f}  n={var_2022['n']}")
    delta_2022 = var_2022["logloss"] - base_2022["logloss"]
    print(f"  delta (var-base)  : {delta_2022:+.4f}  ({'better' if delta_2022 < 0 else 'worse'})")

    bs_2022 = paired_bootstrap(base_2022["per_game"], var_2022["per_game"])
    print(f"  bootstrap (B-A)   : mean={bs_2022['mean']:+.4f}  95%CI=[{bs_2022['lo']:+.4f}, {bs_2022['hi']:+.4f}]")
    sig_2022 = not (bs_2022["lo"] <= 0 <= bs_2022["hi"])
    print(f"  significant?      : {'YES' if sig_2022 else 'NO (CI includes 0)'}")

    print("\n--- Summary ---")
    print(f"  WC2026 logloss: baseline={base_2026['logloss']:.4f}  variant={var_2026['logloss']:.4f}  delta={delta_2026:+.4f}")
    print(f"  WC2022 logloss: baseline={base_2022['logloss']:.4f}  variant={var_2022['logloss']:.4f}  delta={delta_2022:+.4f}")
    print(f"  WC2022 significant: {sig_2022}")
    print()

    # JSON output for structured reporting
    import json as _json
    result = {
        "slug": "recency-refresh",
        "wc2026": {
            "baseline_logloss": round(base_2026["logloss"], 4),
            "variant_logloss": round(var_2026["logloss"], 4),
            "delta": round(delta_2026, 4),
            "bootstrap": bs_2026,
        },
        "wc2022": {
            "baseline_logloss": round(base_2022["logloss"], 4),
            "variant_logloss": round(var_2022["logloss"], 4),
            "delta": round(delta_2022, 4),
            "bootstrap": bs_2022,
            "significant": sig_2022,
        },
    }
    print("JSON:", _json.dumps(result, indent=2))
