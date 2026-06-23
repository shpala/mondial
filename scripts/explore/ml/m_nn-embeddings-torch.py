"""
nn-embeddings-torch: PyTorch MLP with learnable team + match-type embeddings.

Architecture:
  - Shared team embedding table (300 teams, dim=8)
  - Match-type embedding (7 cat_* types, dim=4) via argmax of one-hot
  - Numeric features standardised (scaler fit on train only)
  - MLP head with dropout + weight decay

Regularisation strategy (8k rows, 300*8=2400 team params):
  - Embedding dim=8 (small)
  - Hidden layers: 64 -> 32
  - Dropout=0.4 after each hidden layer
  - Weight decay=1e-3
  - Early stopping on val loss (patience=20)
  - Val split: 10% of train (stratified)
"""

from pathlib import Path
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import log_loss, brier_score_loss, accuracy_score
from sklearn.model_selection import StratifiedShuffleSplit
import warnings
warnings.filterwarnings("ignore")

# ── Seeds ─────────────────────────────────────────────────────────────────────
SEED = 42
np.random.seed(SEED)
torch.manual_seed(SEED)

# ── Load data ─────────────────────────────────────────────────────────────────
df = pd.read_csv(str(Path(__file__).resolve().parent / "features_teams.csv"))

NUMERIC_COLS = [
    "rating_diff", "abs_rating_diff", "raw_rating_diff", "neutral", "imp",
    "home_ppg", "away_ppg", "ppg_diff",
    "home_gd", "away_gd", "gd_diff",
    "home_gf", "home_ga", "away_gf", "away_ga",
    "home_rest", "away_rest", "rest_diff",
    "home_played", "away_played",
    "cat_friendly", "cat_qualifier", "cat_nations_league",
    "cat_continental_finals", "cat_confederations", "cat_wc_finals", "cat_other",
]

CAT_COLS = [
    "cat_friendly", "cat_qualifier", "cat_nations_league",
    "cat_continental_finals", "cat_confederations", "cat_wc_finals", "cat_other",
]

# ── Team encoder ──────────────────────────────────────────────────────────────
all_teams = pd.concat([df["home_team"], df["away_team"]]).unique()
team_enc = LabelEncoder()
team_enc.fit(all_teams)
NUM_TEAMS = len(team_enc.classes_)  # 300

df["home_idx"] = team_enc.transform(df["home_team"])
df["away_idx"] = team_enc.transform(df["away_team"])

# ── Match-type index: argmax of cat_* one-hots (0=friendly if none set) ───────
cat_arr = df[CAT_COLS].values
match_type_idx = np.where(cat_arr.sum(axis=1) == 0, 0, cat_arr.argmax(axis=1))
df["match_type_idx"] = match_type_idx
NUM_MATCH_TYPES = len(CAT_COLS)  # 7

# ── Splits ────────────────────────────────────────────────────────────────────
train_df = df[df["split"] == "train"].copy()
test_df   = df[df["split"] == "test_general"].copy()
wc22_df   = df[df["split"] == "wc2022"].copy()
wc26_df   = df[df["split"] == "wc2026"].copy()

# Val slice from train (10%, stratified)
sss = StratifiedShuffleSplit(n_splits=1, test_size=0.10, random_state=SEED)
tr_idx, val_idx = next(sss.split(train_df, train_df["y"]))
fit_df  = train_df.iloc[tr_idx].copy()
val_df  = train_df.iloc[val_idx].copy()

print(f"Train fit: {len(fit_df)}, val: {len(val_df)}, test_general: {len(test_df)}, wc2022: {len(wc22_df)}, wc2026: {len(wc26_df)}")

# ── Scaler (fit on fit_df only) ───────────────────────────────────────────────
scaler = StandardScaler()
scaler.fit(fit_df[NUMERIC_COLS])

def prep(split_df):
    X_num = scaler.transform(split_df[NUMERIC_COLS]).astype(np.float32)
    X_home = split_df["home_idx"].values.astype(np.int64)
    X_away = split_df["away_idx"].values.astype(np.int64)
    X_mtype = split_df["match_type_idx"].values.astype(np.int64)
    y = split_df["y"].values.astype(np.int64)
    return (
        torch.tensor(X_num),
        torch.tensor(X_home),
        torch.tensor(X_away),
        torch.tensor(X_mtype),
        torch.tensor(y),
    )

fit_tensors  = prep(fit_df)
val_tensors  = prep(val_df)
test_tensors = prep(test_df)
wc22_tensors = prep(wc22_df)
wc26_tensors = prep(wc26_df)
# Also full train for gap reporting
full_train_tensors = prep(train_df)

fit_loader = DataLoader(
    TensorDataset(*fit_tensors),
    batch_size=128, shuffle=True, generator=torch.Generator().manual_seed(SEED)
)

# ── Model ─────────────────────────────────────────────────────────────────────
TEAM_EMB_DIM   = 8
MATCH_EMB_DIM  = 4
HIDDEN1        = 64
HIDDEN2        = 32
DROPOUT        = 0.4
N_NUMERIC      = len(NUMERIC_COLS)

class EmbeddingMLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.team_emb  = nn.Embedding(NUM_TEAMS,       TEAM_EMB_DIM)
        self.mtype_emb = nn.Embedding(NUM_MATCH_TYPES, MATCH_EMB_DIM)

        in_dim = N_NUMERIC + 2 * TEAM_EMB_DIM + MATCH_EMB_DIM

        self.net = nn.Sequential(
            nn.Linear(in_dim, HIDDEN1),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
            nn.Linear(HIDDEN1, HIDDEN2),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
            nn.Linear(HIDDEN2, 3),
        )
        # initialise embeddings small
        nn.init.normal_(self.team_emb.weight,  std=0.05)
        nn.init.normal_(self.mtype_emb.weight, std=0.05)

    def forward(self, x_num, x_home, x_away, x_mtype):
        e_home  = self.team_emb(x_home)
        e_away  = self.team_emb(x_away)
        e_mtype = self.mtype_emb(x_mtype)
        x = torch.cat([x_num, e_home, e_away, e_mtype], dim=1)
        return self.net(x)

model = EmbeddingMLP()
print(f"Model params: {sum(p.numel() for p in model.parameters()):,}")

optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-3)
scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=10, factor=0.5)
criterion = nn.CrossEntropyLoss()

# ── Training with early stopping ──────────────────────────────────────────────
PATIENCE = 30
MAX_EPOCHS = 400

best_val_loss = float("inf")
best_state    = None
patience_ctr  = 0

for epoch in range(1, MAX_EPOCHS + 1):
    model.train()
    for batch in fit_loader:
        xn, xh, xa, xm, yb = batch
        optimizer.zero_grad()
        logits = model(xn, xh, xa, xm)
        loss = criterion(logits, yb)
        loss.backward()
        optimizer.step()

    # Validation
    model.eval()
    with torch.no_grad():
        val_logits = model(*val_tensors[:4])
        val_loss   = criterion(val_logits, val_tensors[4]).item()

    scheduler.step(val_loss)

    if val_loss < best_val_loss - 1e-5:
        best_val_loss = val_loss
        best_state    = {k: v.clone() for k, v in model.state_dict().items()}
        patience_ctr  = 0
    else:
        patience_ctr += 1

    if patience_ctr >= PATIENCE:
        print(f"Early stop at epoch {epoch}, best val loss={best_val_loss:.4f}")
        break

    if epoch % 50 == 0:
        print(f"Epoch {epoch:4d}  val_loss={val_loss:.4f}  best={best_val_loss:.4f}")

model.load_state_dict(best_state)
print(f"Restored best model (val loss={best_val_loss:.4f})")

# ── Evaluation helper ─────────────────────────────────────────────────────────
def evaluate(tensors, label):
    model.eval()
    with torch.no_grad():
        logits = model(*tensors[:4])
        probs  = torch.softmax(logits, dim=1).numpy()
    y_true = tensors[4].numpy()
    ll  = log_loss(y_true, probs, labels=[0, 1, 2])
    # brier: mean over classes
    from sklearn.preprocessing import label_binarize
    y_bin = label_binarize(y_true, classes=[0, 1, 2])
    brier = np.mean([brier_score_loss(y_bin[:, c], probs[:, c]) for c in range(3)])
    acc   = accuracy_score(y_true, probs.argmax(axis=1))
    print(f"{label:15s}  logloss={ll:.4f}  brier={brier:.4f}  acc={acc:.4f}")
    return ll, brier, acc

print("\n=== Results ===")
tr_ll, tr_bs, tr_acc   = evaluate(full_train_tensors, "train")
tg_ll, tg_bs, tg_acc   = evaluate(test_tensors,       "test_general")
w22_ll, w22_bs, w22_acc = evaluate(wc22_tensors,       "wc2022")
w26_ll, w26_bs, w26_acc = evaluate(wc26_tensors,       "wc2026")

print(f"\nTrain vs test_general gap: {tr_ll:.4f} vs {tg_ll:.4f} (diff={tg_ll - tr_ll:+.4f})")

# ── Calibration check ─────────────────────────────────────────────────────────
model.eval()
with torch.no_grad():
    probs_test = torch.softmax(model(*test_tensors[:4]), dim=1).numpy()
y_test = test_tensors[4].numpy()

print("\n=== Calibration (test_general) — mean predicted vs actual freq ===")
for c, name in enumerate(["home", "draw", "away"]):
    pred_mean = probs_test[:, c].mean()
    actual    = (y_test == c).mean()
    print(f"  {name:4s}: pred={pred_mean:.3f}  actual={actual:.3f}")

# ── Summary JSON (for StructuredOutput) ──────────────────────────────────────
print(f"""
=== FINAL NUMBERS ===
test_general  logloss={tg_ll:.4f}  brier={tg_bs:.4f}  acc={tg_acc:.4f}
wc2022        logloss={w22_ll:.4f}  brier={w22_bs:.4f}  acc={w22_acc:.4f}
wc2026        logloss={w26_ll:.4f}  brier={w26_bs:.4f}  acc={w26_acc:.4f}
train_gap     train={tr_ll:.4f} test={tg_ll:.4f} diff={tg_ll - tr_ll:+.4f}
""")
