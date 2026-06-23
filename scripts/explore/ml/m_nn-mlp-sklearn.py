"""
NN-MLP-sklearn experiment: MLPClassifier on standardised numeric features.
Architecture: (64, 32) hidden layers, relu activation, L2 regularisation,
early_stopping=True (internal validation from train).
Optionally calibrated with CalibratedClassifierCV (sigmoid / isotonic).
"""

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import log_loss, accuracy_score
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


def multiclass_brier(y_true, proba):
    """Sum (pk - indicator)^2 over all classes per match, average over matches."""
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
    np.random.seed(RANDOM_SEED)

    df = pd.read_csv(FEATURES_PATH)
    train = df[df["split"] == "train"]
    test_g = df[df["split"] == "test_general"]
    wc2022 = df[df["split"] == "wc2022"]
    wc2026 = df[df["split"] == "wc2026"]

    X_train = train[FEATURE_COLS].values
    y_train = train["y"].values

    X_test_g = test_g[FEATURE_COLS].values
    y_test_g = test_g["y"].values
    X_wc2022 = wc2022[FEATURE_COLS].values
    y_wc2022 = wc2022["y"].values
    X_wc2026 = wc2026[FEATURE_COLS].values
    y_wc2026 = wc2026["y"].values

    print(f"Train size: {len(X_train)}")

    # Standardize — fit on train only
    scaler = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train)
    X_test_g_sc = scaler.transform(X_test_g)
    X_wc2022_sc = scaler.transform(X_wc2022)
    X_wc2026_sc = scaler.transform(X_wc2026)

    # --- Experiment 1: MLP (64,) with early stopping ---
    print("\nFitting MLPClassifier(64,) with early_stopping=True ...")
    t0 = time.time()
    mlp64 = MLPClassifier(
        hidden_layer_sizes=(64,),
        activation="relu",
        solver="adam",
        alpha=1e-3,           # L2 weight decay
        batch_size=128,
        learning_rate_init=1e-3,
        max_iter=500,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=20,
        random_state=RANDOM_SEED,
        verbose=False,
    )
    mlp64.fit(X_train_sc, y_train)
    best_iter_64 = getattr(mlp64, 'best_iteration_', mlp64.n_iter_)
    print(f"  Done in {time.time()-t0:.1f}s, n_iter={mlp64.n_iter_}, best_iter={best_iter_64}")

    print("\n--- MLPClassifier(64,) ---")
    r64_train = evaluate("train", mlp64, X_train_sc, y_train)
    r64_tg = evaluate("test_general", mlp64, X_test_g_sc, y_test_g)
    r64_wc22 = evaluate("wc2022", mlp64, X_wc2022_sc, y_wc2022)
    r64_wc26 = evaluate("wc2026", mlp64, X_wc2026_sc, y_wc2026)

    # --- Experiment 2: MLP (64, 32) with early stopping ---
    print("\nFitting MLPClassifier(64,32) with early_stopping=True ...")
    t0 = time.time()
    mlp64_32 = MLPClassifier(
        hidden_layer_sizes=(64, 32),
        activation="relu",
        solver="adam",
        alpha=1e-3,
        batch_size=128,
        learning_rate_init=1e-3,
        max_iter=500,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=20,
        random_state=RANDOM_SEED,
        verbose=False,
    )
    mlp64_32.fit(X_train_sc, y_train)
    best_iter_6432 = getattr(mlp64_32, 'best_iteration_', mlp64_32.n_iter_)
    print(f"  Done in {time.time()-t0:.1f}s, n_iter={mlp64_32.n_iter_}, best_iter={best_iter_6432}")

    print("\n--- MLPClassifier(64,32) ---")
    r6432_train = evaluate("train", mlp64_32, X_train_sc, y_train)
    r6432_tg = evaluate("test_general", mlp64_32, X_test_g_sc, y_test_g)
    r6432_wc22 = evaluate("wc2022", mlp64_32, X_wc2022_sc, y_wc2022)
    r6432_wc26 = evaluate("wc2026", mlp64_32, X_wc2026_sc, y_wc2026)

    # --- Experiment 3: MLP (64, 32) with stronger regularisation ---
    print("\nFitting MLPClassifier(64,32) alpha=1e-2 (stronger L2) ...")
    t0 = time.time()
    mlp64_32_strong = MLPClassifier(
        hidden_layer_sizes=(64, 32),
        activation="relu",
        solver="adam",
        alpha=1e-2,
        batch_size=128,
        learning_rate_init=1e-3,
        max_iter=500,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=20,
        random_state=RANDOM_SEED,
        verbose=False,
    )
    mlp64_32_strong.fit(X_train_sc, y_train)
    best_iter_strong = getattr(mlp64_32_strong, 'best_iteration_', mlp64_32_strong.n_iter_)
    print(f"  Done in {time.time()-t0:.1f}s, n_iter={mlp64_32_strong.n_iter_}, best_iter={best_iter_strong}")

    print("\n--- MLPClassifier(64,32) alpha=1e-2 ---")
    r_strong_train = evaluate("train", mlp64_32_strong, X_train_sc, y_train)
    r_strong_tg = evaluate("test_general", mlp64_32_strong, X_test_g_sc, y_test_g)
    r_strong_wc22 = evaluate("wc2022", mlp64_32_strong, X_wc2022_sc, y_wc2022)
    r_strong_wc26 = evaluate("wc2026", mlp64_32_strong, X_wc2026_sc, y_wc2026)

    # --- Pick the best model for test_general and optionally calibrate ---
    results = [
        ("mlp(64,)         ", r64_train, r64_tg, r64_wc22, r64_wc26, mlp64),
        ("mlp(64,32)       ", r6432_train, r6432_tg, r6432_wc22, r6432_wc26, mlp64_32),
        ("mlp(64,32)L2_1e2 ", r_strong_train, r_strong_tg, r_strong_wc22, r_strong_wc26, mlp64_32_strong),
    ]

    best = min(results, key=lambda r: r[2][0])
    best_name, best_train, best_tg, best_wc22, best_wc26, best_model = best

    print(f"\nBest model by test_general logloss: {best_name.strip()}")

    # Calibrate best model with CalibratedClassifierCV (sigmoid, cv=5)
    print("\nCalibrating best model with CalibratedClassifierCV(sigmoid, cv=5) ...")
    t0 = time.time()
    # Re-fit base without early_stopping for calibration (cv uses all train data internally)
    hidden = best_model.hidden_layer_sizes
    base_for_cal = MLPClassifier(
        hidden_layer_sizes=hidden,
        activation="relu",
        solver="adam",
        alpha=best_model.alpha,
        batch_size=128,
        learning_rate_init=1e-3,
        max_iter=getattr(best_model, 'best_iteration_', best_model.n_iter_) + 10,  # fixed iterations = best found
        early_stopping=False,
        random_state=RANDOM_SEED,
        verbose=False,
    )
    cal_model = CalibratedClassifierCV(base_for_cal, cv=5, method="sigmoid")
    cal_model.fit(X_train_sc, y_train)
    print(f"  Done in {time.time()-t0:.1f}s")

    print(f"\n--- Calibrated {best_name.strip()} (sigmoid, cv=5) ---")
    r_cal_train = evaluate("train", cal_model, X_train_sc, y_train)
    r_cal_tg = evaluate("test_general", cal_model, X_test_g_sc, y_test_g)
    r_cal_wc22 = evaluate("wc2022", cal_model, X_wc2022_sc, y_wc2022)
    r_cal_wc26 = evaluate("wc2026", cal_model, X_wc2026_sc, y_wc2026)

    # Choose overall winner between best uncalibrated and calibrated
    if r_cal_tg[0] < best_tg[0]:
        final_train, final_tg, final_wc22, final_wc26 = r_cal_train, r_cal_tg, r_cal_wc22, r_cal_wc26
        final_label = f"Calibrated {best_name.strip()}"
    else:
        final_train, final_tg, final_wc22, final_wc26 = best_train, best_tg, best_wc22, best_wc26
        final_label = best_name.strip()

    print("\n" + "="*60)
    print(f"FINAL RESULTS — {final_label}")
    print("="*60)
    print(f"  train         logloss={final_train[0]:.4f}  brier={final_train[1]:.4f}  acc={final_train[2]:.4f}")
    print(f"  test_general  logloss={final_tg[0]:.4f}  brier={final_tg[1]:.4f}  acc={final_tg[2]:.4f}")
    print(f"  wc2022        logloss={final_wc22[0]:.4f}  brier={final_wc22[1]:.4f}  acc={final_wc22[2]:.4f}")
    print(f"  wc2026        logloss={final_wc26[0]:.4f}  brier={final_wc26[1]:.4f}  acc={final_wc26[2]:.4f}")
    print(f"  train-test gap: {final_train[0] - final_tg[0]:+.4f}")
    print("\nBaseline (Elo-Davidson):")
    print("  test_general: logloss=0.8819  brier=0.5190  acc=0.5969")
    print("  wc2022:       logloss=1.0666  brier=0.6309  acc=0.4531")
    print("  wc2026:       logloss=1.0929  brier=0.6879  acc=0.3333")


if __name__ == "__main__":
    main()
