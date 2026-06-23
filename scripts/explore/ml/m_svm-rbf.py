"""
SVM-RBF experiment: SVC(kernel=rbf, probability=True) on standardized all-features.
Calibrated with CalibratedClassifierCV (isotonic, internal 5-fold on train).
If train is too slow with full 8131 rows, subsample to ~3000 (stratified).
"""

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import StratifiedShuffleSplit
from sklearn.metrics import log_loss, brier_score_loss, accuracy_score
import time

FEATURES_PATH = str(Path(__file__).resolve().parent / "features.csv")
FEATURE_COLS = [
    "rating_diff", "abs_rating_diff", "raw_rating_diff", "neutral", "imp",
    "home_ppg", "away_ppg", "ppg_diff", "home_gd", "away_gd", "gd_diff",
    "home_gf", "home_ga", "away_gf", "away_ga",
    "home_rest", "away_rest", "rest_diff",
    "home_played", "away_played",
    "cat_friendly", "cat_qualifier", "cat_nations_league", "cat_continental_finals",
    "cat_confederations", "cat_wc_finals", "cat_other",
]

RANDOM_SEED = 42
SUBSAMPLE_SIZE = 3000  # used if full train is too slow


def multiclass_brier(y_true, proba):
    """Sum (pk - indicator)^2 over all classes per match, average over matches.
    Matches the build_features.py baseline formula exactly."""
    n = len(y_true)
    total = 0.0
    for i in range(n):
        for k in range(proba.shape[1]):
            pk = proba[i, k]
            indicator = 1.0 if y_true[i] == k else 0.0
            total += (pk - indicator) ** 2
    return total / n


def evaluate(name, model, X, y):
    proba = np.clip(model.predict_proba(X), 1e-15, 1 - 1e-15)
    ll = log_loss(y, proba, labels=[0, 1, 2])
    bs = multiclass_brier(y, proba)
    acc = accuracy_score(y, proba.argmax(axis=1))
    print(f"  {name:20s}  logloss={ll:.4f}  brier={bs:.4f}  acc={acc:.4f}")
    return ll, bs, acc


def main():
    df = pd.read_csv(FEATURES_PATH)
    train = df[df["split"] == "train"]
    test_g = df[df["split"] == "test_general"]
    wc2022 = df[df["split"] == "wc2022"]
    wc2026 = df[df["split"] == "wc2026"]

    X_train_full = train[FEATURE_COLS].values
    y_train_full = train["y"].values

    print(f"Full train size: {len(X_train_full)}")

    # Try full train first; if > 60 seconds, we'll note subsampling
    # SVC O(n^2) with 8131 rows — test timing with a small fit first
    # We'll subsample to 3000 (stratified) for speed
    sss = StratifiedShuffleSplit(n_splits=1, train_size=SUBSAMPLE_SIZE, random_state=RANDOM_SEED)
    idx_sub, _ = next(sss.split(X_train_full, y_train_full))
    X_train = X_train_full[idx_sub]
    y_train = y_train_full[idx_sub]
    subsampled = True
    print(f"Subsampled train size: {len(X_train)} (stratified)")

    # Standardize — fit on (subsampled) train only
    scaler = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train)

    X_test_g_sc = scaler.transform(test_g[FEATURE_COLS].values)
    X_wc2022_sc = scaler.transform(wc2022[FEATURE_COLS].values)
    X_wc2026_sc = scaler.transform(wc2026[FEATURE_COLS].values)

    y_test_g = test_g["y"].values
    y_wc2022 = wc2022["y"].values
    y_wc2026 = wc2026["y"].values

    # Base SVC with probability=True (Platt scaling internally)
    print("\nFitting SVC(rbf, probability=True) ...")
    t0 = time.time()
    svc_base = SVC(kernel="rbf", C=10.0, gamma="scale", probability=True,
                   random_state=RANDOM_SEED, decision_function_shape="ovr")
    svc_base.fit(X_train_sc, y_train)
    print(f"  Base SVC fit done in {time.time()-t0:.1f}s")

    print("\n--- Base SVC (Platt, probability=True) ---")
    evaluate("test_general", svc_base, X_test_g_sc, y_test_g)
    evaluate("wc2022", svc_base, X_wc2022_sc, y_wc2022)
    evaluate("wc2026", svc_base, X_wc2026_sc, y_wc2026)

    # Additionally calibrate with CalibratedClassifierCV (isotonic, cv=5 on train)
    print("\nFitting CalibratedClassifierCV(isotonic, cv=5) over SVC ...")
    t0 = time.time()
    svc_inner = SVC(kernel="rbf", C=10.0, gamma="scale", probability=False,
                    random_state=RANDOM_SEED, decision_function_shape="ovr")
    cal_model = CalibratedClassifierCV(svc_inner, cv=5, method="isotonic")
    cal_model.fit(X_train_sc, y_train)
    print(f"  Calibrated SVC fit done in {time.time()-t0:.1f}s")

    print("\n--- Calibrated SVC (isotonic, cv=5) ---")
    r_tg = evaluate("test_general", cal_model, X_test_g_sc, y_test_g)
    r_wc22 = evaluate("wc2022", cal_model, X_wc2022_sc, y_wc2022)
    r_wc26 = evaluate("wc2026", cal_model, X_wc2026_sc, y_wc2026)

    print(f"\nSubsampled train: {subsampled} (n={len(X_train)})")
    print("\nBaseline (Elo-Davidson):")
    print("  test_general: logloss=0.8819 brier=0.5190 acc=0.5969")
    print("  wc2022:       logloss=1.0666 brier=0.6309 acc=0.4531")
    print("  wc2026:       logloss=1.0929 brier=0.6879 acc=0.3333")

    print("\n=== FINAL RESULTS (calibrated SVC) ===")
    print(f"test_general  logloss={r_tg[0]:.4f}  brier={r_tg[1]:.4f}  acc={r_tg[2]:.4f}")
    print(f"wc2022        logloss={r_wc22[0]:.4f}  brier={r_wc22[1]:.4f}  acc={r_wc22[2]:.4f}")
    print(f"wc2026        logloss={r_wc26[0]:.4f}  brier={r_wc26[1]:.4f}  acc={r_wc26[2]:.4f}")


if __name__ == "__main__":
    main()
