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
    import logging
    logger = logging.getLogger(__name__)

    if img.ndim == 2:
        mask = (img > tol).astype(np.uint8) * 255
    else:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        mask = (gray > tol).astype(np.uint8) * 255
        
    if not mask.any():
        return img, 0, 0
    
    # Try largest contour circle fit
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        largest_contour = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest_contour)
        
        # Only use if it's reasonably large (e.g., > 10% of image area)
        if area > (img.shape[0] * img.shape[1] * 0.1):
            (cx, cy), radius = cv2.minEnclosingCircle(largest_contour)
            cx, cy, radius = int(cx), int(cy), int(radius)
            
            # Bound check
            xmin = max(0, cx - radius)
            xmax = min(img.shape[1] - 1, cx + radius)
            ymin = max(0, cy - radius)
            ymax = min(img.shape[0] - 1, cy + radius)
            
            logger.info("crop_fundus_circle: Used largest-contour circle fit.")
            return img[ymin:ymax+1, xmin:xmax+1], xmin, ymin

    # Fallback to simple rectangular bounding box of mask
    rows = np.any(mask > 0, axis=1)
    cols = np.any(mask > 0, axis=0)
    if not np.any(rows) or not np.any(cols):
        return img, 0, 0
        
    ymin, ymax = np.where(rows)[0][[0, -1]]
    xmin, xmax = np.where(cols)[0][[0, -1]]
    
    logger.info("crop_fundus_circle: Used fallback rectangular bounding box.")
    return img[ymin:ymax+1, xmin:xmax+1], xmin, ymin


from dataclasses import dataclass

@dataclass
class PreparedImage:
    cropped_bgr: np.ndarray
    pre_ben_graham_512: np.ndarray
    standardized_rgb: np.ndarray
    x_offset: int
    y_offset: int

def prepare_model_input(img_bgr: np.ndarray) -> PreparedImage:
    """
    Standardizes a fundus image to match the precise domain the model expects.
    
    Returns
    -------
    PreparedImage dataclass containing all necessary image states.
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
    
    return PreparedImage(
        cropped_bgr=cropped_bgr,
        pre_ben_graham_512=img_512,
        standardized_rgb=standardized_rgb,
        x_offset=x_offset,
        y_offset=y_offset
    )
