"""
evaluation/gradcam.py
NetramNova — Grad-CAM Saliency Map Generator

Generates class-discriminative attention maps from EfficientNet-B2
to provide visual explainability for DR classification decisions.

Method: Gradient-weighted Class Activation Mapping (Grad-CAM)
  1. Register forward hook on the last convolutional block
  2. Register backward hook to capture gradients
  3. Compute: CAM = ReLU(sum_k(alpha_k * A_k))
     where alpha_k = global average pool of gradient for class c

Output: heatmap overlaid on original retinal image (OpenCV BGR)

Usage:
    from evaluation.gradcam import GradCAM, visualize_gradcam

    cam = GradCAM(model, target_layer=model.backbone.blocks[-1])
    heatmap = cam.generate(image_tensor, target_class=2)   # Grade 2
    overlay = visualize_gradcam(original_img_bgr, heatmap)
    cv2.imwrite("gradcam_output.jpg", overlay)
"""

from __future__ import annotations
import cv2
import numpy as np
import torch
import torch.nn as nn
from pathlib import Path


class GradCAM:
    """
    Gradient-weighted Class Activation Mapping for any CNN.

    Parameters
    ----------
    model         : trained PyTorch model (EfficientNetDRClassifier)
    target_layer  : the convolutional layer to visualize
                    (default: last conv block of EfficientNet backbone)
    """

    def __init__(self,
                 model: nn.Module,
                 target_layer: nn.Module = None):
        self.model        = model
        self.target_layer = target_layer

        self._activations: torch.Tensor | None = None
        self._gradients:   torch.Tensor | None = None
        self._hooks        = []

        if target_layer is not None:
            self._register_hooks(target_layer)

    def _register_hooks(self, layer: nn.Module) -> None:
        def fwd_hook(module, input, output):
            self._activations = output.detach()

        def bwd_hook(module, grad_in, grad_out):
            self._gradients = grad_out[0].detach()

        self._hooks.append(layer.register_forward_hook(fwd_hook))
        self._hooks.append(layer.register_full_backward_hook(bwd_hook))

    def remove_hooks(self) -> None:
        for h in self._hooks:
            h.remove()
        self._hooks.clear()

    def _auto_target_layer(self) -> nn.Module:
        """
        Automatically find the last convolutional layer in the model.
        Works for EfficientNet timm models.
        """
        # For timm EfficientNet: backbone.blocks[-1] contains the last inverted residual
        backbone = getattr(self.model, "backbone", self.model)
        if hasattr(backbone, "blocks"):
            return backbone.blocks[-1]
        # Fallback: find last Conv2d
        last_conv = None
        for module in backbone.modules():
            if isinstance(module, nn.Conv2d):
                last_conv = module
        return last_conv

    def generate(self,
                 input_tensor: torch.Tensor,
                 target_class: int | None = None) -> np.ndarray:
        """
        Generate Grad-CAM heatmap for a single image.

        Parameters
        ----------
        input_tensor : (1, 3, H, W) float32 tensor (normalized, on model device)
        target_class : ICDR grade to visualize (None = predicted class)

        Returns
        -------
        heatmap : (H, W) float32 array in [0, 1]
        """
        device = next(self.model.parameters()).device

        # Re-register if no target layer was set at init
        if not self._hooks:
            layer = self._auto_target_layer()
            self._register_hooks(layer)

        self.model.eval()
        self.model.zero_grad()

        input_tensor = input_tensor.to(device)
        input_tensor.requires_grad_(False)

        # Forward pass
        logits = self.model(input_tensor)    # (1, num_classes)

        if target_class is None:
            target_class = logits.argmax(dim=1).item()

        # Backward pass on target class score
        score = logits[0, target_class]
        self.model.zero_grad()
        score.backward()

        # Grad-CAM computation
        grads   = self._gradients       # (1, C, H, W)
        acts    = self._activations     # (1, C, H, W)

        if grads is None or acts is None:
            raise RuntimeError("Grad-CAM hooks did not capture data. "
                               "Check target_layer.")

        # Global average pool of gradients → importance weights
        weights = grads.mean(dim=(2, 3), keepdim=True)   # (1, C, 1, 1)

        # Weighted sum of activation maps
        cam = (weights * acts).sum(dim=1, keepdim=True)  # (1, 1, H, W)
        cam = torch.relu(cam)                             # ReLU
        cam = cam[0, 0].cpu().numpy()

        # Normalize to [0, 1]
        cam -= cam.min()
        if cam.max() > 0:
            cam /= cam.max()

        return cam

    def generate_for_image_path(self,
                                 img_path: str,
                                 transform,
                                 target_class: int | None = None) -> tuple:
        """
        Convenience: load image, run Grad-CAM, return (heatmap, predicted_grade).

        Returns
        -------
        (heatmap: np.ndarray, original_bgr: np.ndarray, predicted_grade: int)
        """
        img_bgr = cv2.imread(img_path)
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        tensor  = transform(image=img_rgb)["image"].unsqueeze(0)

        device = next(self.model.parameters()).device
        with torch.no_grad():
            pred = self.model(tensor.to(device)).argmax(dim=1).item()

        heatmap = self.generate(tensor, target_class or pred)
        return heatmap, img_bgr, pred


# ─── Visualization ──────────────────────────────────────────────────────────
def visualize_gradcam(image_bgr: np.ndarray,
                      heatmap: np.ndarray,
                      alpha: float = 0.45,
                      colormap: int = cv2.COLORMAP_JET) -> np.ndarray:
    """
    Overlay Grad-CAM heatmap on the original retinal image.

    Parameters
    ----------
    image_bgr : original fundus image (H, W, 3), uint8
    heatmap   : Grad-CAM map (any spatial resolution), float32 [0,1]
    alpha     : transparency of heatmap overlay
    colormap  : OpenCV colormap

    Returns
    -------
    overlay : (H, W, 3) uint8 BGR image with heatmap overlay
    """
    h, w = image_bgr.shape[:2]

    # Resize heatmap to match image
    hm_resized = cv2.resize(heatmap, (w, h), interpolation=cv2.INTER_LINEAR)

    # Apply colormap
    hm_uint8 = (hm_resized * 255).astype(np.uint8)
    hm_color = cv2.applyColorMap(hm_uint8, colormap)

    # Blend
    overlay = cv2.addWeighted(image_bgr, 1 - alpha, hm_color, alpha, 0)
    return overlay


def batch_gradcam(model: nn.Module,
                  image_dir: str,
                  output_dir: str,
                  transform,
                  target_class: int | None = None,
                  max_images: int = 50) -> None:
    """
    Generate and save Grad-CAM overlays for a directory of fundus images.

    Parameters
    ----------
    model       : trained EfficientNetDRClassifier
    image_dir   : directory containing retinal images
    output_dir  : directory to save overlays
    transform   : val_transform (albumentations, returns tensor)
    target_class: ICDR grade to highlight (None = predicted class)
    max_images  : max number of images to process
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    cam = GradCAM(model)

    extensions = {".jpg", ".jpeg", ".png", ".tif"}
    image_paths = [
        p for p in Path(image_dir).iterdir()
        if p.suffix.lower() in extensions
    ][:max_images]

    grade_labels = ["No DR", "Mild", "Moderate", "Severe", "PDR"]

    for img_path in image_paths:
        try:
            heatmap, img_bgr, pred = cam.generate_for_image_path(
                str(img_path), transform, target_class)
            overlay = visualize_gradcam(img_bgr, heatmap)

            # Annotate grade
            label = f"Grade {pred}: {grade_labels[pred]}"
            cv2.putText(overlay, label, (15, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)

            out_path = Path(output_dir) / (img_path.stem + "_gradcam.jpg")
            cv2.imwrite(str(out_path), overlay)
        except Exception as e:
            print(f"[Warning] Failed {img_path.name}: {e}")

    cam.remove_hooks()
    print(f"[Grad-CAM] Saved {len(image_paths)} overlays -> {output_dir}")
