"""
models/localization_model.py
NetramNova — Optic Disc & Fovea Localization Model

Separate from EfficientNet (which ONLY classifies DR severity).
This model performs anatomical landmark detection:
  - Optic Disc (OD) center: (x, y)
  - Fovea center: (x, y)  [optional, if ground truth available]

Architecture:
  - Backbone: EfficientNet-B0 (lightweight, fast inference)
  - Head:     Linear regression → (x_norm, y_norm) in [0, 1]

These coordinates are later used by:
  - CSME Foveal Proximity Engine (< 1 disc diameter from fovea)
  - ETDRS 4-2-1 quadrant rule engine

Training data: IDRiD Task C (OD center coordinates)

Usage:
    from models.localization_model import OdFoveaLocalizer, build_localizer
    model = build_localizer(cfg)
    coords = model(image_tensor)   # shape: (B, 2) [x_norm, y_norm]
"""

from __future__ import annotations
import torch
import torch.nn as nn
import timm
import math


class OdFoveaLocalizer(nn.Module):
    """
    EfficientNet-B0 regression model for OD/Fovea center localization.

    Outputs 2 normalized coordinates per image: (x_norm, y_norm) in [0,1].
    For combined OD + Fovea prediction, set num_outputs=4.

    Parameters
    ----------
    arch        : timm model name
    pretrained  : load ImageNet weights
    num_outputs : 2 (OD only) or 4 (OD + Fovea)
    """

    def __init__(self,
                 arch: str = "tf_efficientnet_b0",
                 pretrained: bool = True,
                 num_outputs: int = 2):
        super().__init__()
        self.backbone = timm.create_model(arch, pretrained=pretrained,
                                          num_classes=0)
        in_features = self.backbone.num_features

        self.regressor = nn.Sequential(
            nn.Dropout(0.2),
            nn.Linear(in_features, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.1),
            nn.Linear(256, num_outputs),
            nn.Sigmoid(),    # coordinates in [0, 1]
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feats = self.backbone.forward_features(x)       # (B, C, H, W)
        pooled = feats.mean(dim=(-2, -1))               # (B, C)
        return self.regressor(pooled)                   # (B, num_outputs)


def build_localizer(cfg: dict) -> tuple:
    """
    Build localization model, optimizer, and scheduler.

    Returns
    -------
    model, optimizer, scheduler
    """
    loc_cfg = cfg.get("localization", {})
    arch    = loc_cfg.get("arch", "tf_efficientnet_b0")
    lr      = loc_cfg.get("learning_rate", 2e-4)
    epochs  = loc_cfg.get("epochs", 30)

    model     = OdFoveaLocalizer(arch=arch)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)

    # Cosine decay
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=epochs, eta_min=1e-6)

    return model, optimizer, scheduler


def euclidean_distance_loss(pred: torch.Tensor,
                             target: torch.Tensor) -> torch.Tensor:
    """
    Euclidean distance between predicted and ground-truth normalized coordinates.
    Used instead of MSE so the loss has geometric meaning (pixels after denorm).
    """
    return torch.sqrt(((pred - target) ** 2).sum(dim=-1) + 1e-8).mean()
