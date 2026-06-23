"""
nn-mlp-torch: PyTorch feedforward MLP on standardised numeric features.
2-3 hidden layers (128-64-32), ReLU, dropout ~0.3, weight decay, Adam,
cross-entropy, early stopping on train-internal validation slice.
"""

from pathlib import Path
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import log_loss, brier_score_loss, accuracy_score

# Reproducibility
torch.manual_seed(42)
np.random.seed(42)

# ── Feature columns ──────────────────────────────────────────────────────────
NUMERIC_COLS = [
    "rating_diff", "abs_rating_diff", "raw_rating_diff", "neutral", "imp",
    "home_ppg", "away_ppg", "ppg_diff", "home_gd", "away_gd", "gd_diff",
    "home_gf", "home_ga", "away_gf", "away_ga", "home_rest", "away_rest",
    "rest_diff", "home_played", "away_played",
    "cat_friendly", "cat_qualifier", "cat_nations_league",
    "cat_continental_finals", "cat_confederations", "cat_wc_finals", "cat_other",
]
LABEL_COL = "y"
SPLIT_COL = "split"

# ── Load data ─────────────────────────────────────────────────────────────────
df = pd.read_csv(str(Path(__file__).resolve().parent / "features.csv"))

train_df = df[df[SPLIT_COL] == "train"].copy()
test_df   = df[df[SPLIT_COL] == "test_general"].copy()
wc22_df   = df[df[SPLIT_COL] == "wc2022"].copy()
wc26_df   = df[df[SPLIT_COL] == "wc2026"].copy()

print(f"train={len(train_df)}  test_general={len(test_df)}  wc2022={len(wc22_df)}  wc2026={len(wc26_df)}")

# ── Train/val split (80/20 of train) ─────────────────────────────────────────
val_frac = 0.20
n_val = int(len(train_df) * val_frac)
train_df = train_df.sample(frac=1, random_state=42).reset_index(drop=True)
val_df   = train_df.iloc[:n_val]
fit_df   = train_df.iloc[n_val:]

# ── Scale ─────────────────────────────────────────────────────────────────────
scaler = StandardScaler()
X_fit  = scaler.fit_transform(fit_df[NUMERIC_COLS].values.astype(np.float32))
X_val  = scaler.transform(val_df[NUMERIC_COLS].values.astype(np.float32))
X_test = scaler.transform(test_df[NUMERIC_COLS].values.astype(np.float32))
X_wc22 = scaler.transform(wc22_df[NUMERIC_COLS].values.astype(np.float32))
X_wc26 = scaler.transform(wc26_df[NUMERIC_COLS].values.astype(np.float32))
X_train_full = scaler.transform(train_df[NUMERIC_COLS].values.astype(np.float32))

y_fit  = fit_df[LABEL_COL].values.astype(np.int64)
y_val  = val_df[LABEL_COL].values.astype(np.int64)
y_test = test_df[LABEL_COL].values.astype(np.int64)
y_wc22 = wc22_df[LABEL_COL].values.astype(np.int64)
y_wc26 = wc26_df[LABEL_COL].values.astype(np.int64)
y_train_full = train_df[LABEL_COL].values.astype(np.int64)

# ── Tensors & loaders ─────────────────────────────────────────────────────────
def to_tensors(X, y):
    return TensorDataset(torch.tensor(X), torch.tensor(y))

fit_loader = DataLoader(to_tensors(X_fit, y_fit), batch_size=256, shuffle=True)

# ── Model ─────────────────────────────────────────────────────────────────────
class MLP(nn.Module):
    def __init__(self, in_dim, dropout=0.3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, 128), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(128, 64),    nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(64, 32),     nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(32, 3),
        )

    def forward(self, x):
        return self.net(x)

in_dim = X_fit.shape[1]
model = MLP(in_dim, dropout=0.3)

optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
criterion = nn.CrossEntropyLoss()

# ── Early stopping ────────────────────────────────────────────────────────────
X_val_t = torch.tensor(X_val)
y_val_t  = torch.tensor(y_val)

best_val_loss = float("inf")
best_state    = None
patience      = 30
wait          = 0
max_epochs    = 500

for epoch in range(1, max_epochs + 1):
    model.train()
    for Xb, yb in fit_loader:
        optimizer.zero_grad()
        loss = criterion(model(Xb), yb)
        loss.backward()
        optimizer.step()

    model.eval()
    with torch.no_grad():
        val_loss = criterion(model(X_val_t), y_val_t).item()

    if val_loss < best_val_loss - 1e-6:
        best_val_loss = val_loss
        best_state    = {k: v.clone() for k, v in model.state_dict().items()}
        wait          = 0
    else:
        wait += 1
        if wait >= patience:
            print(f"Early stop at epoch {epoch}, best val_loss={best_val_loss:.5f}")
            break

    if epoch % 50 == 0:
        print(f"  epoch {epoch:4d}  val_loss={val_loss:.5f}")

model.load_state_dict(best_state)

# ── Evaluate ──────────────────────────────────────────────────────────────────
def evaluate(X_np, y_np, label):
    model.eval()
    with torch.no_grad():
        logits = model(torch.tensor(X_np))
        probs  = torch.softmax(logits, dim=1).numpy()
    ll  = log_loss(y_np, probs, labels=[0, 1, 2])
    acc = accuracy_score(y_np, probs.argmax(axis=1))
    # Brier: mean over classes
    from sklearn.preprocessing import label_binarize
    y_bin   = label_binarize(y_np, classes=[0, 1, 2])
    brier   = np.mean([brier_score_loss(y_bin[:, c], probs[:, c]) for c in range(3)])
    print(f"{label:20s}  logloss={ll:.4f}  brier={brier:.4f}  acc={acc:.4f}")
    return ll, brier, acc

print()
print("=== RESULTS ===")
train_ll,  train_brier,  train_acc  = evaluate(X_train_full, y_train_full, "train_full")
test_ll,   test_brier,   test_acc   = evaluate(X_test,       y_test,       "test_general")
wc22_ll,   wc22_brier,   wc22_acc   = evaluate(X_wc22,       y_wc22,       "wc2022")
wc26_ll,   wc26_brier,   wc26_acc   = evaluate(X_wc26,       y_wc26,       "wc2026")

print()
print(f"train-test gap (logloss): {train_ll - test_ll:+.4f}")
print(f"Baseline (ln3):           {np.log(3):.4f}")
