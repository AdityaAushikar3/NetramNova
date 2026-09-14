"""
datasets/eyepacs_dataset.py
NetramNova — EyePACS Dataset Loader

EyePACS is the largest public DR screening dataset (~88k images).
Originally released for the 2015 Kaggle DR Detection Challenge.

Dataset structure:
  data/eyepacs/
    trainLabels.csv   (image, level: 0-4)
    train/            (.jpeg images, named by patient/eye/visit)
    sampleSubmission.csv (for test set)

Notes:
  - Images vary in size and quality (real clinical data)
  - Heavy class imbalance: ~73% Grade 0
  - Many images are very low quality → run quality gate first
  - Recommended: sample at most 20k Grade 0 to balance training

Usage:
    ds = EyePACSDataset("data/eyepacs/trainLabels.csv",
                        "data/eyepacs/train",
                        transform=get_train_transforms(512),
                        max_grade0=15000)
"""

from __future__ import annotations
import os
import cv2
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset
from sklearn.model_selection import train_test_split

from preprocessing.foracchia_normalization import full_pipeline
from preprocessing.augmentation import get_train_transforms, get_val_transforms

NUM_CLASSES = 5


class EyePACSDataset(Dataset):
    """
    PyTorch Dataset for EyePACS retinal images.

    Parameters
    ----------
    csv_path   : path to trainLabels.csv
    image_dir  : folder containing .jpeg images
    transform  : albumentations transform
    max_grade0 : cap Grade 0 samples to reduce imbalance
    preprocess : apply Foracchia + CLAHE
    """

    def __init__(self,
                 csv_path: str,
                 image_dir: str,
                 transform=None,
                 max_grade0: int = 15000,
                 preprocess: bool = True):
        df = pd.read_csv(csv_path)
        df.columns = [c.strip().lower() for c in df.columns]

        # Subsample Grade 0 to reduce imbalance
        grade0 = df[df["level"] == 0]
        rest   = df[df["level"] != 0]
        if max_grade0 and len(grade0) > max_grade0:
            grade0 = grade0.sample(n=max_grade0, random_state=42)
        self.df = pd.concat([grade0, rest]).reset_index(drop=True)

        self.image_dir  = image_dir
        self.transform  = transform
        self.preprocess = preprocess

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        row = self.df.iloc[idx]
        name = str(row["image"]).strip()

        # Try .jpeg and .jpg extensions
        img_path = None
        for ext in [".jpeg", ".jpg", ".png", ""]:
            p = os.path.join(self.image_dir, name + ext)
            if os.path.exists(p):
                img_path = p
                break

        img = cv2.imread(img_path) if img_path else None
        if img is None:
            img = np.zeros((512, 512, 3), dtype=np.uint8)
        else:
            if img.shape[0] > 512 or img.shape[1] > 512:
                img = cv2.resize(img, (512, 512), interpolation=cv2.INTER_AREA)

        if self.preprocess:
            img = full_pipeline(img)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        if self.transform:
            img = self.transform(image=img)["image"]

        label = int(row["level"])
        return img, label

    def class_counts(self) -> np.ndarray:
        return np.bincount(self.df["level"].values, minlength=NUM_CLASSES)


def get_class_weights(dataset: EyePACSDataset) -> torch.Tensor:
    """Inverse frequency class weights for weighted CrossEntropyLoss."""
    counts = dataset.class_counts().astype(np.float32)
    counts = np.maximum(counts, 1)
    weights = 1.0 / counts
    weights = weights / weights.sum() * NUM_CLASSES
    return torch.tensor(weights, dtype=torch.float32)


def build_loaders(cfg: dict) -> tuple:
    """
    Build train/val DataLoaders for EyePACS.

    Parameters
    ----------
    cfg : merged config dict with dataset and classifier settings
    """
    from torch.utils.data import DataLoader

    # Stratified 80/20 split
    df = pd.read_csv(cfg["train_csv"])
    df.columns = [c.strip().lower() for c in df.columns]
    train_df, val_df = train_test_split(
        df, test_size=0.2, stratify=df["level"], random_state=42
    )
    os.makedirs("outputs/tmp", exist_ok=True)
    train_csv_tmp = "outputs/tmp/eyepacs_train.csv"
    val_csv_tmp   = "outputs/tmp/eyepacs_val.csv"
    train_df.to_csv(train_csv_tmp, index=False)
    val_df.to_csv(val_csv_tmp, index=False)

    img_size  = cfg.get("image_size", 512)
    grade0_cap = cfg.get("max_grade0_eyepacs", 15000)

    train_ds = EyePACSDataset(train_csv_tmp, cfg["image_dir"],
                              transform=get_train_transforms(img_size),
                              max_grade0=grade0_cap)
    val_ds   = EyePACSDataset(val_csv_tmp,   cfg["image_dir"],
                              transform=get_val_transforms(img_size),
                              max_grade0=99999)

    workers = 0 if os.name == "nt" else 4
    train_loader = DataLoader(train_ds, batch_size=cfg["batch_size"],
                              shuffle=True,  num_workers=workers, pin_memory=True)
    val_loader   = DataLoader(val_ds,   batch_size=cfg["batch_size"],
                              shuffle=False, num_workers=workers, pin_memory=True)
    return train_loader, val_loader, train_ds
