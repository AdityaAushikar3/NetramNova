"""
training/train_localization.py
NetramNova — OD / Fovea Localization Training

Trains EfficientNet-B0 regression model on IDRiD Task C coordinates.
Loss: Euclidean distance between predicted and ground-truth (x_norm, y_norm).

Usage:
    cd ml_pipeline
    python training/train_localization.py --config config.yaml
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
from torch.amp import GradScaler, autocast
from torch.utils.data import DataLoader, random_split
try:
    from torch.utils.tensorboard import SummaryWriter
except ImportError:
    SummaryWriter = None
from tqdm import tqdm
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.localization_model import build_localizer, euclidean_distance_loss
from datasets.idrid_dataset import IDRiDLocalizationDataset
from preprocessing.augmentation import get_train_transforms, get_val_transforms


def parse_args():
    p = argparse.ArgumentParser(description="Train OD/Fovea Localization")
    p.add_argument("--config", default="config.yaml")
    p.add_argument("--device", default="auto")
    return p.parse_args()


def main():
    args = parse_args()
    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available()
                          else "cpu") if args.device == "auto" \
              else torch.device(args.device)
    print(f"[Device] {device}")

    loc_cfg   = cfg.get("localization", {})
    idrid_cfg = cfg["datasets"]["idrid"]
    out_cfg   = cfg["output"]
    img_size  = loc_cfg.get("image_size", 512)
    epochs    = loc_cfg.get("epochs", 30)
    batch     = loc_cfg.get("batch_size", 16)

    # ── Dataset ──────────────────────────────────────────────────────────────
    # Use coordinate-safe transform (preserves normalized (x, y) coordinates without spatial rotation/flips)
    full_ds = IDRiDLocalizationDataset(
        coord_file = idrid_cfg["optic_disc_dir"] + "/IDRiD_OD_Center_Cropping_Training.xlsx",
        image_dir  = idrid_cfg["image_train_dir"],
        transform  = get_val_transforms(img_size))

    # 80/20 split (IDRiD has ~54 localization images)
    n_val  = max(1, int(len(full_ds) * 0.2))
    n_train = len(full_ds) - n_val
    train_ds, val_ds = random_split(
        full_ds, [n_train, n_val],
        generator=torch.Generator().manual_seed(42))

    workers = 0 if os.name == "nt" else 2
    train_loader = DataLoader(train_ds, batch_size=batch,
                              shuffle=True, num_workers=workers)
    val_loader   = DataLoader(val_ds,   batch_size=batch,
                              shuffle=False, num_workers=workers)

    # ── Model ─────────────────────────────────────────────────────────────────
    model, optimizer, scheduler = build_localizer(cfg)
    model = model.to(device)

    scaler = GradScaler(device=device.type, enabled=(device.type == "cuda"))

    ckpt_dir = Path(out_cfg["checkpoints"])
    log_dir  = Path(out_cfg["logs"]) / "localization"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)
    writer   = SummaryWriter(log_dir)

    best_val_loss = float("inf")

    print(f"\n[Localization Training] {epochs} epochs, "
          f"train={n_train}, val={n_val}")

    for epoch in range(1, epochs + 1):
        # ── Train ───────────────────────────────────────────────────────────
        model.train()
        train_loss = 0.0
        for imgs, coords in tqdm(train_loader,
                                 desc=f"Loc Train {epoch}", leave=False):
            imgs   = imgs.to(device)
            coords = coords.to(device)
            optimizer.zero_grad(set_to_none=True)
            with autocast(device_type=device.type, enabled=(device.type == "cuda")):
                pred  = model(imgs)
                loss  = euclidean_distance_loss(pred, coords)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            train_loss += loss.item()

        # ── Validate ─────────────────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        all_errors = []
        with torch.no_grad():
            for imgs, coords in val_loader:
                imgs   = imgs.to(device)
                coords = coords.to(device)
                pred   = model(imgs)
                loss   = euclidean_distance_loss(pred, coords)
                val_loss += loss.item()
                # Pixel-level error assuming 512×512 image
                pixel_err = ((pred - coords).abs() *
                             torch.tensor([512., 512.], device=device)).norm(dim=1)
                all_errors.extend(pixel_err.cpu().numpy())

        scheduler.step()

        mean_pixel_err = np.mean(all_errors)
        train_l = train_loss / len(train_loader)
        val_l   = val_loss / len(val_loader)

        print(f"Epoch {epoch:03d}/{epochs} | "
              f"Train Loss: {train_l:.4f} | "
              f"Val Loss: {val_l:.4f} | "
              f"Mean Pixel Error: {mean_pixel_err:.1f}px")

        if writer is not None:
            writer.add_scalar("Loc/Train_Loss",    train_l, epoch)
            writer.add_scalar("Loc/Val_Loss",      val_l, epoch)
            writer.add_scalar("Loc/Pixel_Error",   mean_pixel_err, epoch)

        if val_l < best_val_loss:
            best_val_loss = val_l
            torch.save({"epoch": epoch,
                        "model_state": model.state_dict(),
                        "val_loss": best_val_loss,
                        "mean_pixel_err": mean_pixel_err},
                       ckpt_dir / "best_localizer.pt")
            print(f"  [Checkpoint] Saved (val_loss={best_val_loss:.4f}, "
                  f"pixel_err={mean_pixel_err:.1f}px)")

    if writer is not None:
        writer.close()
    print(f"\n[Done] Best Val Loss: {best_val_loss:.4f}")


if __name__ == "__main__":
    main()
