"""
datasets/combined_dataset.py
NetramNova — Multi-Dataset Combined Loader

Merges APTOS 2019 + EyePACS for classifier training.
IDRiD is kept separate for fine-tuning (small, high-quality Indian data).

Strategy:
  - APTOS 2019: 3,662 images (Kaggle 2019, Indian dataset)
  - EyePACS: ~88k images, Grade 0 capped at 15k
  - Combined: ~24k+ training images (after Grade 0 balancing)
  - IDRiD fine-tune: 413 images (Indian PHC-relevant)

Usage:
    from datasets.combined_dataset import build_combined_loaders
    train_loader, val_loader, weights = build_combined_loaders(cfg)
"""

from __future__ import annotations
import os
import pandas as pd
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader, ConcatDataset

from datasets.aptos_dataset   import APTOSDataset, make_stratified_splits
from datasets.eyepacs_dataset import EyePACSDataset
from datasets.idrid_dataset   import IDRiDGradingDataset
from preprocessing.augmentation import get_train_transforms, get_val_transforms

NUM_CLASSES = 5


def _compute_combined_weights(datasets: list[Dataset]) -> torch.Tensor:
    """
    Compute inverse-frequency class weights across all datasets.
    Iterates each dataset to count labels without loading images.
    """
    counts = np.zeros(NUM_CLASSES, dtype=np.float32)
    for ds in datasets:
        if hasattr(ds, "class_counts"):
            counts += ds.class_counts().astype(np.float32)
    counts = np.maximum(counts, 1)
    weights = 1.0 / counts
    weights = weights / weights.sum() * NUM_CLASSES
    return torch.tensor(weights, dtype=torch.float32)


def build_combined_loaders(cfg: dict,
                           include_idrid: bool = True,
                           fold: int = 0) -> tuple:
    """
    Build combined train / val DataLoaders from APTOS + EyePACS (+ IDRiD).

    Parameters
    ----------
    cfg           : full config dict (loaded from config.yaml)
    include_idrid : if True, include IDRiD training set
    fold          : cross-validation fold (0-4) if valid.csv is not present

    Returns
    -------
    train_loader, val_loader, class_weights_tensor
    """
    os.makedirs("outputs/tmp", exist_ok=True)
    img_size = cfg["classifier"]["image_size"]
    batch    = cfg["classifier"]["batch_size"]
    aptos_cfg   = cfg["datasets"]["aptos"]
    eyepacs_cfg = cfg["datasets"]["eyepacs"]
    idrid_cfg   = cfg["datasets"]["idrid"]

    # ── APTOS 2019 — Check if dedicated valid.csv & val_images exist ──────────
    valid_csv_path = os.path.join(aptos_cfg.get("root", "data/aptos2019"), "valid.csv")
    val_img_dir    = os.path.join(aptos_cfg.get("root", "data/aptos2019"), "val_images")

    if os.path.exists(valid_csv_path) and os.path.exists(val_img_dir):
        # Maximize training data: use all 2,930 train images + official 366 val images
        aptos_train_ds = APTOSDataset(aptos_cfg["train_csv"], aptos_cfg["image_dir"],
                                      transform=get_train_transforms(img_size))
        aptos_val_ds   = APTOSDataset(valid_csv_path, val_img_dir,
                                      transform=get_val_transforms(img_size))
    else:
        # Fallback to 5-fold cross-validation split using requested fold
        aptos_splits = make_stratified_splits(aptos_cfg["train_csv"])
        fold_idx = min(fold, len(aptos_splits) - 1)
        aptos_train_df, aptos_val_df = aptos_splits[fold_idx]
        aptos_train_tmp = "outputs/tmp/aptos_train.csv"
        aptos_val_tmp   = "outputs/tmp/aptos_val.csv"
        aptos_train_df.to_csv(aptos_train_tmp, index=False)
        aptos_val_df.to_csv(aptos_val_tmp, index=False)

        aptos_train_ds = APTOSDataset(aptos_train_tmp, aptos_cfg["image_dir"],
                                      transform=get_train_transforms(img_size))
        aptos_val_ds   = APTOSDataset(aptos_val_tmp,   aptos_cfg["image_dir"],
                                      transform=get_val_transforms(img_size))

    train_datasets = [aptos_train_ds]
    val_datasets   = [aptos_val_ds]

    # ── EyePACS (if downloaded) ──────────────────────────────────────────────
    if os.path.exists(eyepacs_cfg.get("train_csv", "")):
        from sklearn.model_selection import train_test_split
        ep_df = pd.read_csv(eyepacs_cfg["train_csv"])
        ep_df.columns = [c.strip().lower() for c in ep_df.columns]
        ep_train_df, ep_val_df = train_test_split(
            ep_df, test_size=0.2, stratify=ep_df["level"], random_state=42)
        ep_train_csv = "outputs/tmp/eyepacs_train.csv"
        ep_val_csv   = "outputs/tmp/eyepacs_val.csv"
        ep_train_df.to_csv(ep_train_csv, index=False)
        ep_val_df.to_csv(ep_val_csv, index=False)

        ep_train_ds = EyePACSDataset(ep_train_csv, eyepacs_cfg["image_dir"],
                                      transform=get_train_transforms(img_size),
                                      max_grade0=15000)
        ep_val_ds   = EyePACSDataset(ep_val_csv,   eyepacs_cfg["image_dir"],
                                      transform=get_val_transforms(img_size),
                                      max_grade0=99999)
        train_datasets.append(ep_train_ds)
        val_datasets.append(ep_val_ds)

    # ── IDRiD Grading (if downloaded) ────────────────────────────────────────
    if include_idrid and os.path.exists(idrid_cfg.get("grading_train_csv", "")):
        idrid_train_ds = IDRiDGradingDataset(
            idrid_cfg["grading_train_csv"],
            idrid_cfg["image_train_dir"],
            transform=get_train_transforms(img_size))
        idrid_val_ds   = IDRiDGradingDataset(
            idrid_cfg["grading_test_csv"],
            idrid_cfg["image_test_dir"],
            transform=get_val_transforms(img_size))
        train_datasets.append(idrid_train_ds)
        val_datasets.append(idrid_val_ds)

    # ── Concatenate ──────────────────────────────────────────────────────────
    combined_train = ConcatDataset(train_datasets)
    combined_val   = ConcatDataset(val_datasets)

    class_weights = _compute_combined_weights(train_datasets)

    is_cuda = torch.cuda.is_available()
    workers = min(4, os.cpu_count() or 1) if os.name != "nt" else 0  # 0 on Windows prevents multiprocessing pickling issues
    train_loader = DataLoader(combined_train, batch_size=batch,
                              shuffle=True,  num_workers=workers, pin_memory=is_cuda,
                              drop_last=True)
    val_loader   = DataLoader(combined_val,   batch_size=batch,
                              shuffle=False, num_workers=workers, pin_memory=is_cuda)

    print(f"[Dataset] Train samples: {len(combined_train):,}")
    print(f"[Dataset] Val samples:   {len(combined_val):,}")
    print(f"[Dataset] Class weights: {class_weights.numpy().round(3)}")

    return train_loader, val_loader, class_weights
