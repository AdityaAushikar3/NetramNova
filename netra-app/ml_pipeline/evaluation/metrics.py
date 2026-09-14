"""
evaluation/metrics.py
NetramNova — Comprehensive Evaluation Metrics

Computes all clinical and ML evaluation metrics for the DR screening system:

Clinical Metrics (per ICDR grade 2+ threshold — "referable DR"):
  - Sensitivity (Recall)
  - Specificity (True Negative Rate)
  - Positive Predictive Value (Precision)
  - Negative Predictive Value (NPV)
  - F1-Score

ML Metrics:
  - Per-class and macro AUC (ROC One-vs-Rest)
  - Quadratic Weighted Kappa (standard DR grading metric)
  - Confusion Matrix (5×5 ICDR grid)

Segmentation Metrics:
  - Per-class Dice Score
  - Per-class IoU (Jaccard)
  - Pixel Accuracy

Usage:
    from evaluation.metrics import ClassificationEvaluator, SegmentationEvaluator
    
    # Classification
    eval = ClassificationEvaluator(num_classes=5, referral_threshold=2)
    eval.update(logits_batch, labels_batch)
    report = eval.compute()
    
    # Segmentation
    seg_eval = SegmentationEvaluator(num_classes=5)
    seg_eval.update(pred_masks, true_masks)
    seg_report = seg_eval.compute()
"""

from __future__ import annotations
import numpy as np
import torch
from sklearn.metrics import (
    roc_auc_score,
    confusion_matrix,
    classification_report,
    cohen_kappa_score,
)
from typing import Optional


# ─── Grade Labels ───────────────────────────────────────────────────────────
GRADE_NAMES = ["No DR", "Mild NPDR", "Moderate NPDR", "Severe NPDR", "PDR"]
LESION_NAMES = ["Microaneurysm", "Haemorrhage",
                "Hard Exudate", "Soft Exudate", "Optic Disc"]

# Referable DR = Grade 2 or above
REFERRAL_THRESHOLD = 2


# ══════════════════════════════════════════════════════════════════════════════
# DR Classification Evaluator
# ══════════════════════════════════════════════════════════════════════════════
class ClassificationEvaluator:
    """
    Accumulates predictions and labels across batches, then computes
    full evaluation suite.

    Parameters
    ----------
    num_classes        : number of DR severity classes (5)
    referral_threshold : grade at which we flag as referable DR (2 = Moderate+)
    """

    def __init__(self,
                 num_classes: int = 5,
                 referral_threshold: int = REFERRAL_THRESHOLD):
        self.num_classes   = num_classes
        self.threshold     = referral_threshold
        self.all_labels:  list[int]       = []
        self.all_probs:   list[np.ndarray] = []
        self.all_preds:   list[int]       = []

    def update(self,
               logits:  torch.Tensor,
               labels:  torch.Tensor) -> None:
        """
        Accumulate a batch of predictions.

        Parameters
        ----------
        logits : (B, num_classes) — raw model outputs
        labels : (B,) — ground-truth grade labels
        """
        probs = torch.softmax(logits, dim=1).detach().cpu().numpy()
        preds = logits.argmax(dim=1).detach().cpu().numpy()
        lbls  = labels.detach().cpu().numpy()

        self.all_probs.extend(probs)
        self.all_preds.extend(preds.tolist())
        self.all_labels.extend(lbls.tolist())

    def compute(self) -> dict:
        """
        Compute all metrics. Returns a dict with full evaluation report.
        """
        y_true  = np.array(self.all_labels)
        y_pred  = np.array(self.all_preds)
        y_probs = np.array(self.all_probs)

        # Binary referral (Grade 0/1 → no referral, Grade 2/3/4 → referral)
        binary_true = (y_true >= self.threshold).astype(int)
        binary_pred = (y_pred >= self.threshold).astype(int)

        # Confusion matrix (binary)
        tn, fp, fn, tp = confusion_matrix(binary_true, binary_pred,
                                          labels=[0, 1]).ravel()

        sensitivity = tp / (tp + fn + 1e-8)
        specificity = tn / (tn + fp + 1e-8)
        ppv         = tp / (tp + fp + 1e-8)
        npv         = tn / (tn + fn + 1e-8)
        f1          = 2 * tp / (2 * tp + fp + fn + 1e-8)
        accuracy    = (tp + tn) / (tp + tn + fp + fn + 1e-8)

        # AUC — multi-class OvR
        try:
            auc_macro = roc_auc_score(y_true, y_probs,
                                      multi_class="ovr", average="macro")
            auc_per_class = []
            for c in range(self.num_classes):
                binary_c = (y_true == c).astype(int)
                try:
                    auc_c = roc_auc_score(binary_c, y_probs[:, c])
                except ValueError:
                    auc_c = float("nan")
                auc_per_class.append(auc_c)
        except ValueError:
            auc_macro, auc_per_class = float("nan"), [float("nan")] * self.num_classes

        # Quadratic Weighted Kappa (standard DR grading benchmark)
        try:
            kappa = cohen_kappa_score(y_true, y_pred, weights="quadratic")
        except Exception:
            kappa = float("nan")

        # Per-class confusion matrix (5×5)
        cm = confusion_matrix(y_true, y_pred, labels=list(range(self.num_classes)))

        return {
            # Clinical binary metrics
            "sensitivity":  round(sensitivity, 4),
            "specificity":  round(specificity, 4),
            "ppv":          round(ppv, 4),
            "npv":          round(npv, 4),
            "f1_referable": round(f1, 4),
            "accuracy":     round(accuracy, 4),
            # ML metrics
            "auc_macro":     round(auc_macro, 4),
            "auc_per_class": {GRADE_NAMES[i]: round(v, 4)
                              for i, v in enumerate(auc_per_class)},
            "kappa_quadratic": round(kappa, 4),
            # Counts
            "tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn),
            "n_total": len(y_true),
            # Confusion matrix
            "confusion_matrix": cm.tolist(),
            "confusion_matrix_labels": GRADE_NAMES,
        }

    def print_report(self) -> None:
        """Print a formatted summary of all metrics."""
        report = self.compute()
        print("\n" + "=" * 60)
        print("NetramNova DR Classification Evaluation Report")
        print("=" * 60)
        print(f"Total samples       : {report['n_total']}")
        print(f"Referral threshold  : Grade {REFERRAL_THRESHOLD}+ (Moderate+ NPDR)")
        print()
        print("CLINICAL METRICS (binary: referable / non-referable):")
        print(f"  Sensitivity       : {report['sensitivity']:.4f} ({report['sensitivity']*100:.1f}%)")
        print(f"  Specificity       : {report['specificity']:.4f} ({report['specificity']*100:.1f}%)")
        print(f"  PPV (Precision)   : {report['ppv']:.4f}")
        print(f"  NPV               : {report['npv']:.4f}")
        print(f"  F1 (Referable)    : {report['f1_referable']:.4f}")
        print(f"  Accuracy          : {report['accuracy']:.4f}")
        print()
        print("ML METRICS:")
        print(f"  AUC (Macro OvR)   : {report['auc_macro']:.4f}")
        print(f"  Kappa (Quadratic) : {report['kappa_quadratic']:.4f}")
        print()
        print("AUC per ICDR Grade:")
        for grade, auc in report["auc_per_class"].items():
            print(f"    {grade}: {auc:.4f}")
        print()
        print("Confusion Matrix (rows=true, cols=pred):")
        cm = np.array(report["confusion_matrix"])
        header = "         " + "  ".join(f"{g[:6]:>6}" for g in GRADE_NAMES)
        print(header)
        for i, row in enumerate(cm):
            print(f"  {GRADE_NAMES[i][:8]:>8} " + "  ".join(f"{v:>6}" for v in row))
        print("=" * 60)


# ══════════════════════════════════════════════════════════════════════════════
# Segmentation Evaluator
# ══════════════════════════════════════════════════════════════════════════════
class SegmentationEvaluator:
    """
    Accumulates predictions and ground-truth masks across batches.

    Computes per-class:
      - Dice Score
      - IoU (Jaccard)
      - Pixel Accuracy

    Parameters
    ----------
    num_classes  : number of lesion classes (5 for IDRiD)
    threshold    : binarization threshold for predicted masks
    class_names  : list of class name strings
    """

    def __init__(self,
                 num_classes: int = 5,
                 threshold: float = 0.5,
                 class_names: Optional[list[str]] = None):
        self.num_classes = num_classes
        self.threshold   = threshold
        self.names       = class_names or LESION_NAMES[:num_classes]
        self._dice_sums  = np.zeros(num_classes)
        self._iou_sums   = np.zeros(num_classes)
        self._pix_correct = 0
        self._pix_total   = 0
        self._n_samples   = 0

    def update(self,
               pred_probs: torch.Tensor,
               true_masks: torch.Tensor) -> None:
        """
        Accumulate a batch.

        Parameters
        ----------
        pred_probs : (B, C, H, W) — sigmoid probabilities
        true_masks : (B, C, H, W) — binary ground-truth masks
        """
        pred = (pred_probs > self.threshold).float().cpu().numpy()
        true = true_masks.cpu().numpy()
        B    = pred.shape[0]

        for b in range(B):
            for c in range(self.num_classes):
                p = pred[b, c].ravel()
                t = true[b, c].ravel()
                inter = (p * t).sum()
                denom = p.sum() + t.sum()
                self._dice_sums[c] += (2 * inter / (denom + 1e-7))
                union = (p + t - p * t).sum()
                self._iou_sums[c]  += (inter / (union + 1e-7))
                self._pix_correct  += (p == t).sum()
                self._pix_total    += p.size
        self._n_samples += B

    def compute(self) -> dict:
        """Compute mean metrics across all accumulated samples."""
        n = max(self._n_samples, 1)
        dice_per = self._dice_sums / n
        iou_per  = self._iou_sums  / n
        pix_acc  = self._pix_correct / max(self._pix_total, 1)

        return {
            "mean_dice":  float(dice_per.mean()),
            "mean_iou":   float(iou_per.mean()),
            "pixel_acc":  float(pix_acc),
            "dice_per_class": {self.names[c]: round(float(dice_per[c]), 4)
                               for c in range(self.num_classes)},
            "iou_per_class":  {self.names[c]: round(float(iou_per[c]),  4)
                               for c in range(self.num_classes)},
            "n_samples": self._n_samples,
        }

    def print_report(self) -> None:
        r = self.compute()
        print("\n" + "=" * 50)
        print("NetramNova Segmentation Evaluation Report")
        print("=" * 50)
        print(f"Samples evaluated : {r['n_samples']}")
        print(f"Mean Dice         : {r['mean_dice']:.4f}")
        print(f"Mean IoU          : {r['mean_iou']:.4f}")
        print(f"Pixel Accuracy    : {r['pixel_acc']:.4f}")
        print()
        print(f"{'Lesion':<20} {'Dice':>8} {'IoU':>8}")
        print("-" * 38)
        for cls in self.names:
            print(f"{cls:<20} {r['dice_per_class'][cls]:>8.4f} "
                  f"{r['iou_per_class'][cls]:>8.4f}")
        print("=" * 50)
