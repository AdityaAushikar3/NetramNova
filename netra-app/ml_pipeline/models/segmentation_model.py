"""
models/segmentation_model.py
NetramNova — Dual-Backend Lesion Segmentation Model

Architecture Design Note
------------------------
Microaneurysms (MAs) are sub-pixel lesions (~10–100 microns).
A single downsampled whole-image pass through YOLOv8-Seg may miss them.
This module supports TWO interchangeable backends:

  1. YOLOv8-Seg  — Instance segmentation, good for larger lesions
                   (hemorrhages, exudates, soft exudates, optic disc)
  2. U-Net        — Semantic segmentation, patch-based option for MAs
                   (handles very small, dense lesions better)

You can benchmark both and choose per-lesion:
  - YOLOv8-Seg: HE, EX, SE, OD (larger, distinct regions)
  - U-Net: MA (tiny, requires patch-based sliding window inference)

Lesion class mapping (IDRiD):
  0: Microaneurysm (MA) — tiny red dots, early marker
  1: Haemorrhage   (HE) — blot / flame shaped
  2: Hard Exudate  (EX) — bright yellow patches
  3: Soft Exudate  (SE) — cotton wool spots (CWS)
  4: Optic Disc    (OD) — anatomical landmark

Usage:
    from models.segmentation_model import build_yolo_seg, build_unet
    model = build_unet(num_classes=5)        # U-Net backend
    model = build_yolo_seg()                 # YOLOv8-Seg backend
"""

from __future__ import annotations
import torch
import torch.nn as nn
import torch.nn.functional as F


# ─── Lesion Class Config ────────────────────────────────────────────────────
LESION_CLASSES = ["Microaneurysm", "Haemorrhage",
                  "Hard Exudate", "Soft Exudate", "Optic Disc"]
NUM_LESION_CLASSES = len(LESION_CLASSES)


# ══════════════════════════════════════════════════════════════════════════════
# Backend 1: YOLOv8-Seg Wrapper
# ══════════════════════════════════════════════════════════════════════════════

def build_yolo_seg(weights: str = "yolov8m-seg.pt",
                   num_classes: int = NUM_LESION_CLASSES) -> "YOLOv8SegWrapper":
    """
    Load a YOLOv8-Seg model for lesion segmentation.

    Parameters
    ----------
    weights    : pretrained weights ("yolov8m-seg.pt") or a fine-tuned .pt path
    num_classes: number of lesion classes (5 for IDRiD)

    Note: YOLOv8 training is handled by the ultralytics CLI / train_segmenter.py
    This wrapper is for inference only.
    """
    return YOLOv8SegWrapper(weights)


import os
from pathlib import Path

class PrismDRYoloWrapper:
    """
    Wrapper around the 4 specialized PRISM-DR YOLO object detection models.
    Loads models for MA, HE, EX, and SE from the checkpoints directory.
    """
    def __init__(self, checkpoints_dir: str):
        from ultralytics import YOLO
        import sys
        self.models = {}
        lesions = {
            "Microaneurysm": "prism_ma.pt", 
            "Haemorrhage": "prism_he.pt", 
            "Hard Exudate": "prism_ex.pt", 
            "Soft Exudate": "prism_se.pt"
        }
        for lesion_name, filename in lesions.items():
            path = os.path.join(checkpoints_dir, filename)
            if os.path.exists(path):
                print(f"[NetramNova Pipeline] Loading PRISM-DR {lesion_name} model...", file=sys.stderr)
                # Load quietly, but fuse for faster inference
                m = YOLO(path)
                m.fuse()
                self.models[lesion_name] = m
            else:
                print(f"[NetramNova Pipeline] Warning: PRISM-DR YOLO weights not found: {path}", file=sys.stderr)

    def predict_lesions(self, image_bgr) -> list[tuple[int, int, int, str, float]]:
        """
        Run prediction on a single BGR image.
        Returns: list of (cx, cy, radius, lesion_name, confidence)
        """
        results_out = []
        for lesion_name, model in self.models.items():
            res = model(image_bgr, verbose=False)[0]
            boxes = res.boxes
            if boxes is None or len(boxes) == 0:
                continue
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = box.conf[0].cpu().item()
                # If confidence is too low, we can skip it, but PRISM-DR handles thresholding internally
                if conf < 0.25:
                    continue
                cx = int((x1 + x2) / 2)
                cy = int((y1 + y2) / 2)
                radius = max(3, int(max(x2 - x1, y2 - y1) / 2))
                results_out.append((cx, cy, radius, lesion_name, conf))
        return results_out


# ══════════════════════════════════════════════════════════════════════════════
# Backend 2: U-Net (Semantic Segmentation — better for MAs)
# ══════════════════════════════════════════════════════════════════════════════

class DoubleConv(nn.Module):
    """Two consecutive Conv2d → BN → ReLU blocks."""

    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.block(x)


class UNetEncoder(nn.Module):
    def __init__(self, in_ch: int, features: list[int]):
        super().__init__()
        self.downs = nn.ModuleList()
        self.pools = nn.ModuleList()
        ch = in_ch
        for f in features:
            self.downs.append(DoubleConv(ch, f))
            self.pools.append(nn.MaxPool2d(2))
            ch = f
        self.bottleneck = DoubleConv(ch, ch * 2)
        self.out_channels = ch * 2

    def forward(self, x):
        skips = []
        for down, pool in zip(self.downs, self.pools):
            x = down(x)
            skips.append(x)
            x = pool(x)
        x = self.bottleneck(x)
        return x, skips


class UNetDecoder(nn.Module):
    def __init__(self, features: list[int]):
        super().__init__()
        self.ups   = nn.ModuleList()
        self.convs = nn.ModuleList()
        rev = list(reversed(features))
        in_ch = rev[0] * 2   # bottleneck channels
        for f in rev:
            self.ups.append(nn.ConvTranspose2d(in_ch, f, kernel_size=2, stride=2))
            self.convs.append(DoubleConv(f * 2, f))
            in_ch = f

    def forward(self, x, skips):
        for up, conv, skip in zip(self.ups, self.convs, reversed(skips)):
            x = up(x)
            if x.shape != skip.shape:
                x = F.interpolate(x, size=skip.shape[2:], mode="bilinear",
                                  align_corners=False)
            x = torch.cat([skip, x], dim=1)
            x = conv(x)
        return x


class UNet(nn.Module):
    """
    Standard U-Net for multi-class lesion segmentation.

    Recommended for: Microaneurysm detection (patch-based sliding window).
    Can also be used for all lesion classes as an alternative to YOLOv8-Seg.

    Parameters
    ----------
    in_channels  : input image channels (3 for RGB)
    num_classes  : number of output segmentation classes
    features     : feature map sizes at each encoder level
    """

    def __init__(self,
                 in_channels: int = 3,
                 num_classes: int = NUM_LESION_CLASSES,
                 features: list[int] = [64, 128, 256, 512]):
        super().__init__()
        self.encoder = UNetEncoder(in_channels, features)
        self.decoder = UNetDecoder(features)
        self.final   = nn.Conv2d(features[0], num_classes, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Parameters
        ----------
        x : (B, 3, H, W) float32

        Returns
        -------
        logits : (B, num_classes, H, W) — raw logits, apply sigmoid per class
        """
        enc, skips = self.encoder(x)
        dec = self.decoder(enc, skips)
        return self.final(dec)

    def predict_masks(self, x: torch.Tensor,
                      threshold: float = 0.5) -> torch.Tensor:
        """
        Convenience: return binary masks (B, C, H, W) after sigmoid + threshold.
        """
        with torch.no_grad():
            logits = self.forward(x)
        return (torch.sigmoid(logits) > threshold).float()


def build_unet(num_classes: int = NUM_LESION_CLASSES,
               features: list[int] = [64, 128, 256, 512]) -> UNet:
    """Instantiate a standard U-Net segmentation model."""
    return UNet(in_channels=3, num_classes=num_classes, features=features)


# ─── Patch-based MA Detection Utility ───────────────────────────────────────

def sliding_window_inference(model: UNet,
                             image: torch.Tensor,
                             patch_size: int = 256,
                             stride: int = 128,
                             device: torch.device = None) -> torch.Tensor:
    """
    Run U-Net inference on overlapping patches for small lesion detection.

    Particularly important for microaneurysms (sub-pixel at 512×512).
    Uses a Gaussian weight map to blend overlapping predictions.

    Parameters
    ----------
    model      : trained UNet
    image      : (1, 3, H, W) or (3, H, W) float32 tensor
    patch_size : square patch size
    stride     : sliding step (overlap = patch_size - stride)
    device     : target device

    Returns
    -------
    full_pred : (1, num_classes, H, W) float32 probability map
    """
    if device is None:
        device = next(model.parameters()).device

    if image.dim() == 3:
        image = image.unsqueeze(0)

    _, C, H, W = image.shape
    num_classes = model.final.out_channels

    pred_sum    = torch.zeros(1, num_classes, H, W, device=device)
    weight_sum  = torch.zeros(1, 1, H, W, device=device)

    # Gaussian weight kernel for smooth blending
    from scipy.signal.windows import gaussian as gauss_window
    import numpy as np
    g1d = gauss_window(patch_size, std=patch_size // 8)
    g2d = np.outer(g1d, g1d)
    kernel = torch.tensor(g2d, dtype=torch.float32, device=device)
    kernel = kernel.unsqueeze(0).unsqueeze(0)   # (1,1,P,P)

    model.eval()
    with torch.no_grad():
        for y in range(0, H - patch_size + 1, stride):
            for x in range(0, W - patch_size + 1, stride):
                patch = image[:, :, y:y+patch_size, x:x+patch_size].to(device)
                logits = model(patch)   # (1, C, P, P)
                probs  = torch.sigmoid(logits)
                pred_sum[:, :, y:y+patch_size, x:x+patch_size] += probs * kernel
                weight_sum[:, :, y:y+patch_size, x:x+patch_size] += kernel

    return pred_sum / (weight_sum + 1e-7)
