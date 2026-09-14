"""
datasets/aptos_dataset.py
NetramNova — APTOS 2019 Blindness Detection Dataset Loader

Dataset structure (after Kaggle download):
  data/aptos2019/
      train.csv           (id_code, diagnosis: 0-4)
      test.csv            (id_code)
      train_images/       (PNG files named {id_code}.png)

Labels (ICDR standard):
  0 = No DR
  1 = Mild NPDR
  2 = Moderate NPDR
  3 = Severe NPDR
  4 = Proliferative DR (PDR)

Usage:
    ds = APTOSDataset("data/aptos2019/train.csv",
                      "data/aptos2019/train_images",
                      transform=get_train_transforms(512))
    loader = DataLoader(ds, batch_size=16, shuffle=True)
"""

from __future__ import annotations
import os
import cv2
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset
from sklearn.model_selection import StratifiedKFold

from preprocessing.foracchia_normalization import full_pipeline
from preprocessing.augmentation import get_train_transforms, get_val_transforms


LABEL_COL   = "diagnosis"
ID_COL      = "id_code"
NUM_CLASSES = 5


class APTOSDataset(Dataset):
    """
    PyTorch Dataset for APTOS 2019 retinal images.

    Parameters
    ----------
    csv_path    : path to train.csv or a filtered split CSV
    image_dir   : folder containing PNG fundus images
    transform   : albumentations transform (train or val)
    preprocess  : bool — apply Foracchia + CLAHE before transform
    """

    def __init__(self,
                 csv_path: str,
                 image_dir: str,
                 transform=None,
                 preprocess: bool = True):
        self.df = pd.read_csv(csv_path)
        self.image_dir = image_dir
        self.transform = transform
        self.preprocess = preprocess

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        row = self.df.iloc[idx]
        img_path = os.path.join(self.image_dir, row[ID_COL] + ".png")

        img = cv2.imread(img_path)
        if img is None:
            # Fallback: return black image and label 0
            img = np.zeros((512, 512, 3), dtype=np.uint8)
        else:
            # Downsample to 512x512 first to avoid expensive Gaussian blurring on 7-megapixel arrays
            if img.shape[0] > 512 or img.shape[1] > 512:
                img = cv2.resize(img, (512, 512), interpolation=cv2.INTER_AREA)

        # Ben Graham standardization
        if self.preprocess:
            img = full_pipeline(img)

        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        if self.transform:
            augmented = self.transform(image=img)
            img = augmented["image"]

        label = int(row[LABEL_COL]) if LABEL_COL in row else -1
        return img, label

    def class_counts(self) -> np.ndarray:
        """Return per-class sample counts for class weighting."""
        return np.bincount(self.df[LABEL_COL].values, minlength=NUM_CLASSES)


def get_class_weights(dataset: APTOSDataset) -> torch.Tensor:
    """
    Compute inverse frequency class weights for CrossEntropyLoss.
    Higher weight for rare classes (Grade 1, 3, 4).
    """
    counts = dataset.class_counts().astype(np.float32)
    counts = np.maximum(counts, 1)            # avoid division by zero
    weights = 1.0 / counts
    weights = weights / weights.sum() * NUM_CLASSES   # normalise
    return torch.tensor(weights, dtype=torch.float32)


def make_stratified_splits(csv_path: str,
                            n_folds: int = 5,
                            seed: int = 42) -> list[tuple[pd.DataFrame, pd.DataFrame]]:
    """
    Create stratified K-fold splits preserving DR grade distribution.

    Returns list of (train_df, val_df) tuples, one per fold.
    Useful for cross-validation experiments.
    """
    df = pd.read_csv(csv_path)
    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=seed)
    splits = []
    for train_idx, val_idx in skf.split(df, df[LABEL_COL]):
        splits.append((df.iloc[train_idx].reset_index(drop=True),
                       df.iloc[val_idx].reset_index(drop=True)))
    return splits


def build_loaders(cfg: dict,
                  fold: int = 0,
                  n_folds: int = 5) -> tuple:
    """
    Build train/val DataLoaders from config dict.

    Parameters
    ----------
    cfg   : config["datasets"]["aptos"] + config["classifier"] merged
    fold  : which fold to use as validation
    """
    from torch.utils.data import DataLoader

    splits = make_stratified_splits(cfg["train_csv"], n_folds=n_folds)
    train_df, val_df = splits[fold]

    # Save temporary CSVs for Dataset
    os.makedirs("outputs/tmp", exist_ok=True)
    train_csv_tmp = "outputs/tmp/aptos_train_fold.csv"
    val_csv_tmp   = "outputs/tmp/aptos_val_fold.csv"
    train_df.to_csv(train_csv_tmp, index=False)
    val_df.to_csv(val_csv_tmp, index=False)

    img_size = cfg.get("image_size", 512)
    train_ds = APTOSDataset(train_csv_tmp, cfg["image_dir"],
                            transform=get_train_transforms(img_size))
    val_ds   = APTOSDataset(val_csv_tmp,   cfg["image_dir"],
                            transform=get_val_transforms(img_size))

    workers = 0 if os.name == "nt" else 4
    train_loader = DataLoader(train_ds, batch_size=cfg["batch_size"],
                              shuffle=True,  num_workers=workers, pin_memory=True)
    val_loader   = DataLoader(val_ds,   batch_size=cfg["batch_size"],
                              shuffle=False, num_workers=workers, pin_memory=True)
    return train_loader, val_loader, train_ds
