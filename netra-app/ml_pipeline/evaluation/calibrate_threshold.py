"""
evaluation/calibrate_threshold.py
NetramNova — Clinical Operating Threshold Calibration for Referable DR

Evaluates the trained EfficientNet-B2 classifier across a range of clinical
decision thresholds (tau = 0.15 to 0.50) to determine the optimal screening
operating point that delivers Sensitivity >= 90% while maintaining high Specificity.

Referable DR Definition: ICDR Grade >= 2 (Moderate NPDR, Severe NPDR, PDR)
Non-Referable DR:       ICDR Grade 0 (No DR) or Grade 1 (Mild NPDR)
"""

from __future__ import annotations
import os
import sys
import yaml
import json
from pathlib import Path

# Prevent OpenMP runtime collision on Windows machines
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import torch
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from tqdm import tqdm
from sklearn.metrics import confusion_matrix
from torch.utils.data import DataLoader

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.efficientnet_classifier import EfficientNetDRClassifier, load_checkpoint
from datasets.aptos_dataset import APTOSDataset
from preprocessing.augmentation import get_val_transforms


def evaluate_probabilities(model, loader, device):
    """Run inference once and collect ground-truth labels and probability vectors."""
    model.eval()
    all_labels = []
    all_probs = []

    with torch.no_grad():
        for imgs, labels in tqdm(loader, desc="Collecting Inference Probabilities"):
            imgs = imgs.to(device)
            logits = model(imgs)
            probs = torch.softmax(logits, dim=1).cpu().numpy()
            all_labels.extend(labels.numpy())
            all_probs.extend(probs)

    return np.array(all_labels), np.array(all_probs)


def sweep_thresholds(labels, probs, thresholds=None):
    """
    Sweep referral thresholds.
    Referable DR probability = sum of probabilities for Grade 2, 3, 4.
    """
    if thresholds is None:
        thresholds = np.linspace(0.15, 0.50, 36)

    # Binary Ground Truth: 1 if Grade >= 2 (Referable), else 0
    y_true = (labels >= 2).astype(int)

    # Predicted probability of referable DR (sum of grades 2, 3, 4)
    p_referable = probs[:, 2:].sum(axis=1)

    results = []

    for tau in thresholds:
        y_pred = (p_referable >= tau).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()

        sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        ppv = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        npv = tn / (tn + fn) if (tn + fn) > 0 else 0.0
        accuracy = (tp + tn) / len(y_true)
        f1 = 2 * tp / (2 * tp + fp + fn) if (2 * tp + fp + fn) > 0 else 0.0

        results.append({
            "threshold": round(float(tau), 3),
            "sensitivity": round(float(sensitivity), 4),
            "specificity": round(float(specificity), 4),
            "ppv": round(float(ppv), 4),
            "npv": round(float(npv), 4),
            "accuracy": round(float(accuracy), 4),
            "f1": round(float(f1), 4),
            "tp": int(tp),
            "fp": int(fp),
            "fn": int(fn),
            "tn": int(tn)
        })

    return results, p_referable, y_true


def main():
    config_path = "config.yaml"
    ckpt_path = "outputs/checkpoints/best_classifier.pt"
    out_dir = "outputs/eval/calibration"
    os.makedirs(out_dir, exist_ok=True)

    with open(config_path) as f:
        cfg = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[Device] Using: {device}")

    img_size = cfg["classifier"]["image_size"]
    arch = cfg["classifier"].get("arch", "tf_efficientnet_b2")

    # Load Model
    model = EfficientNetDRClassifier(arch=arch, pretrained=False)
    load_checkpoint(model, ckpt_path, device)
    model = model.to(device)

    # Build Test Dataset
    aptos_cfg = cfg["datasets"]["aptos"]
    img_dir = aptos_cfg.get("test_image_dir") or (
        "data/aptos2019/test_images" if os.path.exists("data/aptos2019/test_images")
        else aptos_cfg["image_dir"]
    )
    test_ds = APTOSDataset(aptos_cfg["test_csv"], img_dir, transform=get_val_transforms(img_size))
    test_loader = DataLoader(test_ds, batch_size=32, shuffle=False, num_workers=0)

    print(f"[Test Dataset] Loaded {len(test_ds)} test images from: {img_dir}")

    # Step 1: Collect raw probabilities
    labels, probs = evaluate_probabilities(model, test_loader, device)

    # Step 2: Sweep thresholds
    results, p_ref, y_true = sweep_thresholds(labels, probs)
    df_results = pd.DataFrame(results)

    # Find the standard threshold (0.50)
    std_row = df_results.iloc[(df_results["threshold"] - 0.50).abs().argsort()[:1]].iloc[0]

    # Find the best clinical threshold: Sensitivity >= 90% with maximum Specificity
    candidates = df_results[df_results["sensitivity"] >= 0.90]
    if len(candidates) > 0:
        best_clinical = candidates.sort_values(by="specificity", ascending=False).iloc[0]
    else:
        best_clinical = df_results.sort_values(by="sensitivity", ascending=False).iloc[0]

    print("\n" + "=" * 75)
    print("CLINICAL OPERATING THRESHOLD CALIBRATION RESULTS")
    print("=" * 75)
    print(f"{'Metric':<30} {'Standard (tau = 0.50)':<22} {'Calibrated (tau = ' + str(best_clinical['threshold']) + ')':<22}")
    print("-" * 75)
    print(f"{'Referable DR Sensitivity':<30} {std_row['sensitivity']*100:.1f}%{'':<16} {best_clinical['sensitivity']*100:.1f}%")
    print(f"{'Referable DR Specificity':<30} {std_row['specificity']*100:.1f}%{'':<16} {best_clinical['specificity']*100:.1f}%")
    print(f"{'Positive Predictive Value (PPV)':<30} {std_row['ppv']*100:.1f}%{'':<16} {best_clinical['ppv']*100:.1f}%")
    print(f"{'Negative Predictive Value (NPV)':<30} {std_row['npv']*100:.1f}%{'':<16} {best_clinical['npv']*100:.1f}%")
    print(f"{'Overall Screening Accuracy':<30} {std_row['accuracy']*100:.1f}%{'':<16} {best_clinical['accuracy']*100:.1f}%")
    print(f"{'Missed Patients (False Negatives)':<30} {int(std_row['fn']):<22} {int(best_clinical['fn']):<22}")
    print("=" * 75)

    # Save comparative plot
    plt.figure(figsize=(10, 6), dpi=150)
    plt.plot(df_results["threshold"], df_results["sensitivity"], label="Sensitivity (Recall)", color="#EF4444", lw=2.5)
    plt.plot(df_results["threshold"], df_results["specificity"], label="Specificity", color="#10B981", lw=2.5)
    plt.plot(df_results["threshold"], df_results["accuracy"], label="Overall Accuracy", color="#3B82F6", lw=1.8, linestyle="--")

    # Mark the chosen clinical operating point
    plt.axvline(best_clinical["threshold"], color="#F59E0B", linestyle=":", lw=2, label=f"Selected Operating Point (tau={best_clinical['threshold']})")
    plt.scatter([best_clinical["threshold"]], [best_clinical["sensitivity"]], color="#EF4444", s=80, zorder=5)
    plt.scatter([best_clinical["threshold"]], [best_clinical["specificity"]], color="#10B981", s=80, zorder=5)

    plt.title("NetramNova — Clinical Operating Characteristic vs Threshold", fontsize=13, fontweight="bold")
    plt.xlabel("Referral Decision Threshold (tau)", fontsize=11)
    plt.ylabel("Performance Score (0.0 - 1.0)", fontsize=11)
    plt.legend(loc="lower left", fontsize=10.5)
    plt.grid(alpha=0.3)
    plt.tight_layout()

    plot_path = os.path.join(out_dir, "threshold_calibration_curve.png")
    plt.savefig(plot_path)
    plt.close()
    print(f"[Plot] Saved calibration curve -> {plot_path}")

    # Save JSON report
    report_data = {
        "standard_threshold_0_50": std_row.to_dict(),
        "calibrated_clinical_threshold": best_clinical.to_dict(),
        "all_threshold_sweeps": results
    }
    json_path = os.path.join(out_dir, "calibration_report.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)
    print(f"[Report] Saved JSON report -> {json_path}")


if __name__ == "__main__":
    main()
