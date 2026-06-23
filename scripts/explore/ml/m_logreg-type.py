"""
Experiment: logreg-type
Logistic Regression with rating features + match-type (cat_*) one-hots.
Answers: does match type help over rating alone?
"""

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import log_loss, brier_score_loss, accuracy_score

CSV = str(Path(__file__).resolve().parent / "features.csv")

df = pd.read_csv(CSV)

FEATURE_COLS_TYPE = [
    "rating_diff", "abs_rating_diff", "neutral", "imp",
    "cat_friendly", "cat_qualifier", "cat_nations_league",
    "cat_continental_finals", "cat_confederations", "cat_wc_finals", "cat_other",
]

FEATURE_COLS_RATING = [
    "rating_diff", "abs_rating_diff",
]

train = df[df["split"] == "train"].copy()
test_general = df[df["split"] == "test_general"].copy()
wc2022 = df[df["split"] == "wc2022"].copy()
wc2026 = df[df["split"] == "wc2026"].copy()

print(f"Train: {len(train)}, test_general: {len(test_general)}, wc2022: {len(wc2022)}, wc2026: {len(wc2026)}")


def evaluate(name, model, scaler, feature_cols, splits):
    results = {}
    for split_name, split_df in splits.items():
        X = split_df[feature_cols].values
        if scaler is not None:
            X = scaler.transform(X)
        y = split_df["y"].values
        proba = model.predict_proba(X)
        proba = np.clip(proba, 1e-15, 1.0)
        ll = log_loss(y, proba, labels=[0, 1, 2])
        # Brier: multiclass brier = mean over samples of sum over classes of (p - indicator)^2
        n_classes = 3
        y_onehot = np.eye(n_classes)[y]
        brier = np.mean(np.sum((proba - y_onehot) ** 2, axis=1))
        preds = np.argmax(proba, axis=1)
        acc = accuracy_score(y, preds)
        results[split_name] = {"logloss": ll, "brier": brier, "acc": acc}
        print(f"  {split_name:15s}  logloss={ll:.4f}  brier={brier:.4f}  acc={acc:.4f}")
    return results


# ---- Model 1: rating-only ----
print("\n=== Model 1: rating-only logistic regression ===")
X_train_r = train[FEATURE_COLS_RATING].values
y_train = train["y"].values

scaler_r = StandardScaler()
X_train_r_sc = scaler_r.fit_transform(X_train_r)

lr_rating = LogisticRegression(solver="lbfgs", max_iter=1000, C=1.0, random_state=42)
lr_rating.fit(X_train_r_sc, y_train)

splits = {
    "test_general": test_general,
    "wc2022": wc2022,
    "wc2026": wc2026,
}
results_rating = evaluate("rating-only", lr_rating, scaler_r, FEATURE_COLS_RATING, splits)

# ---- Model 2: rating + match-type ----
print("\n=== Model 2: rating + match-type logistic regression ===")
X_train_t = train[FEATURE_COLS_TYPE].values

scaler_t = StandardScaler()
X_train_t_sc = scaler_t.fit_transform(X_train_t)

lr_type = LogisticRegression(solver="lbfgs", max_iter=1000, C=1.0, random_state=42)
lr_type.fit(X_train_t_sc, y_train)

results_type = evaluate("rating+type", lr_type, scaler_t, FEATURE_COLS_TYPE, splits)

# ---- Feature importances (coefficients) ----
print("\n=== Coefficients (rating+type model) ===")
classes = ["home_win", "draw", "away_win"]
for i, cls in enumerate(classes):
    coefs = list(zip(FEATURE_COLS_TYPE, lr_type.coef_[i]))
    coefs_sorted = sorted(coefs, key=lambda x: abs(x[1]), reverse=True)
    print(f"\n  Class: {cls}")
    for feat, coef in coefs_sorted[:6]:
        print(f"    {feat:30s}  {coef:+.4f}")

# Summary comparison
print("\n=== Summary comparison ===")
print(f"{'Split':15s} {'rating-only logloss':>20} {'rating+type logloss':>20} {'delta':>8}")
for split_name in ["test_general", "wc2022", "wc2026"]:
    r = results_rating[split_name]["logloss"]
    t = results_type[split_name]["logloss"]
    delta = t - r
    print(f"{split_name:15s} {r:>20.4f} {t:>20.4f} {delta:>+8.4f}")

# Final numbers for structured output
print("\n=== FINAL NUMBERS (logreg-type) ===")
for split_name in ["test_general", "wc2022", "wc2026"]:
    m = results_type[split_name]
    print(f"{split_name}: logloss={m['logloss']:.4f} brier={m['brier']:.4f} acc={m['acc']:.4f}")
