"""
Shared, leakage-free feature matrix for the "can ML / match-types / more data beat
Elo-Davidson?" bake-off. Built ONCE so every model trains on identical features and
splits (comparability + correctness).

No leakage, all features are strictly pre-match:
  - Elo is rolled in date order with the SHIPPED constants (K=45, home bump 87.5 on
    non-neutral home, logistic scale 300, init 1500). Each row records the PRE-match
    rating tuple, then the match updates ratings.
  - Per-team rolling form / rest / scoring use only strictly-earlier matches.

Splits (time-based, no leakage):
  train        : date <  2022-11-20            (fit models here)
  wc2022       : FIFA World Cup 2022-11-20..12-18  (out-of-sample holdout, n=64)
  test_general : date >= 2023-01-01, ALL match types (large reliable OOS set)
  wc2026       : FIFA World Cup >= 2026-06-01  (out-of-sample holdout, the played games)

Also prints the Elo-Davidson baseline (the shipped model) log-loss on each split —
the number every ML model must beat. wc2022 ~1.0666 confirms the roll matches the TS
backtest.

Run:  /tmp/mlvenv/bin/python scripts/explore/ml/build_features.py
Out:  scripts/explore/ml/features.csv
"""
import csv, math
from collections import deque, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CSV_IN = ROOT / "data" / "intl_results.csv"
CSV_OUT = Path(__file__).resolve().parent / "features.csv"

INIT, HOME_BUMP, K, SCALE, NU = 1500.0, 87.5, 45.0, 300.0, 0.8
FORM_N = 5

def parse_rows():
    rows = []
    with open(CSV_IN) as f:
        for i, line in enumerate(f):
            if i == 0:
                continue
            parts = line.rstrip("\n").split(",")
            if len(parts) != 9:  # skip the ~19 quoted-city rows (matches parse.ts)
                continue
            date, home, away, hs, as_, tour, _city, _country, neutral = parts
            try:
                hg, ag = int(hs), int(as_)
            except ValueError:
                continue
            rows.append((date, home, away, hg, ag, tour,
                         neutral.strip().upper() == "TRUE"))
    rows.sort(key=lambda r: r[0])
    return rows

def category(tour):
    t = tour.lower()
    if t == "friendly":
        return "friendly"
    if "qualification" in t or "qualifier" in t:
        return "qualifier"
    if "nations league" in t:
        return "nations_league"
    if tour == "FIFA World Cup":
        return "wc_finals"
    if tour == "FIFA Confederations Cup":
        return "confederations"
    if any(k in tour for k in ["Euro", "Copa América", "African Cup of Nations",
                               "AFC Asian Cup", "Gold Cup", "Cup of Nations",
                               "Championship", "Copa", "Cup"]) and "qualif" not in t:
        return "continental_finals"
    return "other"

IMP = {"friendly": 0, "nations_league": 1, "qualifier": 2, "continental_finals": 3,
       "confederations": 3, "wc_finals": 4, "other": 1}
CATS = ["friendly", "qualifier", "nations_league", "continental_finals",
        "confederations", "wc_finals", "other"]

def goal_mult(d):
    d = abs(d)
    return 1.0 if d <= 1 else 1.5 if d == 2 else (11 + d) / 8

def win_prob(ra, rb, scale=SCALE):
    return 1.0 / (1.0 + 10 ** ((rb - ra) / scale))

def davidson(ra, rb, nu=NU, scale=SCALE):
    a, b = 10 ** (ra / scale), 10 ** (rb / scale)
    d = nu * math.sqrt(a * b)
    z = a + b + d
    return a / z, d / z, b / z  # home, draw, away

def split_of(date, tour):
    if tour == "FIFA World Cup" and "2022-11-20" <= date <= "2022-12-18":
        return "wc2022"
    if tour == "FIFA World Cup" and date >= "2026-06-01":
        return "wc2026"
    if date < "2022-11-20":
        return "train"
    if date >= "2023-01-01":
        return "test_general"
    return "skip"  # the Dec 2022 gap between WC2022 and 2023

def main():
    rows = parse_rows()
    rating = defaultdict(lambda: INIT)
    last_date = {}
    hist = defaultdict(lambda: deque(maxlen=FORM_N))  # (points, gf, ga) most recent right
    played = defaultdict(int)

    def days(d1, d2):
        from datetime import date as D
        a = D(*map(int, d1.split("-")))
        b = D(*map(int, d2.split("-")))
        return (b - a).days

    def form(team):
        h = hist[team]
        if not h:
            return 1.0, 0.0, 1.0, 1.0  # ppg, gd, gf, ga neutral priors
        n = len(h)
        ppg = sum(x[0] for x in h) / n
        gf = sum(x[1] for x in h) / n
        ga = sum(x[2] for x in h) / n
        return ppg, (gf - ga), gf, ga

    out = []
    base_ll = defaultdict(lambda: [0.0, 0.0, 0, 0])  # split -> [ll, brier, n, correct]
    for date, home, away, hg, ag, tour, neutral in rows:
        rh, ra = rating[home], rating[away]
        eff_h = rh + (0.0 if neutral else HOME_BUMP)
        eff_a = ra
        cat = category(tour)
        hf_ppg, hf_gd, hf_gf, hf_ga = form(home)
        af_ppg, af_gd, af_gf, af_ga = form(away)
        h_rest = days(last_date[home], date) if home in last_date else 30
        a_rest = days(last_date[away], date) if away in last_date else 30
        y = 0 if hg > ag else (1 if hg == ag else 2)
        sp = split_of(date, tour)

        feat = {
            "date": date, "tournament": tour, "split": sp, "y": y,
            "rating_diff": eff_h - eff_a, "abs_rating_diff": abs(eff_h - eff_a),
            "raw_rating_diff": rh - ra, "neutral": int(neutral), "imp": IMP[cat],
            "home_ppg": hf_ppg, "away_ppg": af_ppg, "ppg_diff": hf_ppg - af_ppg,
            "home_gd": hf_gd, "away_gd": af_gd, "gd_diff": hf_gd - af_gd,
            "home_gf": hf_gf, "home_ga": hf_ga, "away_gf": af_gf, "away_ga": af_ga,
            "home_rest": min(h_rest, 365), "away_rest": min(a_rest, 365),
            "rest_diff": min(h_rest, 365) - min(a_rest, 365),
            "home_played": played[home], "away_played": played[away],
        }
        for c in CATS:
            feat[f"cat_{c}"] = int(cat == c)
        out.append(feat)

        # Elo-Davidson baseline scoring on scored splits
        if sp in ("wc2022", "test_general", "wc2026"):
            ph, pd, pa = davidson(eff_h, eff_a)
            p = [ph, pd, pa][y]
            base_ll[sp][0] += -math.log(max(p, 1e-15))
            for k, pk in enumerate((ph, pd, pa)):
                base_ll[sp][1] += (pk - (1 if k == y else 0)) ** 2
            base_ll[sp][2] += 1
            pred = max(range(3), key=lambda k: (ph, pd, pa)[k])
            base_ll[sp][3] += int(pred == y)

        # update ratings + rolling history AFTER recording features
        we = win_prob(eff_h, eff_a)
        w = 1.0 if hg > ag else (0.5 if hg == ag else 0.0)
        delta = K * goal_mult(hg - ag) * (w - we)
        rating[home] = rh + delta
        rating[away] = ra - delta
        hp = 3 if hg > ag else (1 if hg == ag else 0)
        ap = 3 if ag > hg else (1 if hg == ag else 0)
        hist[home].append((hp, hg, ag))
        hist[away].append((ap, ag, hg))
        last_date[home] = date
        last_date[away] = date
        played[home] += 1
        played[away] += 1

    cols = list(out[0].keys())
    with open(CSV_OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(out)

    from collections import Counter
    counts = Counter(r["split"] for r in out)
    print(f"wrote {CSV_OUT}  rows={len(out)}  cols={len(cols)}")
    print("split sizes:", dict(counts))
    print("\nELO-DAVIDSON BASELINE (shipped model, scale=300) — the bar to beat:")
    for sp in ("test_general", "wc2022", "wc2026"):
        ll, br, n, corr = base_ll[sp]
        if n:
            print(f"  {sp:13s} n={n:5d}  logloss={ll/n:.4f}  brier={br/n:.4f}  acc={corr/n:.4f}")
    print("\n(uniform-1/3 logloss floor = ln3 = 1.0986; wc2022 ~1.0666 confirms the roll matches the TS backtest)")

if __name__ == "__main__":
    main()
