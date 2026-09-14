"""
evaluation/etdrs_quadrant_engine.py
NetramNova — ETDRS 4-2-1 Spatial Quadrant Clinical Rule Engine

Clinical Purpose:
-----------------
Deep learning classifiers (like EfficientNet) evaluate retinal scans holistically.
Because both Moderate NPDR (Grade 2) and Severe NPDR (Grade 3) exhibit heavy
intraretinal hemorrhages, holistic image classifiers often suffer from "sandwich squeeze",
under-calling Severe NPDR as Moderate (causing lower Grade 3 AUC).

The international gold standard (Early Treatment Diabetic Retinopathy Study - ETDRS)
specifically mandates SPATIAL QUADRANT VERIFICATION:
  Severe NPDR (Grade 3) requires:
    Rule "4": >= 20 intraretinal hemorrhages in ALL 4 quadrants (Superior, Inferior, Nasal, Temporal)
    Rule "2": Definite venous beading in >= 2 quadrants
    Rule "1": Prominent IRMA in >= 1 quadrant

This module:
  1. Partitions the fundus into 4 anatomical quadrants centered on the Fovea.
  2. Extracts hemorrhage centroids from candidate scans.
  3. Audits borderline Grade 2 predictions against the ETDRS Rule "4" criterion.
  4. Automatically promotes verified cases to Grade 3 (Severe NPDR), rescuing clinical sensitivity.
"""

from __future__ import annotations
import cv2
import numpy as np
import torch
from dataclasses import dataclass


@dataclass
class QuadrantCounts:
    # Hemorrhages per quadrant
    superior: int
    inferior: int
    nasal: int
    temporal: int
    # Microaneurysms per quadrant (default to 0 if not segmented separately)
    superior_ma: int = 0
    inferior_ma: int = 0
    nasal_ma: int = 0
    temporal_ma: int = 0

    @property
    def superior_hma(self) -> int:
        """Composite Hemorrhages + Microaneurysms in Superior quadrant."""
        return self.superior + self.superior_ma

    @property
    def inferior_hma(self) -> int:
        """Composite Hemorrhages + Microaneurysms in Inferior quadrant."""
        return self.inferior + self.inferior_ma

    @property
    def nasal_hma(self) -> int:
        """Composite Hemorrhages + Microaneurysms in Nasal quadrant."""
        return self.nasal + self.nasal_ma

    @property
    def temporal_hma(self) -> int:
        """Composite Hemorrhages + Microaneurysms in Temporal quadrant."""
        return self.temporal + self.temporal_ma

    def meets_rule_4(self, threshold: int = 20) -> bool:
        """
        True if all 4 quadrants meet or exceed the official ETDRS composite
        H/Ma threshold (>=20 Hemorrhages + Microaneurysms in ALL 4 quadrants).
        """
        return (
            self.superior_hma >= threshold
            and self.inferior_hma >= threshold
            and self.nasal_hma >= threshold
            and self.temporal_hma >= threshold
        )

    def to_dict(self) -> dict:
        return {
            "superior_hemorrhages": self.superior,
            "inferior_hemorrhages": self.inferior,
            "nasal_hemorrhages": self.nasal,
            "temporal_hemorrhages": self.temporal,
            "superior_ma": self.superior_ma,
            "inferior_ma": self.inferior_ma,
            "nasal_ma": self.nasal_ma,
            "temporal_ma": self.temporal_ma,
            "superior_total_hma": self.superior_hma,
            "inferior_total_hma": self.inferior_hma,
            "nasal_total_hma": self.nasal_hma,
            "temporal_total_hma": self.temporal_hma,
            "meets_etdrs_rule_4": self.meets_rule_4()
        }


class ETDRSQuadrantEngine:
    """
    Anatomical Quadrant Partitioning and Clinical Rule Auditor.
    """

    def __init__(self, hemorrhage_threshold: int = 20):
        self.hemorrhage_threshold = hemorrhage_threshold

    def compute_fovea_and_quadrants(self, image_shape: tuple[int, int],
                                     od_center: tuple[float, float] | None = None) -> tuple[int, int]:
        """
        Locate anatomical center (Fovea).
        If Optic Disc coordinate (x, y) is provided, Fovea is located approximately
        2.5 disc diameters temporally. If not, default to geometrical center of retinal circle.
        """
        h, w = image_shape[:2]
        if od_center is not None:
            # od_center is normalized [0, 1]
            od_x = int(od_center[0] * w)
            od_y = int(od_center[1] * h)
            # Fovea is temporal to OD (typically slightly lower or aligned)
            # If OD is on right half (left eye), temporal is to the left
            if od_x > w // 2:
                fovea_x = max(0, od_x - int(0.28 * w))
            else:
                fovea_x = min(w - 1, od_x + int(0.28 * w))
            fovea_y = od_y
            return (fovea_x, fovea_y)
        return (w // 2, h // 2)

    def assign_quadrants(self, centroids: list[tuple[int, int]],
                         fovea_center: tuple[int, int],
                         is_left_eye: bool = True) -> QuadrantCounts:
        """
        Assign each lesion centroid into: Superior, Inferior, Nasal, Temporal.
        """
        fx, fy = fovea_center
        sup = 0
        inf = 0
        nas = 0
        tem = 0

        for cx, cy in centroids:
            dx = cx - fx
            dy = cy - fy

            # Angle from fovea: -pi to +pi
            # Divide into 4 quadrants using 45-degree diagonal dividers
            if abs(dy) >= abs(dx):
                if dy < 0:
                    sup += 1
                else:
                    inf += 1
            else:
                # Horizontal axis: Nasal is toward Optic Disc, Temporal is away
                if is_left_eye:
                    if dx > 0:
                        nas += 1
                    else:
                        tem += 1
                else:
                    if dx < 0:
                        nas += 1
                    else:
                        tem += 1

        return QuadrantCounts(superior=sup, inferior=inf, nasal=nas, temporal=tem)

    def extract_hemorrhage_centroids_from_mask(self, binary_mask: np.ndarray) -> list[tuple[int, int]]:
        """Extract centroids of connected components from a binary hemorrhage mask."""
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary_mask)
        valid_centroids = []
        # Skip label 0 (background)
        for i in range(1, num_labels):
            if stats[i, cv2.CC_STAT_AREA] >= 4:
                valid_centroids.append((int(centroids[i, 0]), int(centroids[i, 1])))
        return valid_centroids

    def audit_classification(self, predicted_grade: int | None = None,
                             probabilities: np.ndarray | None = None,
                             quadrant_counts: QuadrantCounts | None = None,
                             **kwargs) -> tuple[int, str]:
        """
        Audits model prediction against ETDRS criteria:
        If model predicted Grade 2 (Moderate NPDR), but the scan objectively satisfies
        Rule "4" (>=20 hemorrhages in each of the 4 quadrants), upgrade to Grade 3 (Severe NPDR).
        """
        pred = predicted_grade if predicted_grade is not None else kwargs.get("raw_pred", kwargs.get("raw_prediction", 0))
        counts = quadrant_counts if quadrant_counts is not None else kwargs.get("counts", kwargs.get("quadrant_counts"))
        probs = probabilities if probabilities is not None else kwargs.get("probs", np.zeros(5))

        if counts is None:
            return pred, "MAINTAINED: No quadrant counts provided"

        rule_4_satisfied = counts.meets_rule_4(self.hemorrhage_threshold)

        if pred == 2 and rule_4_satisfied:
            return 3, "UPGRADED: ETDRS Rule 4 Verified (>=20 Hemorrhages + Microaneurysms in all 4 quadrants)"

        if pred == 3 and not rule_4_satisfied:
            # Check if probability was borderline (e.g. p_grade2 was almost as high)
            if len(probs) > 2 and probs[2] > 0.30:
                return 2, "DOWNGRADED: Failed ETDRS Rule 4 (Insufficient 4-quadrant H/Ma distribution)"

        return pred, "MAINTAINED: Diagnostic Concordance Confirmed"
