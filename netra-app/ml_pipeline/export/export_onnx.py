"""
export/export_onnx.py
NetramNova — PyTorch → ONNX Export for Edge Deployment

Exports trained models to ONNX format for ONNX Runtime inference.
ONNX Runtime is the primary offline CPU edge deployment engine
for PHC (Primary Healthcare Centre) laptops.

Supported exports:
  1. DR Classifier (EfficientNet-B2) → classifier.onnx
  2. Lesion Segmenter (U-Net)        → unet_segmenter.onnx
  3. OD Localizer (EfficientNet-B0)  → od_localizer.onnx

Verification: re-runs inference via onnxruntime and checks output matches
PyTorch output within tolerance.

Usage:
    cd ml_pipeline
    python export/export_onnx.py --config config.yaml --model all

    # Individual exports:
    python export/export_onnx.py --model classifier \\
        --checkpoint outputs/checkpoints/best_classifier.pt
"""

from __future__ import annotations
import os
import sys

# Prevent OpenMP runtime collision on Windows machines
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import argparse
import yaml
from pathlib import Path

import torch
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))


# ─── Argument Parsing ───────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(description="Export NetramNova Models to ONNX")
    p.add_argument("--config", default="config.yaml")
    p.add_argument("--model",  choices=["classifier", "unet", "localizer", "all"],
                   default="all")
    p.add_argument("--checkpoint",    default=None, help="Override checkpoint path")
    p.add_argument("--output-dir",    default=None, help="Override ONNX output dir")
    p.add_argument("--opset",         type=int, default=17)
    p.add_argument("--quantize",      action="store_true",
                   help="Apply INT8 post-training quantization after export")
    return p.parse_args()


# ─── ONNX Export Helper ─────────────────────────────────────────────────────
def export_model(model: torch.nn.Module,
                 dummy_input: torch.Tensor,
                 output_path: str,
                 input_names: list[str],
                 output_names: list[str],
                 opset_version: int = 17,
                 dynamic_axes: dict | None = None) -> None:
    """
    Export a PyTorch model to ONNX.

    Parameters
    ----------
    model         : PyTorch model in eval mode
    dummy_input   : example input tensor
    output_path   : path to save .onnx file
    input_names   : list of ONNX input node names
    output_names  : list of ONNX output node names
    opset_version : ONNX opset (17 recommended)
    dynamic_axes  : dict for dynamic batch / spatial axes
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    model.eval()

    if dynamic_axes is None:
        dynamic_axes = {
            input_names[0]: {0: "batch_size"},
            output_names[0]: {0: "batch_size"},
        }

    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=opset_version,
        do_constant_folding=True,
        input_names=input_names,
        output_names=output_names,
        dynamic_axes=dynamic_axes,
        verbose=False,
    )
    size_mb = os.path.getsize(output_path) / 1_000_000
    print(f"  [Export] Saved -> {output_path} ({size_mb:.1f} MB)")


def verify_onnx(onnx_path: str,
                dummy_input: torch.Tensor,
                pytorch_output: torch.Tensor,
                rtol: float = 1e-3,
                atol: float = 1e-4) -> bool:
    """
    Run inference with onnxruntime and verify it matches PyTorch output.
    """
    try:
        import onnxruntime as ort
        import onnx

        onnx_model = onnx.load(onnx_path)
        onnx.checker.check_model(onnx_model)

        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        sess = ort.InferenceSession(onnx_path, providers=providers)
        input_name = sess.get_inputs()[0].name
        ort_out = sess.run(None, {input_name: dummy_input.cpu().numpy()})

        pt_np  = pytorch_output.detach().cpu().numpy()
        ort_np = ort_out[0]

        match = np.allclose(pt_np, ort_np, rtol=rtol, atol=atol)
        if match:
            print(f"  [Verify] PASS -- PyTorch vs ONNX Runtime outputs match")
        else:
            max_diff = np.abs(pt_np - ort_np).max()
            print(f"  [Verify] WARN -- Max diff: {max_diff:.6f} "
                  f"(rtol={rtol}, atol={atol})")
        return match

    except ImportError:
        print("  [Verify] Skipped (install onnx and onnxruntime)")
        return False
    except Exception as e:
        print(f"  [Verify] Failed: {e}")
        return False


# ─── Individual Model Exporters ─────────────────────────────────────────────
def _extract_state_dict(ckpt_path: str) -> dict:
    try:
        ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=True)
    except Exception:
        ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    if isinstance(ckpt, dict):
        if "model_state_dict" in ckpt:
            sd = ckpt["model_state_dict"]
        elif "model_state" in ckpt:
            sd = ckpt["model_state"]
        elif "state_dict" in ckpt:
            sd = ckpt["state_dict"]
        else:
            sd = ckpt
    else:
        sd = ckpt
    return {k.replace("module.", ""): v for k, v in sd.items()}


def export_classifier(cfg: dict, checkpoint_path: str,
                       output_dir: str, opset: int) -> None:
    from models.efficientnet_classifier import EfficientNetDRClassifier

    print("\n[1/3] Exporting DR Classifier (EfficientNet-B2)...")
    arch    = cfg["classifier"].get("arch", "tf_efficientnet_b2")
    img_sz  = cfg["classifier"].get("image_size", 512)

    model = EfficientNetDRClassifier(arch=arch, pretrained=False)
    model.load_state_dict(_extract_state_dict(checkpoint_path), strict=False)
    model.eval()

    dummy = torch.randn(1, 3, img_sz, img_sz)
    with torch.no_grad():
        pt_out = model(dummy)

    onnx_path = os.path.join(output_dir, "classifier.onnx")
    export_model(model, dummy, onnx_path,
                 input_names=["fundus_image"],
                 output_names=["dr_grade_logits"],
                 opset_version=opset,
                 dynamic_axes={"fundus_image":     {0: "batch"},
                               "dr_grade_logits":  {0: "batch"}})
    verify_onnx(onnx_path, dummy, pt_out)


def export_unet_segmenter(cfg: dict, checkpoint_path: str,
                           output_dir: str, opset: int) -> None:
    from models.segmentation_model import build_unet

    print("\n[2/3] Exporting U-Net Segmenter...")
    model = build_unet()
    model.load_state_dict(_extract_state_dict(checkpoint_path), strict=False)
    model.eval()

    dummy = torch.randn(1, 3, 512, 512)
    with torch.no_grad():
        pt_out = model(dummy)

    onnx_path = os.path.join(output_dir, "unet_segmenter.onnx")
    export_model(model, dummy, onnx_path,
                 input_names=["fundus_image"],
                 output_names=["lesion_logits"],
                 opset_version=opset,
                 dynamic_axes={"fundus_image":   {0: "batch"},
                               "lesion_logits":  {0: "batch"}})
    verify_onnx(onnx_path, dummy, pt_out)


def export_localizer(cfg: dict, checkpoint_path: str,
                      output_dir: str, opset: int) -> None:
    from models.localization_model import OdFoveaLocalizer

    print("\n[3/3] Exporting OD/Fovea Localizer...")
    arch  = cfg.get("localization", {}).get("arch", "tf_efficientnet_b0")
    model = OdFoveaLocalizer(arch=arch, pretrained=False)
    model.load_state_dict(_extract_state_dict(checkpoint_path), strict=False)
    model.eval()

    dummy = torch.randn(1, 3, 512, 512)
    with torch.no_grad():
        pt_out = model(dummy)

    onnx_path = os.path.join(output_dir, "od_localizer.onnx")
    export_model(model, dummy, onnx_path,
                 input_names=["fundus_image"],
                 output_names=["od_coordinates"],
                 opset_version=opset,
                 dynamic_axes={"fundus_image":   {0: "batch"},
                               "od_coordinates": {0: "batch"}})
    verify_onnx(onnx_path, dummy, pt_out)


# ─── INT8 Quantization (optional) ──────────────────────────────────────────
def quantize_onnx(onnx_path: str) -> None:
    """Apply static INT8 quantization for CPU speedup."""
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType

        out_path = onnx_path.replace(".onnx", "_int8.onnx")
        quantize_dynamic(onnx_path, out_path,
                         weight_type=QuantType.QInt8)
        size_before = os.path.getsize(onnx_path)  / 1_000_000
        size_after  = os.path.getsize(out_path)   / 1_000_000
        print(f"  [Quantize] INT8 saved -> {out_path} "
              f"({size_before:.1f}MB -> {size_after:.1f}MB)")
    except ImportError:
        print("  [Quantize] Skipped — install onnxruntime-tools")


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    args = parse_args()
    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    ckpt_dir = Path(cfg["output"]["checkpoints"])
    out_dir  = args.output_dir or cfg["output"]["onnx"]
    os.makedirs(out_dir, exist_ok=True)

    print(f"[ONNX Export] Output directory: {out_dir}")
    print(f"[ONNX Export] Opset version: {args.opset}")

    if args.model in ("classifier", "all"):
        ckpt = args.checkpoint or str(ckpt_dir / "best_classifier.pt")
        if os.path.exists(ckpt):
            export_classifier(cfg, ckpt, out_dir, args.opset)
            if args.quantize:
                quantize_onnx(os.path.join(out_dir, "classifier.onnx"))
        else:
            print(f"  [Skip] Classifier checkpoint not found: {ckpt}")

    if args.model in ("unet", "all"):
        ckpt = args.checkpoint or str(ckpt_dir / "best_unet_seg.pt")
        if os.path.exists(ckpt):
            export_unet_segmenter(cfg, ckpt, out_dir, args.opset)
            if args.quantize:
                quantize_onnx(os.path.join(out_dir, "unet_segmenter.onnx"))
        else:
            print(f"  [Skip] U-Net checkpoint not found: {ckpt}")

    if args.model in ("localizer", "all"):
        ckpt = args.checkpoint or str(ckpt_dir / "best_localizer.pt")
        if os.path.exists(ckpt):
            export_localizer(cfg, ckpt, out_dir, args.opset)
            if args.quantize:
                quantize_onnx(os.path.join(out_dir, "od_localizer.onnx"))
        else:
            print(f"  [Skip] Localizer checkpoint not found: {ckpt}")

    print(f"\n[Done] ONNX export complete. Files saved to: {out_dir}")
    print("       Deploy with: onnxruntime.InferenceSession(onnx_path)")


if __name__ == "__main__":
    main()
