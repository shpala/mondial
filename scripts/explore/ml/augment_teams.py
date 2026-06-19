"""features_teams.csv = features.csv + home_team/away_team columns (for entity-embedding
NNs). Re-parses the corpus with the SAME parse+stable-sort as build_features.py so row
order matches exactly, then zips the team names onto the feature rows. Does not touch
features.csv or re-roll Elo."""
import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def corpus_rows():
    rows = []
    with open(ROOT / "data" / "intl_results.csv") as f:
        for i, line in enumerate(f):
            if i == 0:
                continue
            p = line.rstrip("\n").split(",")
            if len(p) != 9:
                continue
            try:
                int(p[3]); int(p[4])
            except ValueError:
                continue
            rows.append(p)
    rows.sort(key=lambda r: r[0])  # stable, same as build_features
    return rows

corp = corpus_rows()
with open(HERE / "features.csv") as f:
    feats = list(csv.DictReader(f))

assert len(corp) == len(feats), f"row mismatch {len(corp)} vs {len(feats)}"
for fr, cr in zip(feats, corp):
    assert fr["date"] == cr[0], f"order mismatch {fr['date']} {cr[0]}"
    fr["home_team"] = cr[1]
    fr["away_team"] = cr[2]

cols = ["home_team", "away_team"] + list(feats[0].keys())[:-2] if False else None
out_cols = list(feats[0].keys())
with open(HERE / "features_teams.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=out_cols)
    w.writeheader()
    w.writerows(feats)
print(f"wrote features_teams.csv rows={len(feats)} cols={len(out_cols)} (added home_team, away_team)")
print("teams:", len({fr['home_team'] for fr in feats} | {fr['away_team'] for fr in feats}))
