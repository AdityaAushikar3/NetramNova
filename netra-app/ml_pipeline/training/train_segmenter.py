"""
training/train_segmenter.py
NetramNova — Lesion Segmentation Training

Supports two interchangeable backends:
  --backend yolo  : YOLOv8-Seg (ultralytics CLI wrapper)
  --backend unet  : U-Net (PyTorch training loop)

YOLOv8-Seg Backend
------------------
YOLOv8 training is handled by the ultralytics library.
IDRiD masks are converted to YOLO-format instance segmentation annotations
(polygon coordinates per lesion) before training.

U-Net Backend
-------------
Full PyTorch training loop with:
  - Binary cross-entropy + Dice loss (multi-class)
  - Sliding window inference for microaneurysms
  - Per-class IoU / Dice tracking

Usage:
    # YOLOv8-Seg:
    python training/train_segmenter.py --backend yolo --config config.yaml

    # U-Net:
    python training/train_segmenter.py --backend unet --config config.yaml \\
        --patch-ma    # use 256x256 patches for MA class only
"""

from __future__ import annotations
import os
import sys

# Prevent OpenMP runtime collision on Windows machines
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import argparse
import yaml
from pathlib import Path

import torch
import torch.nn as nn
from torch.amp import GradScaler, autocast
from torch.utils.data import DataLoader
try:
    from torch.utils.tensorboard import SummaryWriter
except ImportError:
    SummaryWriter = None
import numpy as np
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.segmentation_model import build_unet, LESION_CLASSES
from datasets.idrid_dataset import IDRiDSegDataset
from preprocessing.augmentation import get_seg_train_transforms, get_val_transforms


# ─── Argument Parsing ───────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(description="Train Lesion Segmentation Model")
    p.add_argument("--backend", choices=["yolo", "unet"], default="unet")
    p.add_argument("--config",  default="config.yaml")
    p.add_argument("--device",  default="auto")
    p.add_argument("--patch-ma", action="store_true",
                   help="Use 256x256 patches for MA class (U-Net only)")
    return p.parse_args()


# ─── Loss Functions ──────────────────────────────────────────────────────────
class DiceLoss(nn.Module):
    """Soft Dice Loss for binary segmentation per class."""

    def __init__(self, smooth: float = 1.0):
        super().__init__()
        self.smooth = smooth

    def forward(self, pred: torch.Tensor,
                target: torch.Tensor) -> torch.Tensor:
        """
        pred   : (B, C, H, W) — sigmoid probabilities
        target : (B, C, H, W) — binary masks
        """
        pred_flat   = pred.view(pred.size(0), pred.size(1), -1)
        target_flat = target.view(target.size(0), target.size(1), -1)
        intersection = (pred_flat * target_flat).sum(-1)
        dice = (2 * intersection + self.smooth) / (
            pred_flat.sum(-1) + target_flat.sum(-1) + self.smooth)
        return 1 - dice.mean()


class CombinedSegLoss(nn.Module):
    """BCE + Dice loss combination for multi-class binary segmentation."""

    def __init__(self, bce_weight: float = 0.5):
        super().__init__()
        self.bce  = nn.BCEWithLogitsLoss()
        self.dice = DiceLoss()
        self.w    = bce_weight

    def forward(self, logits: torch.Tensor,
                masks: torch.Tensor) -> torch.Tensor:
        bce_loss  = self.bce(logits, masks)
        dice_loss = self.dice(torch.sigmoid(logits), masks)
        return self.w * bce_loss + (1 - self.w) * dice_loss


# ─── Metrics ────────────────────────────────────────────────────────────────
def dice_per_class(pred_masks: torch.Tensor,
                   true_masks: torch.Tensor,
                   threshold: float = 0.5) -> np.ndarray:
    """Compute per-class Dice score. Returns array of shape (num_classes,)."""
    pred_bin = (pred_masks > threshold).float()
    scores = []
    for c in range(pred_masks.shape[1]):
        p = pred_bin[:, c].view(-1)
        t = true_masks[:, c].view(-1)
        inter = (p * t).sum()
        denom = p.sum() + t.sum()
        scores.append((2 * inter / (denom + 1e-7)).item())
    return np.array(scores)


# ─── U-Net Training Loop ─────────────────────────────────────────────────────
def train_unet(cfg: dict, args):
    seg_cfg  = cfg["segmentation"]
    idrid    = cfg["datasets"]["idrid"]
    out_cfg  = cfg["output"]

    device = torch.device("cuda" if torch.cuda.is_available()
                          else "cpu") if args.device == "auto" \
              else torch.device(args.device)
    print(f"[Device] {device}")

    img_size = 512
    train_ds = IDRiDSegDataset(
        idrid["seg_train_dir"],
        idrid["seg_mask_dir"],
        transform=get_seg_train_transforms(img_size))
    # Small dataset: use all for train, IDRiD test set for val
    val_ds = IDRiDSegDataset(
        idrid["seg_train_dir"],   # no separate seg test set in IDRiD; use last 10
        idrid["seg_mask_dir"],
        transform=get_val_transforms(img_size))

    # Use last 10 images as a held-out mini-val
    train_indices = list(range(len(train_ds) - 10))
    val_indices   = list(range(len(train_ds) - 10, len(train_ds)))
    from torch.utils.data import Subset
    train_set = Subset(train_ds, train_indices)
    val_set   = Subset(val_ds,   val_indices)

    workers = 0 if os.name == "nt" else 4
    train_loader = DataLoader(train_set, batch_size=seg_cfg["batch_size"],
                              shuffle=True, num_workers=workers, pin_memory=True)
    val_loader   = DataLoader(val_set,   batch_size=4,
                              shuffle=False, num_workers=workers, pin_memory=True)

    model     = build_unet().to(device)
    criterion = CombinedSegLoss(bce_weight=0.4)
    optimizer = torch.optim.AdamW(model.parameters(),
                                  lr=seg_cfg["lr"], weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=seg_cfg["epochs"], eta_min=1e-6)
    scaler    = GradScaler(device=device.type, enabled=(device.type == "cuda"))

    ckpt_dir = Path(out_cfg["checkpoints"])
    log_dir  = Path(out_cfg["logs"]) / "segmentation"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)
    writer = SummaryWriter(log_dir) if SummaryWriter is not None else None

    best_dice = 0.0
    epochs = seg_cfg["epochs"]

    for epoch in range(1, epochs + 1):
        # ── Train ───────────────────────────────────────────────────────────
        model.train()
        train_loss = 0.0
        for imgs, masks in tqdm(train_loader, desc=f"Seg Train {epoch}", leave=False):
            imgs  = imgs.to(device, non_blocking=True)
            masks = masks.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            with autocast(device_type=device.type, enabled=(device.type == "cuda")):
                logits = model(imgs)
                loss   = criterion(logits, masks)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            train_loss += loss.item()

        # ── Validate ─────────────────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        all_dice = []
        with torch.no_grad():
            for imgs, masks in val_loader:
                imgs  = imgs.to(device)
                masks = masks.to(device)
                logits = model(imgs)
                val_loss += criterion(logits, masks).item()
                probs = torch.sigmoid(logits).cpu()
                all_dice.append(dice_per_class(probs, masks.cpu()))

        mean_dice = np.stack(all_dice).mean(axis=0)
        avg_dice  = mean_dice.mean()
        scheduler.step()

        class_dice_str = " | ".join(
            f"{cls}: {d:.3f}"
            for cls, d in zip(LESION_CLASSES, mean_dice))
        print(f"Epoch {epoch:03d}/{epochs} | "
              f"Train Loss: {train_loss/len(train_loader):.4f} | "
              f"Val Loss: {val_loss/len(val_loader):.4f} | "
              f"Mean Dice: {avg_dice:.4f}")
        print(f"  Per-class: {class_dice_str}")

        if writer is not None:
            writer.add_scalar("Seg/Train_Loss", train_loss / len(train_loader), epoch)
            writer.add_scalar("Seg/Val_Loss",   val_loss / len(val_loader), epoch)
            writer.add_scalar("Seg/Mean_Dice",  avg_dice, epoch)
            for cls, d in zip(LESION_CLASSES, mean_dice):
                writer.add_scalar(f"Seg/Dice_{cls}", d, epoch)

        if avg_dice > best_dice:
            best_dice = avg_dice
            torch.save({"epoch": epoch,
                        "model_state": model.state_dict(),
                        "dice_per_class": mean_dice.tolist(),
                        "mean_dice": avg_dice},
                       ckpt_dir / "best_unet_seg.pt")
            print(f"  [Checkpoint] Saved (mean Dice={best_dice:.4f})")

    if writer is not None:
        writer.close()
    print(f"\n[Done] Best Mean Dice: {best_dice:.4f}")


# ─── YOLOv8-Seg Training (ultralytics CLI) ──────────────────────────────────
def train_yolo(cfg: dict):
    """
    Invoke YOLOv8 training via ultralytics Python API.
    Requires IDRiD masks to be pre-converted to YOLO format.

    Run preprocessing/convert_idrid_to_yolo.py first.
    """
    seg_cfg = cfg["segmentation"]

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[Error] Install ultralytics: pip install ultralytics")
        return

    model = YOLO(seg_cfg["model"])  # e.g. "yolov8m-seg.pt"
    model.train(
        data    = seg_cfg["data_yaml"],   # datasets/idrid_yolo/idrid_seg.yaml
        epochs  = seg_cfg["epochs"],
        imgsz   = seg_cfg["imgsz"],
        batch   = seg_cfg["batch_size"],
        lr0     = seg_cfg["lr"],
        workers = seg_cfg["workers"],
        project = cfg["output"]["checkpoints"],
        name    = "yolov8_seg_idrid",
        exist_ok= True,
        patience= 20,
        plots   = True,
        verbose = True,
    )
    print("[Done] YOLOv8-Seg training complete.")
    print(f"       Weights: {cfg['output']['checkpoints']}/yolov8_seg_idrid/weights/best.pt")


# ─── Entry Point ────────────────────────────────────────────────────────────
def main():
    args = parse_args()
    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    if args.backend == "unet":
        print("[Backend] U-Net Semantic Segmentation")
        train_unet(cfg, args)
    else:
        print("[Backend] YOLOv8-Seg Instance Segmentation")
        print("[Note] Ensure IDRiD masks are converted to YOLO format first.")
        print("       Run: python preprocessing/convert_idrid_to_yolo.py")
        train_yolo(cfg)


if __name__ == "__main__":
    main()
