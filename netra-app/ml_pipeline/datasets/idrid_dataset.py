"""
datasets/idrid_dataset.py
NetramNova — IDRiD (Indian Diabetic Retinopathy Image Dataset) Loader

IDRiD provides two sub-tasks:
  A. Segmentation: pixel-level lesion masks + optic disc
  B. Disease Grading: ICDR grade 0-4 + risk of macular edema 0-2

Dataset structure (after download):
  data/IDRiD/
    A. Segmentation/
      1. Original Images/
        a. Training Set/    (IDRiD_01.jpg ... IDRiD_54.jpg)
        b. Testing Set/
      2. All Segmentation Groundtruths/
        a. Training Set/
          1. Microaneurysms/      (IDRiD_01_MA.tif ...)
          2. Haemorrhages/        (IDRiD_01_HE.tif ...)
          3. Hard Exudates/       (IDRiD_01_EX.tif ...)
          4. Soft Exudates/       (IDRiD_01_SE.tif ...)
          5. Optic Disc/          (IDRiD_01_OD.tif ...)
    B. Disease Grading/
      1. Original Images/
        a. Training Set/
        b. Testing Set/
      2. Groundtruths/
        a. IDRiD_Disease Grading_Training Labels.csv
        b. IDRiD_Disease Grading_Testing Labels.csv
    C. Optic Disc Center Location/
      1. Groundtruths/
        IDRiD_OD_Center_Cropping_Training.xlsx  (Image No, X-Coordinate, Y-Coordinate)
"""

from __future__ import annotations
import os
import cv2
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from preprocessing.foracchia_normalization import full_pipeline
from preprocessing.augmentation import (get_train_transforms,
                                        get_val_transforms,
                                        get_seg_train_transforms)

# ─── Lesion class mapping ────────────────────────────────────────────────────
LESION_CLASSES = {
    "MA": "1. Microaneurysms",
    "HE": "2. Haemorrhages",
    "EX": "3. Hard Exudates",
    "SE": "4. Soft Exudates",
    "OD": "5. Optic Disc",
}
CLASS_INDEX = {k: i for i, k in enumerate(LESION_CLASSES)}


# ─── Disease Grading Dataset ────────────────────────────────────────────────
class IDRiDGradingDataset(Dataset):
    """
    Dataset for IDRiD Task B: DR Grade classification.

    CSV columns: Image name | Retinopathy grade | Risk of macular edema
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

        # Normalise column names
        self.df.columns = [c.strip() for c in self.df.columns]
        # Column: "Retinopathy grade"
        self.grade_col = [c for c in self.df.columns
                          if "retinopathy" in c.lower()][0]
        self.name_col  = [c for c in self.df.columns
                          if "image" in c.lower()][0]

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        row = self.df.iloc[idx]
        img_name = str(row[self.name_col]).strip()
        # IDRiD images may be .jpg or without extension in CSV
        for ext in [".jpg", ".JPG", ".png", ""]:
            p = os.path.join(self.image_dir, img_name + ext)
            if os.path.exists(p):
                img_path = p
                break
        else:
            img_path = os.path.join(self.image_dir, img_name)

        img = cv2.imread(img_path)
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

        label = int(row[self.grade_col])
        return img, label


# ─── Segmentation Dataset ───────────────────────────────────────────────────
class IDRiDSegDataset(Dataset):
    """
    Dataset for IDRiD Task A: Lesion Segmentation.

    Loads one retinal image + up to 5 binary lesion masks.
    Returns image tensor + combined multi-class mask.
    """

    def __init__(self,
                 image_dir: str,
                 mask_root: str,
                 transform=None,
                 preprocess: bool = True):
        """
        Parameters
        ----------
        image_dir : path to training images
        mask_root : path to the parent folder containing 1.Microaneurysms, 2.Haemorrhages ...
        """
        self.image_dir  = image_dir
        self.mask_root  = mask_root
        self.transform  = transform
        self.preprocess = preprocess

        self.image_files = sorted([
            f for f in os.listdir(image_dir)
            if f.lower().endswith((".jpg", ".png", ".tif"))
        ])

    def __len__(self) -> int:
        return len(self.image_files)

    def _load_mask(self, stem: str, lesion_key: str) -> np.ndarray:
        """Load a single lesion binary mask (returns zeros if missing)."""
        folder = os.path.join(self.mask_root, LESION_CLASSES[lesion_key])
        # Naming convention: IDRiD_XX_MA.tif
        mask_name = f"{stem}_{lesion_key}.tif"
        path = os.path.join(folder, mask_name)
        if not os.path.exists(path):
            return None
        mask = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        return (mask > 127).astype(np.uint8) if mask is not None else None

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        fname = self.image_files[idx]
        stem  = os.path.splitext(fname)[0]    # e.g. IDRiD_01
        img_path = os.path.join(self.image_dir, fname)

        img = cv2.imread(img_path)
        if img is None:
            img = np.zeros((512, 512, 3), dtype=np.uint8)

        h, w = img.shape[:2]

        if self.preprocess:
            img = full_pipeline(img)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Build combined mask: shape (H, W, num_classes)
        masks = []
        for key in LESION_CLASSES:
            m = self._load_mask(stem, key)
            if m is None:
                m = np.zeros((h, w), dtype=np.uint8)
            m = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
            masks.append(m)
        combined_mask = np.stack(masks, axis=-1)  # (H, W, 5)

        if self.transform:
            mask_list = [combined_mask[:, :, c] for c in range(len(LESION_CLASSES))]
            aug = self.transform(image=img, masks=mask_list)
            img = aug["image"]
            aug_masks = np.stack(aug["masks"], axis=0)  # (5, H, W)
            mask_tensor = torch.from_numpy(aug_masks).float()
        else:
            mask_tensor = torch.from_numpy(
                combined_mask.transpose(2, 0, 1)).float()

        return img, mask_tensor


# ─── Optic Disc Localization Dataset ────────────────────────────────────────
class IDRiDLocalizationDataset(Dataset):
    """
    Dataset for Optic Disc (and implicitly Fovea) localization.
    Labels are normalised (x/W, y/H) coordinates.
    """

    def __init__(self,
                 coord_file: str,
                 image_dir: str,
                 transform=None,
                 preprocess: bool = True):
        # Excel file: Image No | X-Coordinate | Y-Coordinate
        self.df = pd.read_excel(coord_file)
        self.df.columns = [c.strip() for c in self.df.columns]
        self.image_dir  = image_dir
        self.transform  = transform
        self.preprocess = preprocess

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        row = self.df.iloc[idx]
        img_no = int(row[self.df.columns[0]])
        img_name = f"IDRiD_{img_no:02d}.jpg"
        img_path = os.path.join(self.image_dir, img_name)

        img = cv2.imread(img_path)
        if img is None:
            img = np.zeros((2848, 4288, 3), dtype=np.uint8)  # IDRiD native res

        h, w = img.shape[:2]

        if self.preprocess:
            img = full_pipeline(img)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        if self.transform:
            img = self.transform(image=img)["image"]

        # Normalise coordinates to [0, 1]
        x_norm = float(row[self.df.columns[1]]) / w
        y_norm = float(row[self.df.columns[2]]) / h
        coords = torch.tensor([x_norm, y_norm], dtype=torch.float32)
        return img, coords
