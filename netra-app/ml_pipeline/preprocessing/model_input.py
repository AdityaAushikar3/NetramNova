"""
preprocessing/model_input.py
NetramNova — Centralized Preprocessing Pipeline

This module guarantees preprocessing parity across training, inference, and evaluation.
It implements the exact data transformations that the `best_classifier.pt` checkpoint
was evaluated on:
1. Circular cropping (no padding).
2. Resize to 512x512 (INTER_AREA).
3. Ben Graham local frequency subtraction (sigma=512/30 ≈ 17, no FOV mask).
4. RGB conversion.
"""

from __future__ import annotations
import cv2
import numpy as np


def crop_fundus_circle(img: np.ndarray, tol: int = 7) -> tuple[np.ndarray, int, int]:
    """
    Crops empty black background around circular retinal boundary.
    Returns: (cropped_img, x_offset, y_offset)
    """
    if img.ndim == 2:
        mask = img > tol
    else:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        mask = gray > tol
        
    if not mask.any():
        return img, 0, 0
    
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not np.any(rows) or not np.any(cols):
        return img, 0, 0
        
    ymin, ymax = np.where(rows)[0][[0, -1]]
    xmin, xmax = np.where(cols)[0][[0, -1]]
    
    return img[ymin:ymax+1, xmin:xmax+1], xmin, ymin


def prepare_model_input(img_bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray, int, int]:
    """
    Standardizes a fundus image to match the precise domain the model expects.
    
    Returns
    -------
    standardized_rgb : 512x512 RGB np.ndarray (for Albumentations and PyTorch)
    cropped_bgr      : Cropped (unresized) BGR np.ndarray (for Grad-CAM overlay & Lesion Extraction)
    x_offset         : int, horizontal crop offset
    y_offset         : int, vertical crop offset
    """
    # 1. Circular Crop
    cropped_bgr, x_offset, y_offset = crop_fundus_circle(img_bgr)
    
    # 2. Resize to 512x512 using INTER_AREA (important for downsampling)
    img_512 = cv2.resize(cropped_bgr, (512, 512), interpolation=cv2.INTER_AREA)
    
    # 3. Ben Graham Standardization (sigma=512/30, no mask)
    blurred = cv2.GaussianBlur(img_512, (0, 0), 512 / 30)
    standardized_bgr = cv2.addWeighted(img_512, 4, blurred, -4, 128)
    
    # 4. Convert to RGB for model input
    standardized_rgb = cv2.cvtColor(standardized_bgr, cv2.COLOR_BGR2RGB)
    
    return standardized_rgb, cropped_bgr, x_offset, y_offset
