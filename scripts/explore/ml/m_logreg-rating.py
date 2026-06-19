"""
Experiment: logreg-rating
Multinomial logistic regression on rating_diff only.
Sanity check: does it roughly reproduce the Elo curve?
"""
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import log_loss, brier_score_loss, accuracy_score

CSV = "/home/shpala/dev/mondial/scripts/explore/ml/features.csv"
FEATURES = ["rating_diff"]  # optionally add abs_rating_diff
SEED = 42

df = pd.read_csv(CSV)
print(f"Loaded {len(df)} rows, columns: {list(df.columns)}")
print(df["split"].value_counts())

train = df[df["split"] == "train"].copy()
test_general = df[df["split"] == "test_general"].copy()
wc2022 = df[df["split"] == "wc2022"].copy()
wc2026 = df[df["split"] == "wc2026"].copy()

X_train = train[FEATURES].values
y_train = train["y"].values

# Fit scaler on train only
scaler = StandardScaler()
X_train_sc = scaler.fit_transform(X_train)

# Multinomial logistic regression (sklearn>=1.7 removed multi_class param; lbfgs is multinomial by default)
clf = LogisticRegression(solver="lbfgs", max_iter=1000,
                          C=1.0, random_state=SEED)
clf.fit(X_train_sc, y_train)

print(f"\nClasses: {clf.classes_}")
print(f"Coefficients: {clf.coef_}")
print(f"Intercept: {clf.intercept_}")


def evaluate(name, X, y):
    X_sc = scaler.transform(X)
    proba = clf.predict_proba(X_sc)
    proba = np.clip(proba, 1e-15, 1.0)
    labels = sorted(np.unique(y).tolist())
    ll = log_loss(y, proba, labels=[0, 1, 2])
    # Brier: mean over classes
    y_bin = np.zeros((len(y), 3))
    for i, yi in enumerate(y):
        y_bin[i, yi] = 1.0
    brier = np.mean(np.sum((proba - y_bin) ** 2, axis=1))
    preds = clf.predict(X_sc)
    acc = accuracy_score(y, preds)
    print(f"{name}: logloss={ll:.4f}  brier={brier:.4f}  acc={acc:.4f}")
    return ll, brier, acc


print("\n--- Results ---")
r_train = evaluate("train", X_train, y_train)
r_test = evaluate("test_general", test_general[FEATURES].values, test_general["y"].values)
r_wc2022 = evaluate("wc2022", wc2022[FEATURES].values, wc2022["y"].values)
r_wc2026 = evaluate("wc2026", wc2026[FEATURES].values, wc2026["y"].values)

print("\n--- Probability calibration sanity ---")
# Check predicted probabilities at various rating_diffs
X_sc = scaler.transform(X_train)
proba_train = clf.predict_proba(X_sc)
print(f"Train mean proba: home={proba_train[:,0].mean():.4f}, draw={proba_train[:,1].mean():.4f}, away={proba_train[:,2].mean():.4f}")

# Show predicted probs at a range of rating diffs
print("\nrating_diff -> P(home), P(draw), P(away):")
for rd in [-300, -200, -100, -50, 0, 50, 100, 200, 300]:
    x = scaler.transform([[rd]])
    p = clf.predict_proba(x)[0]
    print(f"  {rd:+4d}: {p[0]:.3f}, {p[1]:.3f}, {p[2]:.3f}")

print("\n--- Summary JSON ---")
import json
summary = {
    "model": "LogisticRegression(multinomial, C=1.0)",
    "features": FEATURES,
    "test_general": {"logloss": r_test[0], "brier": r_test[1], "acc": r_test[2]},
    "wc2022": {"logloss": r_wc2022[0], "brier": r_wc2022[1], "acc": r_wc2022[2]},
    "wc2026": {"logloss": r_wc2026[0], "brier": r_wc2026[1], "acc": r_wc2026[2]},
}
print(json.dumps(summary, indent=2))
