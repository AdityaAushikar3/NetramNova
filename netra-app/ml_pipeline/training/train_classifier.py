"""
training/train_classifier.py
NetramNova — EfficientNet-B2 DR Classifier Training Loop

Trains on combined APTOS 2019 + EyePACS + IDRiD datasets.
Supports:
  - Mixed precision (torch.cuda.amp)
  - Weighted CrossEntropyLoss (class imbalance)
  - Cosine annealing with warmup
  - Best checkpoint saving (by val AUC)
  - TensorBoard logging

Usage:
    cd ml_pipeline
    python training/train_classifier.py --config config.yaml

    # Resume training:
    python training/train_classifier.py --config config.yaml \\
        --resume outputs/checkpoints/best_classifier.pt
"""

from __future__ import annotations
import os
import sys

# Prevent OpenMP runtime collision on Windows machines
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import argparse
import yaml
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.amp import GradScaler, autocast
try:
    from torch.utils.tensorboard import SummaryWriter
except ImportError:
    SummaryWriter = None
from sklearn.metrics import roc_auc_score, cohen_kappa_score
import numpy as np
from tqdm import tqdm

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.efficientnet_classifier import build_classifier, load_checkpoint
from datasets.combined_dataset import build_combined_loaders


class FocalLoss(nn.Module):
    """
    Multi-Class Focal Loss (Lin et al., RetinaNet) for Diabetic Retinopathy.
    Downweights well-classified Grade 0 negative examples (p_t > 0.8) by (1 - p_t)^gamma
    to force backpropagation updates onto rare Grade 3 (Severe) and Grade 1 (Mild) lesions.
    Computes p_t directly from softmax probabilities to ensure alpha class weights do not
    distort the focal modulating factor.
    """
    def __init__(self, alpha: torch.Tensor | None = None, gamma: float = 2.0,
                 label_smoothing: float = 0.05, reduction: str = "mean"):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.label_smoothing = label_smoothing
        self.reduction = reduction

    def forward(self, inputs: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = nn.functional.softmax(inputs, dim=1)
        target_probs = probs.gather(1, targets.unsqueeze(1)).squeeze(1)
        modulating_factor = (1.0 - target_probs) ** self.gamma

        ce_loss = nn.functional.cross_entropy(
            inputs, targets, weight=self.alpha,
            reduction="none", label_smoothing=self.label_smoothing
        )
        focal_loss = modulating_factor * ce_loss

        if self.reduction == "mean":
            return focal_loss.mean()
        elif self.reduction == "sum":
            return focal_loss.sum()
        return focal_loss


# ─── Argument Parsing ───────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(description="Train DR Severity Classifier")
    p.add_argument("--config",  default="config.yaml", help="Path to config.yaml")
    p.add_argument("--resume",  default=None, help="Checkpoint to resume from")
    p.add_argument("--device",  default="auto", help="cuda / cpu / auto")
    p.add_argument("--fold",    type=int, default=0, help="APTOS CV fold (0-4)")
    p.add_argument("--epochs",  type=int, default=None, help="Override config epochs")
    p.add_argument("--no-idrid", action="store_true",
                   help="Exclude IDRiD from training set")
    return p.parse_args()


# ─── Training Utilities ─────────────────────────────────────────────────────
def get_device(spec: str) -> torch.device:
    if spec == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return torch.device(spec)


def one_epoch_train(model, loader, optimizer, criterion,
                    scaler, device, epoch, accum_steps: int = 1) -> dict:
    model.train()
    total_loss, correct, total = 0.0, 0, 0

    pbar = tqdm(loader, desc=f"Train Epoch {epoch}", leave=False)
    optimizer.zero_grad(set_to_none=True)
    for batch_idx, (imgs, labels) in enumerate(pbar):
        imgs   = imgs.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        with autocast(device_type=device.type, enabled=(device.type == "cuda")):
            logits = model(imgs)
            loss   = criterion(logits, labels)
            loss_scaled = loss / accum_steps

        scaler.scale(loss_scaled).backward()

        if (batch_idx + 1) % accum_steps == 0 or (batch_idx + 1) == len(loader):
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad(set_to_none=True)

        total_loss += loss.item() * imgs.size(0)
        preds       = logits.argmax(dim=1)
        correct    += (preds == labels).sum().item()
        total      += imgs.size(0)
        pbar.set_postfix(loss=f"{loss.item():.4f}")

    return {
        "loss": total_loss / total,
        "acc":  correct / total,
    }


@torch.no_grad()
def one_epoch_val(model, loader, criterion, device, epoch) -> dict:
    model.eval()
    total_loss, correct, total = 0.0, 0, 0
    all_labels, all_probs, all_preds = [], [], []

    for imgs, labels in tqdm(loader, desc=f"Val   Epoch {epoch}", leave=False):
        imgs   = imgs.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        with autocast(device_type=device.type, enabled=(device.type == "cuda")):
            logits = model(imgs)
            loss   = criterion(logits, labels)

        probs = torch.softmax(logits, dim=1).cpu().numpy()
        preds = logits.argmax(dim=1).cpu().numpy()
        total_loss += loss.item() * imgs.size(0)
        correct    += (preds == labels.cpu().numpy()).sum().item()
        total      += imgs.size(0)
        all_labels.extend(labels.cpu().numpy().tolist())
        all_probs.extend(probs)
        all_preds.extend(preds.tolist())

    y_true = np.array(all_labels)
    y_probs = np.array(all_probs)
    y_preds = np.array(all_preds)

    # Compute robust per-class OvR AUC across classes present
    aucs = []
    for c in range(5):
        y_bin = (y_true == c).astype(int)
        if len(np.unique(y_bin)) > 1:
            try:
                aucs.append(roc_auc_score(y_bin, y_probs[:, c]))
            except ValueError:
                pass
    auc = float(np.mean(aucs)) if aucs else 0.0

    # Quadratic Weighted Kappa (Clinical & Kaggle standard metric)
    try:
        kappa = float(cohen_kappa_score(y_true, y_preds, weights="quadratic"))
    except Exception:
        kappa = 0.0

    return {
        "loss":  total_loss / total,
        "acc":   correct / total,
        "auc":   auc,
        "kappa": kappa,
    }


def seed_everything(seed: int = 42):
    import random
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


# ─── Main Training Loop ──────────────────────────────────────────────────────
def main():
    seed_everything(42)
    args = parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    device = get_device(args.device)
    print(f"[Device] Using: {device}")

    # Override epochs if specified
    if args.epochs:
        cfg["classifier"]["epochs"] = args.epochs

    # ── Build datasets ──────────────────────────────────────────────────────
    print("[Data] Building combined dataset loaders...")
    train_loader, val_loader, class_weights = build_combined_loaders(
        cfg, include_idrid=not args.no_idrid, fold=args.fold)

    # ── Build model ─────────────────────────────────────────────────────────
    model, optimizer, scheduler = build_classifier(cfg)
    model = model.to(device)

    start_epoch = 1
    best_score = -2.0
    best_auc   = 0.0
    best_kappa = 0.0

    if args.resume:
        ckpt_meta = load_checkpoint(model, args.resume, device)
        if "optimizer" in ckpt_meta:
            try:
                optimizer.load_state_dict(ckpt_meta["optimizer"])
                print("[Resume] Restored optimizer state.")
            except Exception as e:
                print(f"[Warning] Could not load optimizer state: {e}")
        if "scheduler" in ckpt_meta:
            try:
                scheduler.load_state_dict(ckpt_meta["scheduler"])
                print("[Resume] Restored scheduler state.")
            except Exception as e:
                print(f"[Warning] Could not load scheduler state: {e}")
        if "epoch" in ckpt_meta and isinstance(ckpt_meta["epoch"], int):
            start_epoch = ckpt_meta["epoch"] + 1
        if "val_kappa" in ckpt_meta and isinstance(ckpt_meta["val_kappa"], (int, float)):
            best_kappa = float(ckpt_meta["val_kappa"])
            best_auc   = float(ckpt_meta.get("val_auc", 0.0))
            best_score = best_kappa if best_kappa > 0 else (best_auc - 1.0)
            print(f"[Resume] Resuming from Epoch {start_epoch} (Baseline best Kappa={best_kappa:.4f}, AUC={best_auc:.4f})")

    # ── Loss function: Focal Loss for Class Imbalance ─────────────────────────
    label_smoothing = cfg["classifier"].get("label_smoothing", 0.05)
    loss_type = cfg["classifier"].get("loss_type", "focal")

    if cfg["classifier"].get("use_class_weights", True):
        class_weights = class_weights.to(device)
    else:
        class_weights = None

    if loss_type == "focal":
        gamma = cfg["classifier"].get("focal_gamma", 2.0)
        criterion = FocalLoss(alpha=class_weights, gamma=gamma,
                              label_smoothing=label_smoothing)
        print(f"[Loss] Initialized Focal Loss (gamma={gamma}, class_weights={class_weights is not None})")
    else:
        criterion = nn.CrossEntropyLoss(weight=class_weights,
                                        label_smoothing=label_smoothing)
        print(f"[Loss] Initialized Cross-Entropy Loss (class_weights={class_weights is not None})")

    # ── Mixed precision scaler ──────────────────────────────────────────────
    use_amp = cfg["classifier"].get("mixed_precision", True) and device.type == "cuda"
    scaler  = GradScaler(device=device.type, enabled=use_amp)

    # ── Checkpoint & logging setup ───────────────────────────────────────────
    accum_steps = cfg["classifier"].get("gradient_accumulation_steps", 1)
    epochs = cfg["classifier"]["epochs"]
    ckpt_dir = Path(cfg["output"]["checkpoints"])
    log_dir  = Path(cfg["output"]["logs"]) / "classifier"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)

    writer  = SummaryWriter(log_dir) if SummaryWriter is not None else None

    print(f"\n[Training] Starting {epochs} epochs from epoch {start_epoch} (Accumulation Steps: {accum_steps})...")
    for epoch in range(start_epoch, epochs + 1):
        t0 = time.time()

        train_metrics = one_epoch_train(model, train_loader, optimizer,
                                        criterion, scaler, device, epoch,
                                        accum_steps=accum_steps)
        val_metrics   = one_epoch_val(model, val_loader, criterion, device, epoch)
        scheduler.step()

        elapsed = time.time() - t0
        print(
            f"Epoch {epoch:03d}/{epochs} | "
            f"Train Loss: {train_metrics['loss']:.4f}, Acc: {train_metrics['acc']:.3f} | "
            f"Val Loss: {val_metrics['loss']:.4f}, Acc: {val_metrics['acc']:.3f}, "
            f"AUC: {val_metrics['auc']:.4f}, Kappa: {val_metrics['kappa']:.4f} | {elapsed:.1f}s"
        )

        # TensorBoard (if installed)
        if writer is not None:
            writer.add_scalars("Loss",     {"train": train_metrics["loss"],
                                            "val":   val_metrics["loss"]}, epoch)
            writer.add_scalars("Accuracy", {"train": train_metrics["acc"],
                                            "val":   val_metrics["acc"]}, epoch)
            writer.add_scalar("Val_AUC",   val_metrics["auc"], epoch)
            writer.add_scalar("Val_Kappa", val_metrics["kappa"], epoch)
            writer.add_scalar("LR",        scheduler.get_last_lr()[0], epoch)

        # Save best checkpoint: prioritize QWK (Quadratic Weighted Kappa)
        # If kappa <= 0 during warmup, track AUC with offset (auc - 1.0)
        # so early zero-kappa epochs never block subsequent positive-kappa epochs
        if val_metrics["kappa"] > 0:
            val_score = val_metrics["kappa"]
        else:
            val_score = val_metrics["auc"] - 1.0

        if val_score > best_score:
            best_score = val_score
            best_auc   = val_metrics["auc"]
            best_kappa = val_metrics["kappa"]
            ckpt = {
                "epoch":       epoch,
                "model_state": model.state_dict(),
                "optimizer":   optimizer.state_dict(),
                "scheduler":   scheduler.state_dict(),
                "val_auc":     best_auc,
                "val_kappa":   best_kappa,
                "val_acc":     val_metrics["acc"],
                "config":      cfg["classifier"],
            }
            path = ckpt_dir / "best_classifier.pt"
            torch.save(ckpt, path)
            print(f"  [Checkpoint] Saved best model (Kappa={best_kappa:.4f}, AUC={best_auc:.4f}) -> {path}")

        # Save periodic checkpoint every 10 epochs
        if epoch % 10 == 0:
            path = ckpt_dir / f"classifier_epoch_{epoch:03d}.pt"
            torch.save({"epoch": epoch,
                        "model_state": model.state_dict(),
                        "val_auc": val_metrics["auc"],
                        "val_kappa": val_metrics["kappa"]}, path)

    if writer is not None:
        writer.close()
    print(f"\n[Done] Best validation Kappa: {best_kappa:.4f} | AUC: {best_auc:.4f}")
    print(f"       Checkpoint: {ckpt_dir / 'best_classifier.pt'}")


if __name__ == "__main__":
    main()
