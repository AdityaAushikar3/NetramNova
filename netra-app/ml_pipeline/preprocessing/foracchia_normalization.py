"""
preprocessing/foracchia_normalization.py
NetramNova — Foracchia Illumination Normalization

Implements the method from Foracchia et al. (2005):
  "Luminosity and contrast normalization in retinal images"

Key idea: fit a 2-D polynomial surface to the background illumination
(estimated from a heavily blurred version of the image), then normalize
each pixel by its local background brightness.

Formula:  I_norm(x,y) = I(x,y) / S(x,y) * mean(S)

Where S is the estimated illumination surface obtained by smoothing the
green channel (most diagnostically rich for fundus images).
"""

from __future__ import annotations
import cv2
import numpy as np


def _estimate_illumination(channel: np.ndarray,
                            kernel_frac: float = 0.15) -> np.ndarray:
    """
    Estimate the background illumination surface by Gaussian blur.

    Parameters
    ----------
    channel     : 2-D float array (single channel)
    kernel_frac : kernel size as a fraction of image width
                  (Foracchia used ~15%)
    """
    h, w = channel.shape
    ksize = int(min(h, w) * kernel_frac) | 1  # ensure odd
    ksize = max(ksize, 31)
    blurred = cv2.GaussianBlur(channel.astype(np.float32),
                               (ksize, ksize), 0)
    return blurred


def ben_graham_standardization(image_bgr: np.ndarray,
                               sigma: float = 10.0,
                               alpha: float = 4.0,
                               beta: float = -4.0,
                               gamma: float = 128.0) -> np.ndarray:
    """
    Ben Graham Color Standardization (1st Place Kaggle DR / EyePACS Standard).

    Applies local additive color standardization:
        I_std = alpha * I + beta * GaussianBlur(I, sigma) + gamma

    Parameters
    ----------
    image_bgr : uint8 BGR image
    sigma     : Gaussian blur radius (captures low-frequency camera illumination)
    alpha     : Original signal weight
    beta      : Blurry background subtraction weight
    gamma     : Re-centering offset (128 for neutral median gray)

    Returns
    -------
    uint8 BGR standardized image with uniform background and intact lesion borders.
    """
    # 1. Mask valid retinal circle
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    retinal_mask = mask > 0

    if not np.any(retinal_mask):
        return image_bgr

    # 2. Local frequency subtraction (Ben Graham formula)
    blurred = cv2.GaussianBlur(image_bgr, (0, 0), sigma)
    standardized = cv2.addWeighted(image_bgr, alpha, blurred, beta, gamma)

    # 3. Preserve black outer border
    standardized[~retinal_mask] = 0

    return np.clip(standardized, 0, 255).astype(np.uint8)


def normalize_illumination(image_bgr: np.ndarray,
                           sigma: float = 10.0) -> np.ndarray:
    """
    Adaptive Illumination Normalization entrypoint.
    Executes Ben Graham local color standardization with FOV boundary masking.
    """
    return ben_graham_standardization(image_bgr, sigma=sigma)


def apply_clahe(image_bgr: np.ndarray,
                clip_limit: float = 0.01,
                tile_grid: int = 8) -> np.ndarray:
    """
    Apply mild CLAHE (ClipLimit=0.01) to the L channel of L*a*b*.
    Low clip_limit avoids over-enhancing noise.

    Parameters
    ----------
    image_bgr  : uint8 BGR image
    clip_limit : CLAHE clip limit (0.01 = mild; 2.0 = standard)
    tile_grid  : grid tile size

    Returns
    -------
    uint8 BGR image with mild contrast enhancement.
    """
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=clip_limit,
                             tileGridSize=(tile_grid, tile_grid))
    l_enhanced = clahe.apply(l_ch)

    lab_enhanced = cv2.merge([l_enhanced, a_ch, b_ch])
    return cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)


def full_pipeline(image_bgr: np.ndarray,
                  sigma: float = 10.0) -> np.ndarray:
    """
    Standardizes fundus illumination using Ben Graham local frequency subtraction:
        I_std = 4*I - 4*GaussianBlur(I, sigma=10) + 128
    CLAHE is omitted to preserve the neutral median gray baseline and prevent noise amplification.
    """
    return normalize_illumination(image_bgr, sigma=sigma)
