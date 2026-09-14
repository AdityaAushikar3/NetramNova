"""
evaluation/benchmark.py
NetramNova — Full Benchmark Evaluation Script

Runs end-to-end evaluation of a trained DR classifier checkpoint
against one or multiple test sets (APTOS, IDRiD, EyePACS).

Outputs:
  - Console report (sensitivity, specificity, AUC, kappa)
  - CSV file with per-image predictions
  - ROC curve plots (matplotlib)
  - Confusion matrix heatmap

Usage:
    cd ml_pipeline
    python evaluation/benchmark.py \\
        --checkpoint outputs/checkpoints/best_classifier.pt \\
        --dataset aptos \\
        --config config.yaml \\
        --output outputs/eval/aptos_benchmark

    # Evaluate on IDRiD test set:
    python evaluation/benchmark.py \\
        --checkpoint outputs/checkpoints/best_classifier.pt \\
        --dataset idrid --config config.yaml
"""

from __future__ import annotations
import os
import sys

# Prevent OpenMP runtime collision on Windows machines
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import argparse
import yaml
import json
from pathlib import Path

import torch
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from tqdm import tqdm
from sklearn.metrics import (
    roc_curve, auc, RocCurveDisplay
)
from torch.utils.data import DataLoader

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.efficientnet_classifier import EfficientNetDRClassifier, load_checkpoint
from datasets.aptos_dataset   import APTOSDataset
from datasets.idrid_dataset   import IDRiDGradingDataset
from datasets.eyepacs_dataset import EyePACSDataset
from preprocessing.augmentation import get_val_transforms
from evaluation.metrics import ClassificationEvaluator


GRADE_NAMES = ["No DR", "Mild NPDR", "Moderate NPDR", "Severe NPDR", "PDR"]


# ─── Argument Parsing ───────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(description="Benchmark DR Classifier")
    p.add_argument("--checkpoint", required=True,
                   help="Path to best_classifier.pt")
    p.add_argument("--dataset", choices=["aptos", "idrid", "eyepacs", "all"],
                   default="aptos")
    p.add_argument("--config",  default="config.yaml")
    p.add_argument("--output",  default="outputs/eval/benchmark")
    p.add_argument("--device",  default="auto")
    p.add_argument("--batch",   type=int, default=32)
    return p.parse_args()


# ─── Dataset Builders ───────────────────────────────────────────────────────
def build_test_dataset(dataset_name: str, cfg: dict, img_size: int):
    """Build the appropriate test dataset."""
    transform = get_val_transforms(img_size)

    if dataset_name == "aptos":
        aptos_cfg = cfg["datasets"]["aptos"]
        img_dir = aptos_cfg.get("test_image_dir") or (
            "data/aptos2019/test_images" if os.path.exists("data/aptos2019/test_images")
            else aptos_cfg["image_dir"]
        )
        return APTOSDataset(aptos_cfg["test_csv"],
                            img_dir,
                            transform=transform)
    elif dataset_name == "idrid":
        return IDRiDGradingDataset(
            cfg["datasets"]["idrid"]["grading_test_csv"],
            cfg["datasets"]["idrid"]["image_test_dir"],
            transform=transform)
    elif dataset_name == "eyepacs":
        return EyePACSDataset(cfg["datasets"]["eyepacs"]["train_csv"],
                              cfg["datasets"]["eyepacs"]["image_dir"],
                              transform=transform,
                              max_grade0=5000)
    else:
        raise ValueError(f"Unknown dataset: {dataset_name}")


# ─── Plotting ────────────────────────────────────────────────────────────────
def plot_roc_curves(all_labels: np.ndarray,
                    all_probs: np.ndarray,
                    output_dir: str) -> None:
    """Plot per-class ROC curves (OvR) and save."""
    plt.figure(figsize=(10, 8))
    colors = ["navy", "darkorange", "green", "red", "purple"]
    aucs = []

    for c, (gname, color) in enumerate(zip(GRADE_NAMES, colors)):
        y_bin = (all_labels == c).astype(int)
        if y_bin.sum() == 0:
            continue
        fpr, tpr, _ = roc_curve(y_bin, all_probs[:, c])
        roc_auc = auc(fpr, tpr)
        aucs.append(roc_auc)
        plt.plot(fpr, tpr, color=color, lw=2,
                 label=f"{gname} (AUC={roc_auc:.3f})")

    plt.plot([0, 1], [0, 1], "k--", lw=1.5, label="Chance")
    plt.xlabel("False Positive Rate", fontsize=13)
    plt.ylabel("True Positive Rate", fontsize=13)
    plt.title("NetramNova — DR Severity ROC Curves (One-vs-Rest)", fontsize=14)
    plt.legend(loc="lower right", fontsize=11)
    plt.grid(alpha=0.3)
    plt.tight_layout()
    path = os.path.join(output_dir, "roc_curves.png")
    plt.savefig(path, dpi=150)
    plt.close()
    print(f"[Plot] ROC curves saved -> {path}")


def plot_confusion_matrix(cm: list[list],
                           output_dir: str) -> None:
    """Save confusion matrix heatmap."""
    cm_arr = np.array(cm)
    # Normalize per row
    cm_norm = cm_arr.astype(float) / (cm_arr.sum(axis=1, keepdims=True) + 1e-7)

    fig, axes = plt.subplots(1, 2, figsize=(16, 6))

    for ax, data, title, fmt in zip(
        axes,
        [cm_arr,    cm_norm],
        ["Count",   "Normalized"],
        [".0f",     ".2f"]
    ):
        sns.heatmap(data, annot=True, fmt=fmt, cmap="Blues",
                    xticklabels=GRADE_NAMES, yticklabels=GRADE_NAMES,
                    ax=ax, linewidths=0.5)
        ax.set_title(f"Confusion Matrix ({title})", fontsize=13)
        ax.set_xlabel("Predicted Grade")
        ax.set_ylabel("True Grade")

    plt.suptitle("NetramNova — DR Severity Classification", fontsize=14)
    plt.tight_layout()
    path = os.path.join(output_dir, "confusion_matrix.png")
    plt.savefig(path, dpi=150)
    plt.close()
    print(f"[Plot] Confusion matrix saved -> {path}")


# ─── Main ────────────────────────────────────────────────────────────────────
def run_benchmark(dataset_name: str, cfg: dict, model, device,
                  batch_size: int, output_dir: str) -> dict:
    """Run full benchmark on one dataset."""
    img_size = cfg["classifier"]["image_size"]
    ds = build_test_dataset(dataset_name, cfg, img_size)
    loader = DataLoader(ds, batch_size=batch_size, shuffle=False,
                        num_workers=0, pin_memory=True)

    evaluator = ClassificationEvaluator()
    model.eval()

    all_labels, all_probs = [], []

    with torch.no_grad():
        for imgs, labels in tqdm(loader, desc=f"Evaluating [{dataset_name}]"):
            imgs   = imgs.to(device)
            labels = labels.to(device)
            logits = model(imgs)
            evaluator.update(logits, labels)
            probs = torch.softmax(logits, dim=1).cpu().numpy()
            all_labels.extend(labels.cpu().numpy())
            all_probs.extend(probs)

    all_labels = np.array(all_labels)
    all_probs  = np.array(all_probs)

    report = evaluator.compute()
    evaluator.print_report()

    # Save plots
    plot_roc_curves(all_labels, all_probs, output_dir)
    plot_confusion_matrix(report["confusion_matrix"], output_dir)

    # Save JSON report
    report_path = os.path.join(output_dir, f"{dataset_name}_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"[Report] JSON saved -> {report_path}")

    return report


def main():
    args = parse_args()
    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available()
                          else "cpu") if args.device == "auto" \
              else torch.device(args.device)

    # ── Load model ───────────────────────────────────────────────────────────
    arch = cfg["classifier"].get("arch", "tf_efficientnet_b2")
    model = EfficientNetDRClassifier(arch=arch)
    load_checkpoint(model, args.checkpoint, device)
    model = model.to(device)

    out_dir = args.output
    os.makedirs(out_dir, exist_ok=True)

    datasets = (["aptos", "idrid", "eyepacs"]
                if args.dataset == "all" else [args.dataset])

    all_reports = {}
    for ds_name in datasets:
        ds_dir = os.path.join(out_dir, ds_name)
        os.makedirs(ds_dir, exist_ok=True)
        print(f"\n{'='*60}")
        print(f"Benchmarking on: {ds_name.upper()}")
        print(f"{'='*60}")
        try:
            all_reports[ds_name] = run_benchmark(
                ds_name, cfg, model, device, args.batch, ds_dir)
        except Exception as e:
            print(f"[Warning] {ds_name} benchmark failed: {e}")

    # Summary table across datasets
    if len(all_reports) > 1:
        print("\n" + "=" * 70)
        print("CROSS-DATASET BENCHMARK SUMMARY")
        print("=" * 70)
        print(f"{'Dataset':<12} {'Sensitivity':>12} {'Specificity':>12} "
              f"{'AUC Macro':>10} {'Kappa':>8}")
        print("-" * 70)
        for name, r in all_reports.items():
            print(f"{name:<12} {r['sensitivity']:>12.4f} {r['specificity']:>12.4f} "
                  f"{r['auc_macro']:>10.4f} {r['kappa_quadratic']:>8.4f}")
        print("=" * 70)


if __name__ == "__main__":
    main()
