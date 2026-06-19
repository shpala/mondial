"""Validate the market-odds blend on real odds+results data (football-data.co.uk,
top-5 leagues). No WC odds are freely available historically, but this de-risks the
exact methodology the WC integration would use: de-vig, market calibration, and the
optimal model<->market blend weight.

Model = a calibrated rating model (multinomial logistic on rolled-Elo rating_diff,
fit on the train period) — a fair stand-in for the app's Elo-Davidson.
Market = no-vig Pinnacle closing odds (sharpest), proportional de-vig.
Compares log-loss of model / market / linear-blend(lambda) / log-pool on a held-out
time split.
"""
import urllib.request, csv, io, math
from collections import defaultdict
import numpy as np
from sklearn.linear_model import LogisticRegression

LEAGUES = ["E0", "SP1", "D1", "I1", "F1"]
SEASONS = ["2021", "2122", "2223", "2324", "2425"]  # fd.co.uk codes (2021=20/21)
INIT, K = 1500.0, 20.0  # club Elo

def fetch(season, div):
    url = f"https://www.football-data.co.uk/mmz4281/{season}/{div}.csv"
    try:
        raw = urllib.request.urlopen(url, timeout=30).read().decode("latin-1")
    except Exception:
        return []
    out = []
    for r in csv.DictReader(io.StringIO(raw)):
        try:
            d = r["Date"]
            # dd/mm/yy or dd/mm/yyyy -> iso
            p = d.split("/")
            yy = p[2] if len(p[2]) == 4 else ("20" + p[2])
            iso = f"{yy}-{int(p[1]):02d}-{int(p[0]):02d}"
            hg, ag = int(r["FTHG"]), int(r["FTAG"])
        except Exception:
            continue
        # prefer Pinnacle closing (PSC), then market avg (Avg), then Bet365 (B365)
        odds = None
        for pre in ("PSC", "Avg", "B365"):
            try:
                h, dr, a = float(r[pre + "H"]), float(r[pre + "D"]), float(r[pre + "A"])
                if h > 1 and dr > 1 and a > 1:
                    odds = (h, dr, a); break
            except Exception:
                continue
        if odds is None:
            continue
        out.append((iso, div, r["HomeTeam"], r["AwayTeam"], hg, ag, odds))
    return out

rows = []
for s in SEASONS:
    for lg in LEAGUES:
        rows += fetch(s, lg)
rows.sort(key=lambda r: r[0])
print(f"matches with odds: {len(rows)}  (leagues {LEAGUES}, seasons {SEASONS})")

# Roll a per-team Elo with home advantage embedded in the expectation.
rating = defaultdict(lambda: INIT)
HOME_ELO = 60.0  # club home advantage in Elo pts (added to home expectation)
def we(ra, rb):
    return 1.0 / (1.0 + 10 ** ((rb - ra) / 400.0))
data = []  # rating_diff, outcome(0/1/2 H/D/A), market no-vig probs, iso
for iso, div, h, a, hg, ag, odds in rows:
    key_h, key_a = (div, h), (div, a)
    rh, ra = rating[key_h], rating[key_a]
    rd = (rh + HOME_ELO) - ra
    y = 0 if hg > ag else (1 if hg == ag else 2)
    inv = np.array([1.0 / odds[0], 1.0 / odds[1], 1.0 / odds[2]])
    mkt = inv / inv.sum()  # proportional de-vig
    data.append((rd, y, mkt, iso))
    # update
    w = 1.0 if hg > ag else (0.5 if hg == ag else 0.0)
    g = abs(hg - ag); mult = 1.0 if g <= 1 else 1.5 if g == 2 else (11 + g) / 8
    delta = K * mult * (w - we(rh + HOME_ELO, ra))
    rating[key_h] = rh + delta
    rating[key_a] = ra - delta

# time split: first 70% train (fit the model calibration), last 30% test
data.sort(key=lambda d: d[3])
cut = int(len(data) * 0.70)
train, test = data[:cut], data[cut:]
Xtr = np.array([[d[0]] for d in train]); ytr = np.array([d[1] for d in train])
clf = LogisticRegression(C=1.0, max_iter=1000).fit(Xtr, ytr)

def ll(probs, ys):
    return float(np.mean([-math.log(max(probs[i][ys[i]], 1e-15)) for i in range(len(ys))]))

yte = np.array([d[1] for d in test])
model_p = clf.predict_proba(np.array([[d[0]] for d in test]))
market_p = np.array([d[2] for d in test])
base_rate = np.bincount(ytr, minlength=3) / len(ytr)

print(f"\nTest matches: {len(test)}   (H/D/A base rate {base_rate.round(3)})")
print(f"  no-skill (base rate)  logloss = {ll(np.tile(base_rate,(len(test),1)), yte):.4f}")
print(f"  MODEL  (Elo logistic) logloss = {ll(model_p, yte):.4f}")
print(f"  MARKET (no-vig Pinn.) logloss = {ll(market_p, yte):.4f}")

print("\nLINEAR blend  (1-l)*model + l*market:")
best = None
for l in [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0]:
    bp = (1 - l) * model_p + l * market_p
    v = ll(bp, yte)
    print(f"  lambda={l:.1f}  logloss={v:.4f}")
    if best is None or v < best[1]:
        best = (l, v)
print(f"  -> best linear lambda={best[0]:.1f} logloss={best[1]:.4f}")

# log-opinion pool: p ∝ model^(1-w) * market^w
print("\nLOG-POOL  p ∝ model^(1-w) * market^w:")
bestlp = None
for w in [0,0.2,0.4,0.5,0.6,0.7,0.8,0.9,1.0]:
    lp = (model_p ** (1 - w)) * (market_p ** w)
    lp = lp / lp.sum(axis=1, keepdims=True)
    v = ll(lp, yte)
    print(f"  w={w:.1f}  logloss={v:.4f}")
    if bestlp is None or v < bestlp[1]:
        bestlp = (w, v)
print(f"  -> best log-pool w={bestlp[0]:.1f} logloss={bestlp[1]:.4f}")
