"""
Experiment: hist-gbm
Model: HistGradientBoostingClassifier (sklearn), probability-calibrated
"""

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.inspection import permutation_importance
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import log_loss, brier_score_loss, accuracy_score

# ── Load data ────────────────────────────────────────────────────────────────
df = pd.read_csv(str(Path(__file__).resolve().parent / "features.csv"))

FEATURES = [
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

X_train = train[FEATURES].values
y_train = train["y"].values

print(f"Train size: {len(X_train)}")
print(f"test_general size: {len(test_general)}")
print(f"wc2022 size: {len(wc2022)}")
print(f"wc2026 size: {len(wc2026)}")

# ── Base model ────────────────────────────────────────────────────────────────
base = HistGradientBoostingClassifier(
    max_iter=400,
    learning_rate=0.05,
    max_depth=4,
    min_samples_leaf=20,
    l2_regularization=0.1,
    random_state=42,
)

# ── Calibrated model (isotonic, 5-fold internal CV on train) ─────────────────
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
calibrated = CalibratedClassifierCV(base, cv=cv, method="isotonic")
calibrated.fit(X_train, y_train)

# ── Also fit uncalibrated base for comparison ─────────────────────────────────
base_uncal = HistGradientBoostingClassifier(
    max_iter=400,
    learning_rate=0.05,
    max_depth=4,
    min_samples_leaf=20,
    l2_regularization=0.1,
    random_state=42,
)
base_uncal.fit(X_train, y_train)

# ── Evaluation helper ─────────────────────────────────────────────────────────
def multiclass_brier(y_true, proba, n_classes=3):
    """Sum of per-class Brier scores (matches harness: sum (p-y)^2 over 3 outcomes, averaged over matches)."""
    from sklearn.preprocessing import label_binarize
    y_bin = label_binarize(y_true, classes=list(range(n_classes)))
    # sum over classes, mean over matches — same as harness brier computation
    return np.mean(np.sum((proba - y_bin) ** 2, axis=1))

def evaluate(model, X, y, label):
    proba = model.predict_proba(X)
    proba = np.clip(proba, 1e-15, 1.0)
    ll = log_loss(y, proba, labels=[0, 1, 2])
    br = multiclass_brier(y, proba)
    acc = accuracy_score(y, np.argmax(proba, axis=1))
    print(f"{label:20s}  logloss={ll:.4f}  brier={br:.4f}  acc={acc:.4f}")
    return ll, br, acc

print("\n=== Uncalibrated ===")
evaluate(base_uncal, X_train, y_train, "train (uncal)")
r_tg_unc  = evaluate(base_uncal, test_general[FEATURES].values, test_general["y"].values, "test_general (uncal)")
r_22_unc  = evaluate(base_uncal, wc2022[FEATURES].values, wc2022["y"].values, "wc2022 (uncal)")
r_26_unc  = evaluate(base_uncal, wc2026[FEATURES].values, wc2026["y"].values, "wc2026 (uncal)")

print("\n=== Calibrated (isotonic, 5-fold) ===")
evaluate(calibrated, X_train, y_train, "train (cal)")
r_tg  = evaluate(calibrated, test_general[FEATURES].values, test_general["y"].values, "test_general (cal)")
r_22  = evaluate(calibrated, wc2022[FEATURES].values, wc2022["y"].values, "wc2022 (cal)")
r_26  = evaluate(calibrated, wc2026[FEATURES].values, wc2026["y"].values, "wc2026 (cal)")

# ── Permutation importance on a held-out portion of train ────────────────────
# Use a fixed 20% of train for perm importance (no leakage — still from train)
rng = np.random.default_rng(42)
idx = rng.choice(len(X_train), size=int(0.2 * len(X_train)), replace=False)
X_perm = X_train[idx]
y_perm = y_train[idx]

print("\n=== Permutation Importance (on 20% train holdout, calibrated model) ===")
perm = permutation_importance(
    calibrated, X_perm, y_perm,
    scoring="neg_log_loss",
    n_repeats=10,
    random_state=42,
    n_jobs=-1,
)
importances = perm.importances_mean
feat_imp = sorted(zip(FEATURES, importances), key=lambda x: -x[1])
for feat, imp in feat_imp[:15]:
    print(f"  {feat:30s}  {imp:+.5f}")

print("\n=== Summary ===")
print(f"test_general: logloss={r_tg[0]:.4f}  brier={r_tg[1]:.4f}  acc={r_tg[2]:.4f}")
print(f"wc2022:       logloss={r_22[0]:.4f}  brier={r_22[1]:.4f}  acc={r_22[2]:.4f}")
print(f"wc2026:       logloss={r_26[0]:.4f}  brier={r_26[1]:.4f}  acc={r_26[2]:.4f}")

print("\nDone.")
