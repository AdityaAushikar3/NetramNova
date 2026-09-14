"""
models/efficientnet_classifier.py
NetramNova — EfficientNet-B2 DR Severity Classifier

Architecture:
  - Backbone: EfficientNet-B2 (pretrained on ImageNet via timm)
  - Head:     Dropout → Linear(1408 → 512) → ReLU → Dropout → Linear(512 → 5)
  - Task:     Multi-class classification, ICDR Grades 0–4

This is a single-task model. It does NOT perform:
  - Lesion segmentation (YOLOv8 / U-Net)
  - Optic disc / fovea localization (separate CV module)
  - Grad-CAM (computed externally in evaluation/gradcam.py)

ICDR Grade Reference:
  0 = No DR          (screen 2 years)
  1 = Mild NPDR      (screen 1 year)
  2 = Moderate NPDR  (refer — referable DR threshold)
  3 = Severe NPDR    (refer urgently)
  4 = PDR            (refer urgently + laser/anti-VEGF)

Usage:
    from models.efficientnet_classifier import build_classifier
    model, optimizer, scheduler = build_classifier(cfg)
"""

from __future__ import annotations
import math
import torch
import torch.nn as nn
import timm


NUM_CLASSES = 5

# timm model names for EfficientNet variants
ARCH_MAP = {
    "b0": "tf_efficientnet_b0",
    "b2": "tf_efficientnet_b2",
    "b4": "tf_efficientnet_b4",
}


class EfficientNetDRClassifier(nn.Module):
    """
    EfficientNet-B2 adapted for 5-class DR severity classification.

    Parameters
    ----------
    arch       : timm model name, e.g. "tf_efficientnet_b2"
    num_classes: number of output classes (5 for ICDR 0–4)
    pretrained : load ImageNet weights
    dropout    : dropout probability before classification head
    """

    def __init__(self,
                 arch: str = "tf_efficientnet_b2",
                 num_classes: int = NUM_CLASSES,
                 pretrained: bool = True,
                 dropout: float = 0.3):
        super().__init__()

        self.backbone = timm.create_model(arch,
                                          pretrained=pretrained,
                                          num_classes=0)   # remove default head
        in_features = self.backbone.num_features

        # Classifier head applied AFTER global avg pooling in forward()
        self.head = nn.Sequential(
            nn.Dropout(p=dropout),
            nn.Linear(in_features, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout / 2),
            nn.Linear(512, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Extract features via backbone (returns spatial feature map)
        features = self.backbone.forward_features(x)   # (B, C, H, W)
        # Global average pool → (B, C)
        pooled = features.mean(dim=(-2, -1))
        # Classification head
        return self.head(pooled)


def build_classifier(cfg: dict) -> tuple:
    """
    Instantiate model, optimizer, and LR scheduler from config.

    Returns
    -------
    model, optimizer, scheduler
    """
    clf_cfg = cfg["classifier"]
    arch    = clf_cfg.get("arch", "tf_efficientnet_b2")
    lr      = clf_cfg.get("learning_rate", 3e-4)
    wd      = clf_cfg.get("weight_decay", 1e-4)
    dropout = clf_cfg.get("dropout", 0.3)
    epochs  = clf_cfg.get("epochs", 40)
    warmup  = clf_cfg.get("warmup_epochs", 3)

    model = EfficientNetDRClassifier(arch=arch, dropout=dropout)

    # Separate backbone and head LRs (smaller LR for pretrained backbone)
    backbone_params = list(model.backbone.parameters())
    head_params     = list(model.head.parameters())

    optimizer = torch.optim.AdamW([
        {"params": backbone_params, "lr": lr * 0.1},
        {"params": head_params,     "lr": lr},
    ], weight_decay=wd)

    # Cosine annealing with linear warmup (minimum floor 0.01 to prevent zero LR)
    def warmup_lambda(epoch: int) -> float:
        if epoch < warmup:
            return (epoch + 1) / warmup
        progress = (epoch - warmup) / max(1, epochs - warmup)
        return max(0.01, 0.5 * (1.0 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda=warmup_lambda)

    return model, optimizer, scheduler


def load_checkpoint(model: nn.Module,
                    checkpoint_path: str,
                    device: torch.device) -> dict:
    try:
        ckpt = torch.load(checkpoint_path, map_location=device, weights_only=True)
    except Exception:
        ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)

    if isinstance(ckpt, dict):
        if "model_state_dict" in ckpt:
            state_dict = ckpt["model_state_dict"]
        elif "model_state" in ckpt:
            state_dict = ckpt["model_state"]
        elif "state_dict" in ckpt:
            state_dict = ckpt["state_dict"]
        else:
            state_dict = ckpt
    else:
        state_dict = ckpt

    # Handle 'module.' prefix if saved from DataParallel
    cleaned_state_dict = {}
    for k, v in state_dict.items():
        clean_k = k.replace("module.", "")
        cleaned_state_dict[clean_k] = v

    model.load_state_dict(cleaned_state_dict, strict=False)
    print(f"[Model] Loaded checkpoint: {checkpoint_path}")
    if isinstance(ckpt, dict):
        val_auc = ckpt.get("val_auc", ckpt.get("auc"))
        auc_str = f"{val_auc:.4f}" if isinstance(val_auc, (int, float)) else str(val_auc or "?")
        val_kappa = ckpt.get("best_qwk", ckpt.get("val_kappa", ckpt.get("qwk")))
        kappa_str = f"{val_kappa:.4f}" if isinstance(val_kappa, (int, float)) else str(val_kappa or "?")
        print(f"        Epoch {ckpt.get('epoch', '?')}, Val AUC: {auc_str}, Val QWK: {kappa_str}")
    return ckpt if isinstance(ckpt, dict) else {"model_state_dict": ckpt}

