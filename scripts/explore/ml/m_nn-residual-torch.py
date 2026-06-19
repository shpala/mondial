"""
Experiment: nn-residual-torch
Model: PyTorch residual-over-Elo network (hybrid)

Architecture:
  1. Compute Elo-Davidson baseline log-probabilities from rating_diff.
  2. Feed those 3 log-probs PLUS extra features (form, rest, match-type) into a
     small MLP that learns a residual correction (logit delta).
  3. Final probs = softmax(baseline_logits + correction).
  4. Initialise correction head weights near-zero so the net starts near baseline.
"""

import math
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import log_loss, brier_score_loss, accuracy_score

# ── Reproducibility ───────────────────────────────────────────────────────────
SEED = 42
torch.manual_seed(SEED)
np.random.seed(SEED)

# ── Data ─────────────────────────────────────────────────────────────────────
df = pd.read_csv("/home/shpala/dev/mondial/scripts/explore/ml/features.csv")

EXTRA_FEATURES = [
    "neutral", "imp",
    "home_ppg", "away_ppg", "ppg_diff",
    "home_gd", "away_gd", "gd_diff",
    "home_gf", "home_ga", "away_gf", "away_ga",
    "home_rest", "away_rest", "rest_diff",
    "home_played", "away_played",
    "cat_friendly", "cat_qualifier", "cat_nations_league",
    "cat_continental_finals", "cat_confederations", "cat_wc_finals", "cat_other",
]

train_df = df[df["split"] == "train"].reset_index(drop=True)
test_df   = df[df["split"] == "test_general"].reset_index(drop=True)
wc22_df   = df[df["split"] == "wc2022"].reset_index(drop=True)
wc26_df   = df[df["split"] == "wc2026"].reset_index(drop=True)

print(f"Train: {len(train_df)}  test_general: {len(test_df)}  wc2022: {len(wc22_df)}  wc2026: {len(wc26_df)}")

# ── Elo-Davidson baseline ─────────────────────────────────────────────────────
NU    = 0.8
SCALE = 300.0

def elo_davidson_logprobs(rating_diff: np.ndarray) -> np.ndarray:
    """Return (N, 3) array of log-probabilities [home, draw, away]."""
    d = rating_diff / SCALE
    p_home_win_over_draw = 1.0 / (1.0 + 10.0 ** (-d / 2))  # Elo fraction
    # Davidson extension: draw absorbed by NU parameter
    # P(home) = p_hw / (1 + nu*sqrt(p_hw*(1-p_hw)))  — standard Davidson
    # Simpler closed form used in the shipped model:
    #   p_home = e^d / (e^d + nu + 1)
    #   p_draw = nu  / (e^d + nu + 1)
    #   p_away = 1   / (e^d + nu + 1)
    exp_d = np.exp(d)
    denom = exp_d + NU + 1.0
    p_home = exp_d / denom
    p_draw = NU    / denom
    p_away = 1.0   / denom
    probs = np.stack([p_home, p_draw, p_away], axis=1)
    # clip for numerical safety
    probs = np.clip(probs, 1e-9, 1.0)
    return np.log(probs)  # (N, 3)

# ── Feature preparation ───────────────────────────────────────────────────────
scaler = StandardScaler()
X_extra_train = scaler.fit_transform(train_df[EXTRA_FEATURES].values)
X_extra_test  = scaler.transform(test_df[EXTRA_FEATURES].values)
X_extra_wc22  = scaler.transform(wc22_df[EXTRA_FEATURES].values)
X_extra_wc26  = scaler.transform(wc26_df[EXTRA_FEATURES].values)

# Elo log-probs (already meaningful scale, don't standardise so net can anchor easily)
lp_train = elo_davidson_logprobs(train_df["rating_diff"].values).astype(np.float32)
lp_test  = elo_davidson_logprobs(test_df["rating_diff"].values).astype(np.float32)
lp_wc22  = elo_davidson_logprobs(wc22_df["rating_diff"].values).astype(np.float32)
lp_wc26  = elo_davidson_logprobs(wc26_df["rating_diff"].values).astype(np.float32)

y_train_arr = train_df["y"].values.astype(np.int64)
y_test_arr  = test_df["y"].values.astype(np.int64)
y_wc22_arr  = wc22_df["y"].values.astype(np.int64)
y_wc26_arr  = wc26_df["y"].values.astype(np.int64)

def to_tensors(lp, x_extra, y):
    return (
        torch.tensor(lp, dtype=torch.float32),
        torch.tensor(x_extra, dtype=torch.float32),
        torch.tensor(y, dtype=torch.long),
    )

# ── Validation split (15 % of train, stratified-ish via shuffle) ──────────────
rng = np.random.default_rng(SEED)
idx = rng.permutation(len(train_df))
val_size = int(0.15 * len(train_df))
val_idx  = idx[:val_size]
tr_idx   = idx[val_size:]

def subset(arr, idx):
    return arr[idx]

lp_tr  = lp_train[tr_idx];   x_tr  = X_extra_train[tr_idx];   y_tr  = y_train_arr[tr_idx]
lp_val = lp_train[val_idx];  x_val = X_extra_train[val_idx];  y_val = y_train_arr[val_idx]

t_lp_tr, t_x_tr, t_y_tr = to_tensors(lp_tr, x_tr, y_tr)
t_lp_val, t_x_val, t_y_val = to_tensors(lp_val, x_val, y_val)

# ── Model ─────────────────────────────────────────────────────────────────────
N_EXTRA = len(EXTRA_FEATURES)
N_ELO   = 3  # log-probs

class ResidualEloNet(nn.Module):
    def __init__(self, n_extra: int, hidden: int = 64, dropout: float = 0.3):
        super().__init__()
        self.input_norm = nn.LayerNorm(n_extra + N_ELO)
        self.net = nn.Sequential(
            nn.Linear(n_extra + N_ELO, hidden),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden, hidden // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        # correction head — init near zero so net starts at baseline
        self.correction = nn.Linear(hidden // 2, 3)
        nn.init.normal_(self.correction.weight, std=0.01)
        nn.init.zeros_(self.correction.bias)

    def forward(self, lp_base, x_extra):
        inp = torch.cat([lp_base, x_extra], dim=1)
        inp = self.input_norm(inp)
        h   = self.net(inp)
        delta = self.correction(h)          # residual logit correction
        logits = lp_base + delta            # anchor: add correction to baseline
        return logits                       # raw logits → cross-entropy

# ── Training ──────────────────────────────────────────────────────────────────
HIDDEN   = 64
DROPOUT  = 0.35
LR       = 3e-4
WD       = 1e-3
BATCH    = 256
MAX_EPOCHS = 300
PATIENCE   = 25

model = ResidualEloNet(N_EXTRA, hidden=HIDDEN, dropout=DROPOUT)
opt   = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WD)
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=MAX_EPOCHS)
loss_fn = nn.CrossEntropyLoss()

dataset = torch.utils.data.TensorDataset(t_lp_tr, t_x_tr, t_y_tr)
loader  = torch.utils.data.DataLoader(dataset, batch_size=BATCH, shuffle=True,
                                      generator=torch.Generator().manual_seed(SEED))

best_val_loss = float("inf")
best_state    = None
no_improve    = 0

for epoch in range(1, MAX_EPOCHS + 1):
    model.train()
    for lp_b, x_b, y_b in loader:
        opt.zero_grad()
        logits = model(lp_b, x_b)
        loss   = loss_fn(logits, y_b)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
    sched.step()

    # Validation
    model.eval()
    with torch.no_grad():
        val_logits = model(t_lp_val, t_x_val)
        val_loss   = loss_fn(val_logits, t_y_val).item()

    if val_loss < best_val_loss - 1e-5:
        best_val_loss = val_loss
        best_state    = {k: v.clone() for k, v in model.state_dict().items()}
        no_improve    = 0
    else:
        no_improve += 1

    if no_improve >= PATIENCE:
        print(f"Early stop at epoch {epoch}  best_val_loss={best_val_loss:.4f}")
        break

    if epoch % 50 == 0:
        print(f"Epoch {epoch:3d}  val_loss={val_loss:.4f}  best={best_val_loss:.4f}")

model.load_state_dict(best_state)
print(f"Loaded best weights (val_loss={best_val_loss:.4f})")

# ── Evaluation helper ─────────────────────────────────────────────────────────
def evaluate(lp, x_extra, y_true, label: str):
    model.eval()
    lp_t = torch.tensor(lp, dtype=torch.float32)
    x_t  = torch.tensor(x_extra, dtype=torch.float32)
    with torch.no_grad():
        logits = model(lp_t, x_t)
        probs  = torch.softmax(logits, dim=1).numpy()
    ll  = log_loss(y_true, probs)
    bsc = brier_score_loss(
        (y_true == 0).astype(int), probs[:, 0]
    ) + brier_score_loss(
        (y_true == 1).astype(int), probs[:, 1]
    ) + brier_score_loss(
        (y_true == 2).astype(int), probs[:, 2]
    )
    acc = accuracy_score(y_true, probs.argmax(axis=1))
    print(f"{label:20s}  logloss={ll:.4f}  brier={bsc:.4f}  acc={acc:.4f}")
    return ll, bsc, acc, probs

print("\n── Results ────────────────────────────────────────────────────────────")

# Train metrics (full train set)
t_lp_full_tr = torch.tensor(lp_train, dtype=torch.float32)
t_x_full_tr  = torch.tensor(X_extra_train, dtype=torch.float32)
model.eval()
with torch.no_grad():
    tr_logits = model(t_lp_full_tr, t_x_full_tr)
    tr_probs  = torch.softmax(tr_logits, dim=1).numpy()
tr_ll  = log_loss(y_train_arr, tr_probs)
tr_bsc = (brier_score_loss((y_train_arr==0).astype(int), tr_probs[:,0]) +
          brier_score_loss((y_train_arr==1).astype(int), tr_probs[:,1]) +
          brier_score_loss((y_train_arr==2).astype(int), tr_probs[:,2]))
tr_acc = accuracy_score(y_train_arr, tr_probs.argmax(axis=1))
print(f"{'train':20s}  logloss={tr_ll:.4f}  brier={tr_bsc:.4f}  acc={tr_acc:.4f}")

ll_test,  bsc_test,  acc_test,  _  = evaluate(lp_test,  X_extra_test,  y_test_arr,  "test_general")
ll_wc22,  bsc_wc22,  acc_wc22,  _  = evaluate(lp_wc22,  X_extra_wc22,  y_wc22_arr,  "wc2022")
ll_wc26,  bsc_wc26,  acc_wc26,  _  = evaluate(lp_wc26,  X_extra_wc26,  y_wc26_arr,  "wc2026")

print(f"\nTrain-vs-test gap: {tr_ll:.4f} vs {ll_test:.4f} = {ll_test - tr_ll:+.4f}")

# Baseline comparison
print("\n── Elo-Davidson baseline (no NN) ──────────────────────────────────────")
def baseline_metrics(lp, y_true, label):
    probs = np.exp(lp)
    probs = probs / probs.sum(axis=1, keepdims=True)
    ll  = log_loss(y_true, probs)
    bsc = (brier_score_loss((y_true==0).astype(int), probs[:,0]) +
           brier_score_loss((y_true==1).astype(int), probs[:,1]) +
           brier_score_loss((y_true==2).astype(int), probs[:,2]))
    acc = accuracy_score(y_true, probs.argmax(axis=1))
    print(f"{label:20s}  logloss={ll:.4f}  brier={bsc:.4f}  acc={acc:.4f}")

baseline_metrics(lp_test,  y_test_arr,  "baseline test_general")
baseline_metrics(lp_wc22,  y_wc22_arr,  "baseline wc2022")
baseline_metrics(lp_wc26,  y_wc26_arr,  "baseline wc2026")
