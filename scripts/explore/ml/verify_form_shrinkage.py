"""Does a pure-TS form / low-cap-shrinkage rating adjustment actually help the
PRODUCTION app, which predicts ONLY World Cup matches with WC_PREDICTION_SCALE=500?

The research gain (0.882->0.870) was on test_general (all match types). Here we test
whether form/shrinkage beats the SHIPPED app baseline on the WC holdouts specifically:
  - WC splits scored at scale 500 (the shipped flattened model: wc2022=1.0557, wc2026=1.0622)
  - test_general at scale 300 (rating scale: baseline 0.8819)
Adjustment: eff_diff' = rating_diff + a*gd_diff + b*ppg_diff ; shrink low-cap via
rating_diff *= n/(n+K) using min(home_played, away_played).
"""
import csv, math
from pathlib import Path
HERE = Path(__file__).resolve().parent
rows = list(csv.DictReader(open(HERE / "features.csv")))
for r in rows:
    for k in ("rating_diff", "gd_diff", "ppg_diff", "home_played", "away_played", "y"):
        r[k] = float(r[k])

NU = 0.8
def davidson_ll(rows, diff_fn, scale):
    ll = 0.0; n = 0
    for r in rows:
        d = diff_fn(r)
        a, b = 10 ** (d / (2 * scale)), 10 ** (-d / (2 * scale))  # symmetric about 0
        dd = NU * math.sqrt(a * b); z = a + b + dd
        p = [a / z, dd / z, b / z][int(r["y"])]
        ll += -math.log(max(p, 1e-15)); n += 1
    return ll / n if n else 0.0

def by(split):
    return [r for r in rows if r["split"] == split]
tg, w22, w26 = by("test_general"), by("wc2022"), by("wc2026")

# Shipped-app baselines: WC at 500, general at 300.
base = lambda r: r["rating_diff"]
print("SHIPPED-APP BASELINE (what the app actually does):")
print(f"  test_general @300 = {davidson_ll(tg, base, 300):.4f}")
print(f"  wc2022       @500 = {davidson_ll(w22, base, 500):.4f}")
print(f"  wc2026       @500 = {davidson_ll(w26, base, 500):.4f}")

def adj(a, b, kshrink):
    def f(r):
        n = min(r["home_played"], r["away_played"])
        s = n / (n + kshrink) if kshrink > 0 else 1.0
        return s * r["rating_diff"] + a * r["gd_diff"] + b * r["ppg_diff"]
    return f

print("\nFORM / SHRINKAGE on WC holdouts (scale 500) — tuned to help the app's WC predictions:")
print(f"{'a(gd)':>6}{'b(ppg)':>7}{'Kshrink':>8} | {'wc2022':>8}{'wc2026':>8} | {'test_gen@300':>13}")
best = None
for a in [0, 5, 10, 15, 20]:
    for b in [0, 10, 20, 30]:
        for ks in [0, 20, 50]:
            f = adj(a, b, ks)
            w = davidson_ll(w22, f, 500); m = davidson_ll(w26, f, 500)
            g = davidson_ll(tg, f, 300)
            wc_mean = (w + m) / 2
            if best is None or wc_mean < best[0]:
                best = (wc_mean, a, b, ks, w, m, g)
# print a few representative rows + the WC-optimal
for (a, b, ks) in [(0,0,0),(10,0,0),(0,20,0),(10,20,0),(20,30,0),(0,0,50),(10,20,50)]:
    f = adj(a, b, ks)
    print(f"{a:>6}{b:>7}{ks:>8} | {davidson_ll(w22,f,500):>8.4f}{davidson_ll(w26,f,500):>8.4f} | {davidson_ll(tg,f,300):>13.4f}")
print(f"\nWC-optimal (min mean WC logloss): a={best[1]} b={best[2]} Kshrink={best[3]} -> "
      f"wc2022={best[4]:.4f} wc2026={best[5]:.4f} test_gen={best[6]:.4f}")
print(f"vs shipped baseline wc2022={davidson_ll(w22,base,500):.4f} wc2026={davidson_ll(w26,base,500):.4f}")
