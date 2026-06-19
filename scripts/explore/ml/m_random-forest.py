"""
Random Forest experiment (calibrated) for football match outcome prediction.
Fits on train split only, evaluates on test_general, wc2022, wc2026.
Applies probability calibration and reports feature importances.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import log_loss, brier_score_loss, accuracy_score

FEATURES = [
    "rating_diff", "abs_rating_diff", "raw_rating_diff", "neutral", "imp",
    "home_ppg", "away_ppg", "ppg_diff", "home_gd", "away_gd", "gd_diff",
    "home_gf", "home_ga", "away_gf", "away_ga",
    "home_rest", "away_rest", "rest_diff", "home_played", "away_played",
    "cat_friendly", "cat_qualifier", "cat_nations_league", "cat_continental_finals",
    "cat_confederations", "cat_wc_finals", "cat_other",
]

CSV_PATH = "/home/shpala/dev/mondial/scripts/explore/ml/features.csv"

def brier_multiclass(y_true, y_prob):
    """Multiclass Brier score (mean over classes)."""
    n_classes = y_prob.shape[1]
    total = 0.0
    for c in range(n_classes):
        indicator = (y_true == c).astype(float)
        total += np.mean((y_prob[:, c] - indicator) ** 2)
    return total / n_classes

def evaluate(name, y_true, y_prob):
    y_pred = np.argmax(y_prob, axis=1)
    ll = log_loss(y_true, np.clip(y_prob, 1e-15, 1 - 1e-15), labels=[0, 1, 2])
    bs = brier_multiclass(np.array(y_true), y_prob)
    acc = accuracy_score(y_true, y_pred)
    print(f"{name:20s}  logloss={ll:.4f}  brier={bs:.4f}  acc={acc:.4f}")
    return ll, bs, acc

def main():
    df = pd.read_csv(CSV_PATH)
    print(f"Total rows: {len(df)}")
    print(f"Split counts:\n{df['split'].value_counts()}\n")

    train = df[df["split"] == "train"]
    test_general = df[df["split"] == "test_general"]
    wc2022 = df[df["split"] == "wc2022"]
    wc2026 = df[df["split"] == "wc2026"]

    X_train = train[FEATURES].values
    y_train = train["y"].values

    # Base Random Forest
    rf = RandomForestClassifier(
        n_estimators=500,
        max_depth=None,
        min_samples_leaf=5,
        max_features="sqrt",
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    # Calibrate with isotonic regression using internal 5-fold CV on train
    # cv=5 means the calibrator splits train internally — never sees test
    calibrated_rf = CalibratedClassifierCV(rf, method="isotonic", cv=5)
    calibrated_rf.fit(X_train, y_train)

    # Also fit raw (uncalibrated) for comparison
    rf_raw = RandomForestClassifier(
        n_estimators=500,
        max_depth=None,
        min_samples_leaf=5,
        max_features="sqrt",
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    rf_raw.fit(X_train, y_train)

    print("=== Uncalibrated RF ===")
    for split_name, split_df in [("test_general", test_general), ("wc2022", wc2022), ("wc2026", wc2026)]:
        X = split_df[FEATURES].values
        y = split_df["y"].values
        proba = rf_raw.predict_proba(X)
        evaluate(split_name, y, proba)

    print("\n=== Calibrated RF (isotonic, cv=5) ===")
    results = {}
    for split_name, split_df in [("test_general", test_general), ("wc2022", wc2022), ("wc2026", wc2026)]:
        X = split_df[FEATURES].values
        y = split_df["y"].values
        proba = calibrated_rf.predict_proba(X)
        ll, bs, acc = evaluate(split_name, y, proba)
        results[split_name] = {"logloss": ll, "brier": bs, "acc": acc}

    # Feature importances from the raw RF (the calibrated wrapper averages over folds)
    print("\n=== Feature Importances (from uncalibrated RF) ===")
    importances = rf_raw.feature_importances_
    feat_imp = sorted(zip(FEATURES, importances), key=lambda x: x[1], reverse=True)
    for feat, imp in feat_imp:
        print(f"  {feat:30s}  {imp:.4f}")

    print("\n=== Summary ===")
    print(f"test_general: logloss={results['test_general']['logloss']:.4f}  brier={results['test_general']['brier']:.4f}  acc={results['test_general']['acc']:.4f}")
    print(f"wc2022:       logloss={results['wc2022']['logloss']:.4f}  brier={results['wc2022']['brier']:.4f}  acc={results['wc2022']['acc']:.4f}")
    print(f"wc2026:       logloss={results['wc2026']['logloss']:.4f}  brier={results['wc2026']['brier']:.4f}  acc={results['wc2026']['acc']:.4f}")

    return results, feat_imp

if __name__ == "__main__":
    main()
