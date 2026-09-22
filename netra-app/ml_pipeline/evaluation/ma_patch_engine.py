"""
evaluation/ma_patch_engine.py
NetramNova - High-Resolution Microaneurysm Patch Rescue Engine

Clinical Purpose:
-----------------
Microaneurysms (MAs) are the earliest clinical sign of diabetic retinopathy.
At 512x512 model input resolution, subtle MAs can be lost during downsampling.
This engine performs high-resolution patch-level verification to rescue
Grade 0 predictions where sub-pixel MAs were missed by the classifier.
"""

from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from typing import List, Dict


@dataclass
class MicroaneurysmAuditResult:
    """Result of high-resolution microaneurysm patch analysis."""
    ma_count: int
    mean_confidence: float
    max_lesion_diameter_px: float
    has_isolated_ma_only: bool

    def to_dict(self) -> dict:
        return {
            "ma_count": self.ma_count,
            "mean_confidence": round(float(self.mean_confidence), 4),
            "max_lesion_diameter_px": round(float(self.max_lesion_diameter_px), 2),
            "has_isolated_ma_only": self.has_isolated_ma_only,
        }


class MAPatchRescueEngine:
    """
    High-Resolution Microaneurysm Patch Rescue and Diagnostic Auditor.
    """

    def __init__(self, min_confidence: float = 0.45, min_ma_count: int = 1):
        self.min_confidence = min_confidence
        self.min_ma_count = min_ma_count

    def audit_classification(
        self,
        raw_prediction: int,
        probabilities: np.ndarray,
        ma_result: MicroaneurysmAuditResult,
    ) -> tuple[int, str]:
        """
        Audits a classifier prediction against high-resolution MA patch analysis.

        Logic:
        - Grade 0 + sufficient MAs detected -> UPGRADE to Grade 1
        - Grade 1 + MAs verified -> CONFIRM Grade 1
        - Grade 1 + zero MAs + strong Grade 0 probability -> DOWNGRADE to Grade 0
        - Otherwise -> MAINTAIN prediction

        Returns (final_grade, rescue_note).
        """
        # Grade 0 rescue: if MAs detected at high res, upgrade to Mild NPDR
        if raw_prediction == 0:
            if (
                ma_result.ma_count >= self.min_ma_count
                and ma_result.mean_confidence >= self.min_confidence
            ):
                reason = (
                    f"UPGRADED (0 -> 1): Rescued {ma_result.ma_count} sub-pixel "
                    f"microaneurysm(s) (conf={ma_result.mean_confidence:.2f}) "
                    f"missed by 512x512 downsampling"
                )
                return (1, reason)

        # Grade 1 verification
        if raw_prediction == 1:
            if ma_result.ma_count >= self.min_ma_count:
                reason = (
                    f"CONFIRMED (Grade 1): {ma_result.ma_count} microaneurysm(s) "
                    f"verified on high-res patch"
                )
                return (1, reason)
            if ma_result.ma_count == 0 and probabilities[0] > 0.4:
                reason = "DOWNGRADED (1 -> 0): Zero microaneurysms detected in high-res audit; p(Grade 0) dominant"
                return (0, reason)

        # All other cases: maintain original prediction
        return (raw_prediction, "MAINTAINED: Primary staging concordant")
