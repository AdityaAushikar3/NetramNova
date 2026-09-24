"""
evaluation/etdrs_quadrant_engine.py
NetramNova - ETDRS 4-2-1 Spatial Quadrant Clinical Rule Engine

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
    """Hemorrhage + microaneurysm counts per ETDRS quadrant."""

    superior: int
    inferior: int
    nasal: int
    temporal: int

    superior_ma: int = 0
    inferior_ma: int = 0
    nasal_ma: int = 0
    temporal_ma: int = 0

    @property
    def superior_hma(self) -> int:
        """Total hemorrhages + microaneurysms in the superior quadrant."""
        return self.superior + self.superior_ma

    @property
    def inferior_hma(self) -> int:
        """Total hemorrhages + microaneurysms in the inferior quadrant."""
        return self.inferior + self.inferior_ma

    @property
    def nasal_hma(self) -> int:
        """Total hemorrhages + microaneurysms in the nasal quadrant."""
        return self.nasal + self.nasal_ma

    @property
    def temporal_hma(self) -> int:
        """Total hemorrhages + microaneurysms in the temporal quadrant."""
        return self.temporal + self.temporal_ma

    def meets_rule_4(self, threshold: int = 20) -> bool:
        """
        ETDRS Rule "4": >= threshold intraretinal hemorrhages + microaneurysms
        in ALL 4 quadrants. This is the primary criterion for Severe NPDR (Grade 3).
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
            "meets_etdrs_rule_4": self.meets_rule_4(),
        }


class ETDRSQuadrantEngine:
    """
    ETDRS 4-2-1 Spatial Quadrant Auditor for clinical classification rescue.
    """

    def __init__(self, hemorrhage_threshold: int = 20):
        self.hemorrhage_threshold = hemorrhage_threshold

    def compute_fovea_and_quadrants(self, img: np.ndarray | tuple[int, int]) -> tuple[int, int] | None:
        """
        Estimates the foveal centre from Optic Disc (OD) position.
        Returns (cx, cy) or None if unreliable.
        """
        if isinstance(img, tuple):
            return None
            
        h, w = img.shape[:2]
        
        # 1. Detect Optic Disc (brightest large region)
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()
            
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        cl = clahe.apply(gray)
        
        _, thresh = cv2.threshold(cl, 220, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None
            
        largest_contour = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest_contour)
        
        if area < 500 or area > 50000:
            return None
            
        (od_cx, od_cy), od_radius = cv2.minEnclosingCircle(largest_contour)
        
        # 2. Determine laterality (OD is nasal to fovea)
        is_right_eye = od_cx < w / 2
        
        # 3. Estimate Fovea (approx 2.5 OD diameters temporal to OD center)
        fovea_offset = 5 * od_radius
        fovea_cx = od_cx + fovea_offset if is_right_eye else od_cx - fovea_offset
        fovea_cy = od_cy
        
        if not (0 <= fovea_cx < w and 0 <= fovea_cy < h):
            return None
            
        return (int(fovea_cx), int(fovea_cy))

    def assign_quadrants(
        self,
        points: list[tuple[int, int]],
        fovea_centre: tuple[int, int] | None,
    ) -> QuadrantCounts | None:
        """
        Assigns detected lesion centroids to one of 4 ETDRS quadrants
        (Superior, Inferior, Nasal, Temporal) based on their position
        relative to the estimated foveal centre.
        """
        if fovea_centre is None:
            return None
            
        cx, cy = fovea_centre
        sup, inf, nas, tem = 0, 0, 0, 0

        for px, py in points:
            dx = px - cx
            dy = py - cy

            if abs(dy) >= abs(dx):
                if dy < 0:
                    sup += 1
                else:
                    inf += 1
            else:
                if dx >= 0:
                    nas += 1
                else:
                    tem += 1

        return QuadrantCounts(superior=sup, inferior=inf, nasal=nas, temporal=tem)

    def extract_hemorrhage_centroids_from_mask(self, binary_mask: np.ndarray) -> list[tuple[int, int]]:
        """
        Extracts valid hemorrhage centroids from a binary lesion mask
        using connected component analysis.
        """
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary_mask)
        valid_centroids = []
        for i in range(1, num_labels):
            if stats[i, cv2.CC_STAT_AREA] >= 4:
                valid_centroids.append((int(centroids[i, 0]), int(centroids[i, 1])))
        return valid_centroids

    def audit_classification(
        self,
        predicted_grade=None,
        probabilities=None,
        quadrant_counts=None,
        **kwargs,
    ) -> tuple[int, str]:
        """
        Audits a borderline classifier prediction against ETDRS Rule 4.

        Returns (final_grade, rescue_note).
        """
        pred = predicted_grade if predicted_grade is not None else kwargs.get(
            "raw_pred", kwargs.get("raw_prediction", 0)
        )
        counts = quadrant_counts if quadrant_counts is not None else kwargs.get(
            "counts", kwargs.get("quadrant_counts")
        )
        probs = probabilities if probabilities is not None else kwargs.get(
            "probs", np.zeros(5)
        )

        if counts is None:
            return (pred, "MAINTAINED: No quadrant counts provided")

        rule_4_satisfied = counts.meets_rule_4(self.hemorrhage_threshold)

        if pred == 2 and rule_4_satisfied:
            return (3, "UPGRADED: ETDRS Rule 4 Verified (>=20 Hemorrhages + Microaneurysms in all 4 quadrants)")

        if pred == 3 and not rule_4_satisfied:
            if len(probs) > 2 and probs[2] > 0.3:
                return (2, "DOWNGRADED: Failed ETDRS Rule 4 (Insufficient 4-quadrant H/Ma distribution)")

        return (pred, "MAINTAINED: Diagnostic Concordance Confirmed")
