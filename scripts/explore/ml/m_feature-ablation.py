"""
Feature ablation experiment using HistGradientBoosting.
Tests nested feature sets to isolate marginal value of each data group.

A: rating_diff only
B: A + match-type (cat_*/imp/neutral)
C: A + form (ppg/gd/gf/ga)
D: A + rest
E: all features
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import log_loss, brier_score_loss, accuracy_score

# Load data
df = pd.read_csv('/home/shpala/dev/mondial/scripts/explore/ml/features.csv')

train = df[df['split'] == 'train'].copy()
test_general = df[df['split'] == 'test_general'].copy()
wc2022 = df[df['split'] == 'wc2022'].copy()
wc2026 = df[df['split'] == 'wc2026'].copy()

y_train = train['y'].values
y_test = test_general['y'].values
y_wc2022 = wc2022['y'].values
y_wc2026 = wc2026['y'].values

# Feature sets
FEATURE_SETS = {
    'A_rating': ['rating_diff'],
    'B_match_type': ['rating_diff', 'abs_rating_diff', 'raw_rating_diff', 'neutral', 'imp',
                     'cat_friendly', 'cat_qualifier', 'cat_nations_league',
                     'cat_continental_finals', 'cat_confederations', 'cat_wc_finals', 'cat_other'],
    'C_form': ['rating_diff', 'home_ppg', 'away_ppg', 'ppg_diff',
               'home_gd', 'away_gd', 'gd_diff', 'home_gf', 'home_ga',
               'away_gf', 'away_ga', 'home_played', 'away_played'],
    'D_rest': ['rating_diff', 'home_rest', 'away_rest', 'rest_diff'],
    'E_all': ['rating_diff', 'abs_rating_diff', 'raw_rating_diff', 'neutral', 'imp',
              'home_ppg', 'away_ppg', 'ppg_diff', 'home_gd', 'away_gd', 'gd_diff',
              'home_gf', 'home_ga', 'away_gf', 'away_ga',
              'home_rest', 'away_rest', 'rest_diff', 'home_played', 'away_played',
              'cat_friendly', 'cat_qualifier', 'cat_nations_league',
              'cat_continental_finals', 'cat_confederations', 'cat_wc_finals', 'cat_other'],
}

def brier_multiclass(y_true, proba):
    """Multiclass Brier score (mean over samples of sum of squared errors)."""
    n_classes = proba.shape[1]
    total = 0.0
    for c in range(n_classes):
        total += np.mean((proba[:, c] - (y_true == c).astype(float)) ** 2)
    return total

def evaluate(name, features):
    X_train = train[features].values
    X_test = test_general[features].values
    X_wc2022 = wc2022[features].values
    X_wc2026 = wc2026[features].values

    # Base model
    base = HistGradientBoostingClassifier(
        max_iter=300,
        learning_rate=0.05,
        max_depth=4,
        min_samples_leaf=20,
        random_state=42,
    )

    # Calibrate with isotonic regression (internal 5-fold CV on train)
    model = CalibratedClassifierCV(base, method='isotonic', cv=5)
    model.fit(X_train, y_train)

    results = {}
    for split_name, X, y in [
        ('test_general', X_test, y_test),
        ('wc2022', X_wc2022, y_wc2022),
        ('wc2026', X_wc2026, y_wc2026),
    ]:
        proba = model.predict_proba(X)
        proba = np.clip(proba, 1e-15, 1.0)
        ll = log_loss(y, proba, labels=[0, 1, 2])
        brier = brier_multiclass(y, proba)
        preds = np.argmax(proba, axis=1)
        acc = accuracy_score(y, preds)
        results[split_name] = {'logloss': ll, 'brier': brier, 'acc': acc}

    print(f"\n=== {name} ===")
    print(f"Features ({len(features)}): {features}")
    for split_name, m in results.items():
        print(f"  {split_name:15s}  logloss={m['logloss']:.4f}  brier={m['brier']:.4f}  acc={m['acc']:.4f}")

    return results

all_results = {}
for name, features in FEATURE_SETS.items():
    all_results[name] = evaluate(name, features)

# Print delta summary vs A
print("\n\n=== DELTA vs A (rating_diff only) on test_general ===")
baseline_ll = all_results['A_rating']['test_general']['logloss']
for name, results in all_results.items():
    ll = results['test_general']['logloss']
    delta = ll - baseline_ll
    print(f"  {name:20s}  logloss={ll:.4f}  delta={delta:+.4f}")

print("\n=== BASELINE (Elo-Davidson) ===")
print("  test_general     logloss=0.8819  brier=0.5190  acc=0.5969")
print("  wc2022           logloss=1.0666  brier=0.6309  acc=0.4531")
print("  wc2026           logloss=1.0929  brier=0.6879  acc=0.3333")

# Print final summary JSON-style
import json
print("\n=== JSON SUMMARY ===")
summary = {}
for name, results in all_results.items():
    summary[name] = {split: {k: round(v, 4) for k, v in m.items()} for split, m in results.items()}
print(json.dumps(summary, indent=2))
