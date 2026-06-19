"""
Logistic Regression with all numeric features.
Slug: logreg-full
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import log_loss, brier_score_loss, accuracy_score

# Load data
df = pd.read_csv("/home/shpala/dev/mondial/scripts/explore/ml/features.csv")

FEATURE_COLS = [
    "rating_diff", "abs_rating_diff", "raw_rating_diff", "neutral", "imp",
    "home_ppg", "away_ppg", "ppg_diff", "home_gd", "away_gd", "gd_diff",
    "home_gf", "home_ga", "away_gf", "away_ga",
    "home_rest", "away_rest", "rest_diff", "home_played", "away_played",
    "cat_friendly", "cat_qualifier", "cat_nations_league", "cat_continental_finals",
    "cat_confederations", "cat_wc_finals", "cat_other",
]

train = df[df["split"] == "train"]
test_general = df[df["split"] == "test_general"]
wc2022 = df[df["split"] == "wc2022"]
wc2026 = df[df["split"] == "wc2026"]

X_train = train[FEATURE_COLS].values
y_train = train["y"].values

# Fit scaler on train only
scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)

# Logistic Regression
model = LogisticRegression(
    solver="lbfgs",
    max_iter=1000,
    C=1.0,
    random_state=42,
)
model.fit(X_train_s, y_train)


def evaluate(name, X_raw, y_true):
    X_s = scaler.transform(X_raw)
    proba = model.predict_proba(X_s)
    proba = np.clip(proba, 1e-15, 1.0)
    preds = np.argmax(proba, axis=1)

    ll = log_loss(y_true, proba, labels=[0, 1, 2])

    # Brier score: average over classes
    y_bin = np.zeros((len(y_true), 3))
    for i, label in enumerate(y_true):
        y_bin[i, label] = 1.0
    brier = np.mean(np.sum((proba - y_bin) ** 2, axis=1))

    acc = accuracy_score(y_true, preds)
    print(f"{name}: logloss={ll:.4f} brier={brier:.4f} acc={acc:.4f}")
    return ll, brier, acc


print("=== logreg-full ===")
evaluate("train", X_train, y_train)
evaluate("test_general", test_general[FEATURE_COLS].values, test_general["y"].values)
evaluate("wc2022", wc2022[FEATURE_COLS].values, wc2022["y"].values)
evaluate("wc2026", wc2026[FEATURE_COLS].values, wc2026["y"].values)

# Feature importances (coefficients per class)
print("\n--- Feature importances (mean |coef| across classes) ---")
mean_abs_coef = np.mean(np.abs(model.coef_), axis=0)
importance_df = pd.DataFrame({
    "feature": FEATURE_COLS,
    "mean_abs_coef": mean_abs_coef,
}).sort_values("mean_abs_coef", ascending=False)
print(importance_df.to_string(index=False))
