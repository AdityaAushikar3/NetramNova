"""
preprocessing/augmentation.py
NetramNova — Albumentations-based training augmentation pipeline.

Designed for retinal fundus images:
  - Aggressive geometric + photometric augmentations for training
  - Minimal augmentation for validation (resize + normalize only)

Usage:
    from augmentation import get_train_transforms, get_val_transforms

    transform = get_train_transforms(image_size=512)
    augmented = transform(image=img_array)["image"]
"""

from __future__ import annotations
import albumentations as A
from albumentations.pytorch import ToTensorV2


def get_train_transforms(image_size: int = 512) -> A.Compose:
    """
    Full augmentation pipeline for training splits.

    Includes:
    - Random horizontal/vertical flip
    - Random rotation (±30 degrees)
    - RandomBrightnessContrast (subtle photometric variation)
    - HueSaturationValue (simulate camera variability)
    - GridDistortion (simulate lens distortion in portable fundus cameras)
    - CoarseDropout (occlusion robustness)
    - Normalize with ImageNet mean/std (compatible with pretrained timm models)
    - ToTensorV2
    """
    return A.Compose([
        A.Resize(image_size, image_size),

        # Geometric: Full 360-degree retinal rotation & flip invariance
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.5),
        A.RandomRotate90(p=0.5),
        A.Rotate(limit=180, p=0.7, border_mode=0),
        A.Affine(scale=(0.92, 1.08), translate_percent=(-0.04, 0.04),
                 rotate=0, p=0.3),

        # Lens / optical distortion (portable camera artifacts)
        A.GridDistortion(num_steps=5, distort_limit=0.10, p=0.25),

        # Photometric (Luminance & Sharpness only — HUE IS PRESERVED to protect lesion pathology)
        A.RandomBrightnessContrast(brightness_limit=0.12,
                                    contrast_limit=0.12, p=0.5),
        A.GaussNoise(p=0.25),
        A.GaussianBlur(blur_limit=(3, 5), p=0.2),

        # Normalize (ImageNet stats — matches pretrained EfficientNet)
        A.Normalize(mean=(0.485, 0.456, 0.406),
                    std=(0.229, 0.224, 0.225)),
        ToTensorV2(),
    ])


def get_val_transforms(image_size: int = 512) -> A.Compose:
    """
    Minimal transforms for validation / test splits.
    Only resize + normalize — NO random augmentation.
    """
    return A.Compose([
        A.Resize(image_size, image_size),
        A.Normalize(mean=(0.485, 0.456, 0.406),
                    std=(0.229, 0.224, 0.225)),
        ToTensorV2(),
    ])


def get_seg_train_transforms(image_size: int = 512) -> A.Compose:
    """
    Augmentation pipeline for segmentation training (YOLOv8/U-Net).
    Includes mask-aware augmentations using albumentations A.Compose
    with additional_targets={"mask": "mask"}.
    """
    return A.Compose([
        A.Resize(image_size, image_size),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.3),
        A.Rotate(limit=30, p=0.5, border_mode=0),
        A.RandomBrightnessContrast(0.1, 0.1, p=0.4),
        A.HueSaturationValue(8, 15, 8, p=0.3),
        A.GaussNoise(p=0.2),
        A.Normalize(mean=(0.485, 0.456, 0.406),
                    std=(0.229, 0.224, 0.225)),
        ToTensorV2(),
    ], additional_targets={"mask": "mask"})
