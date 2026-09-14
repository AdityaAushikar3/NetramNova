"""
evaluation/ma_patch_engine.py
NetramNova — High-Resolution Patch-Based Microaneurysm Rescue Engine

Clinical Purpose:
-----------------
Under the International Clinical Diabetic Retinopathy (ICDR) scale:
  - Grade 0 (No DR): No diabetic retinopathy lesions.
  - Grade 1 (Mild NPDR): Microaneurysms (MAs) ONLY.

The Sub-Pixel Downsampling Bottleneck:
--------------------------------------
Full fundus photography generates 3000x2000 to 4000x3000 pixel images.
A classic retinal microaneurysm has a biological diameter of 15 to 50 micrometers,
which corresponds to only 1 to 4 pixels on high-resolution camera sensors.

When whole fundus images are downsampled to 512x512 for standard CNN classifiers
(e.g., EfficientNet-B2), isolated microaneurysms are squashed into sub-pixel space
or blurred away by interpolation filters. Consequently, holistic classifiers frequently
suffer from false-negative dismissal of Grade 1 patients as Grade 0 (No DR).

NetramNova Solution:
--------------------
When the primary screening triage predicts Grade 0 (No DR) or borderline Grade 0/1,
the high-resolution image is tiled into 256x256 overlapping patches (stride 128)
and evaluated via the lesion segmenter/detector.
If verified microaneurysms are detected, the diagnosis is rescued to Grade 1 (Mild NPDR),
preventing patients from being falsely discharged from diabetic monitoring.
"""

from __future__ import annotations
import numpy as np
from dataclasses import dataclass


@dataclass
class MicroaneurysmAuditResult:
    ma_count: int
    mean_confidence: float
    max_lesion_diameter_px: float
    has_isolated_ma_only: bool

    def to_dict(self) -> dict:
        return {
            "ma_count": self.ma_count,
            "mean_confidence": round(float(self.mean_confidence), 4),
            "max_lesion_diameter_px": round(float(self.max_lesion_diameter_px), 2),
            "has_isolated_ma_only": self.has_isolated_ma_only
        }


class MAPatchRescueEngine:
    """
    High-Resolution Microaneurysm Patch Rescue and Diagnostic Auditor.
    """

    def __init__(self, min_confidence: float = 0.45, min_ma_count: int = 1):
        self.min_confidence = min_confidence
        self.min_ma_count = min_ma_count

    def audit_classification(self,
                             raw_prediction: int,
                             probabilities: np.ndarray,
                             ma_result: MicroaneurysmAuditResult) -> tuple[int, str]:
        """
        Audits raw classifier prediction against sub-pixel microaneurysm findings:

        1. False-Negative Rescue:
           If raw prediction is Grade 0 (No DR), but high-resolution patch analysis
           verifies >= min_ma_count microaneurysms with sufficient confidence,
           upgrade to Grade 1 (Mild NPDR).

        2. Borderline Confirmation:
           If raw prediction is Grade 1 and microaneurysms are verified,
           confirm diagnostic concordance.

        3. Overcall Correction:
           If raw prediction is Grade 1, but zero microaneurysms are found and
           Grade 0 probability is substantial (>0.40), retain Grade 0.
        """
        # Case 1: Raw prediction = Grade 0 (No DR), but patch analysis found MAs
        if raw_prediction == 0:
            if ma_result.ma_count >= self.min_ma_count and ma_result.mean_confidence >= self.min_confidence:
                reason = (
                    f"UPGRADED (0 -> 1): Rescued {ma_result.ma_count} sub-pixel microaneurysm(s) "
                    f"(conf={ma_result.mean_confidence:.2f}) missed by 512x512 downsampling"
                )
                return 1, reason

        # Case 2: Raw prediction = Grade 1 (Mild NPDR)
        if raw_prediction == 1:
            if ma_result.ma_count >= self.min_ma_count:
                reason = f"CONFIRMED (Grade 1): {ma_result.ma_count} microaneurysm(s) verified on high-res patch"
                return 1, reason
            elif ma_result.ma_count == 0 and probabilities[0] > 0.40:
                reason = "DOWNGRADED (1 -> 0): Zero microaneurysms detected in high-res audit; p(Grade 0) dominant"
                return 0, reason

        # Case 3: Grade 2+ cases are referable and managed by Stage 1 & Stage 2 engines
        return raw_prediction, "MAINTAINED: Primary staging concordant"
