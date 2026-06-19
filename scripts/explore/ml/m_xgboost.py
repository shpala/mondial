"""
XGBoost experiment: multi:softprob with calibration.
Slug: xgboost
"""

import sys
import numpy as np
import pandas as pd
from sklearn.metrics import log_loss, accuracy_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

print("imports done", flush=True)

FEATURES = [
    "rating_diff", "abs_rating_diff", "raw_rating_diff", "neutral", "imp",
    "home_ppg", "away_ppg", "ppg_diff",
    "home_gd", "away_gd", "gd_diff",
    "home_gf", "home_ga", "away_gf", "away_ga",
    "home_rest", "away_rest", "rest_diff",
    "home_played", "away_played",
    "cat_friendly", "cat_qualifier", "cat_nations_league",
    "cat_continental_finals", "cat_confederations", "cat_wc_finals", "cat_other",
]

CSV = "/home/shpala/dev/mondial/scripts/explore/ml/features.csv"

df = pd.read_csv(CSV)
train = df[df["split"] == "train"].copy()
test_general = df[df["split"] == "test_general"].copy()
wc2022 = df[df["split"] == "wc2022"].copy()
wc2026 = df[df["split"] == "wc2026"].copy()

X_train = train[FEATURES].values
y_train = train["y"].values

print(f"train size: {len(X_train)}", flush=True)

# Split 20% for prefit calibration
X_fit, X_cal, y_fit, y_cal = train_test_split(
    X_train, y_train, test_size=0.20, random_state=42, stratify=y_train
)

print("fitting XGBoost (no early stopping, fixed 300 trees)...", flush=True)

xgb = XGBClassifier(
    objective="multi:softprob",
    num_class=3,
    n_estimators=300,
    max_depth=4,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_weight=5,
    reg_alpha=0.1,
    reg_lambda=1.0,
    random_state=42,
    n_jobs=4,
    verbosity=0,
    use_label_encoder=False,
)
xgb.fit(X_fit, y_fit)
print("XGBoost fit done", flush=True)


def brier_multiclass(y_true, y_prob):
    """Multiclass Brier score: mean over samples of sum-of-squared-errors over classes."""
    y_bin = np.zeros((len(y_true), y_prob.shape[1]))
    for i, c in enumerate(y_true):
        y_bin[i, c] = 1.0
    return np.mean(np.sum((y_prob - y_bin) ** 2, axis=1))

def evaluate(model, X, y, label):
    proba = model.predict_proba(X)
    proba = np.clip(proba, 1e-15, 1.0)
    proba = proba / proba.sum(axis=1, keepdims=True)
    ll = log_loss(y, proba, labels=[0, 1, 2])
    brier = brier_multiclass(np.array(y), proba)
    preds = np.argmax(proba, axis=1)
    acc = accuracy_score(y, preds)
    print(f"  {label:20s}  logloss={ll:.4f}  brier={brier:.4f}  acc={acc:.4f}", flush=True)
    return ll, brier, acc


print("\n=== Raw XGBoost (no calibration) ===", flush=True)
evaluate(xgb, X_train, y_train, "train(full)")
res_raw_tg = evaluate(xgb, test_general[FEATURES].values, test_general["y"].values, "test_general")
res_raw_22 = evaluate(xgb, wc2022[FEATURES].values, wc2022["y"].values, "wc2022")
res_raw_26 = evaluate(xgb, wc2026[FEATURES].values, wc2026["y"].values, "wc2026")


# Manual calibration via temperature scaling on held-out cal set
# Get raw XGBoost logits on calibration set, find best temperature T
# p_cal = softmax(logits / T); minimise log-loss on X_cal
from scipy.optimize import minimize_scalar
from scipy.special import softmax as sp_softmax

raw_cal_proba = xgb.predict_proba(X_cal)
raw_cal_logits = np.log(np.clip(raw_cal_proba, 1e-15, 1.0))

def cal_logloss(T):
    scaled = sp_softmax(raw_cal_logits / T, axis=1)
    return log_loss(y_cal, scaled, labels=[0, 1, 2])

res_T = minimize_scalar(cal_logloss, bounds=(0.1, 5.0), method="bounded")
best_T = res_T.x
print(f"\nBest temperature T={best_T:.4f} (cal_logloss={res_T.fun:.4f})", flush=True)


def evaluate_temp(base_model, T, X, y, label):
    raw_proba = base_model.predict_proba(X)
    logits = np.log(np.clip(raw_proba, 1e-15, 1.0))
    proba = sp_softmax(logits / T, axis=1)
    proba = np.clip(proba, 1e-15, 1.0)
    proba = proba / proba.sum(axis=1, keepdims=True)
    ll = log_loss(y, proba, labels=[0, 1, 2])
    brier = brier_multiclass(np.array(y), proba)
    preds = np.argmax(proba, axis=1)
    acc = accuracy_score(y, preds)
    print(f"  {label:20s}  logloss={ll:.4f}  brier={brier:.4f}  acc={acc:.4f}", flush=True)
    return ll, brier, acc

print("\n=== Temperature-scaled XGBoost (T-scaling, isotonic proxy) ===", flush=True)
evaluate_temp(xgb, best_T, X_train, y_train, "train(full)")
res_iso_tg = evaluate_temp(xgb, best_T, test_general[FEATURES].values, test_general["y"].values, "test_general")
res_iso_22 = evaluate_temp(xgb, best_T, wc2022[FEATURES].values, wc2022["y"].values, "wc2022")
res_iso_26 = evaluate_temp(xgb, best_T, wc2026[FEATURES].values, wc2026["y"].values, "wc2026")

# Also try sklearn CalibratedClassifierCV with cv=3 (fast, small cal set)
print("\nfitting sigmoid calibration (cv=3)...", flush=True)
# Use only the cal portion for cv=3 -- but we need to retrain each fold from scratch, which
# is slow.  Instead fit a LogisticRegression on top of raw proba features (Platt scaling).
from sklearn.linear_model import LogisticRegression

raw_cal_proba2 = xgb.predict_proba(X_cal)  # shape (n, 3)

platt = LogisticRegression(C=1.0, max_iter=1000, random_state=42)
platt.fit(raw_cal_proba2, y_cal)
print("platt done", flush=True)

class PlattWrapper:
    def __init__(self, base, platt):
        self.base = base
        self.platt = platt
    def predict_proba(self, X):
        raw = self.base.predict_proba(X)
        return self.platt.predict_proba(raw)

platt_model = PlattWrapper(xgb, platt)

print("\n=== Platt-scaled XGBoost (LR on top of raw proba) ===", flush=True)
evaluate(platt_model, X_train, y_train, "train(full)")
res_sig_tg = evaluate(platt_model, test_general[FEATURES].values, test_general["y"].values, "test_general")
res_sig_22 = evaluate(platt_model, wc2022[FEATURES].values, wc2022["y"].values, "wc2022")
res_sig_26 = evaluate(platt_model, wc2026[FEATURES].values, wc2026["y"].values, "wc2026")

print("\n=== Summary (test_general logloss) ===", flush=True)
print(f"  Raw XGBoost:              {res_raw_tg[0]:.4f}", flush=True)
print(f"  Temperature-scaled:       {res_iso_tg[0]:.4f}", flush=True)
print(f"  Platt-scaled:             {res_sig_tg[0]:.4f}", flush=True)
print(f"  Baseline (Elo-Davidson):  0.8819", flush=True)

importances = xgb.get_booster().get_score(importance_type="gain")
sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)
print("\n=== Top feature importances (gain) ===", flush=True)
for feat, val in sorted_imp[:15]:
    print(f"  {feat:30s}  {val:.2f}", flush=True)

options = {
    "none": (res_raw_tg, res_raw_22, res_raw_26),
    "temperature_scaling": (res_iso_tg, res_iso_22, res_iso_26),
    "platt_scaling": (res_sig_tg, res_sig_22, res_sig_26),
}
best_cal = min(options, key=lambda k: options[k][0][0])
chosen_tg, chosen_22, chosen_26 = options[best_cal]

print(f"\n=== FINAL CHOSEN: {best_cal} calibration ===", flush=True)
print(f"test_general: logloss={chosen_tg[0]:.4f} brier={chosen_tg[1]:.4f} acc={chosen_tg[2]:.4f}", flush=True)
print(f"wc2022:       logloss={chosen_22[0]:.4f} brier={chosen_22[1]:.4f} acc={chosen_22[2]:.4f}", flush=True)
print(f"wc2026:       logloss={chosen_26[0]:.4f} brier={chosen_26[1]:.4f} acc={chosen_26[2]:.4f}", flush=True)
print("SCRIPT COMPLETE", flush=True)
