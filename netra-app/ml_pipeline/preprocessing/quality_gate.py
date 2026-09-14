"""
preprocessing/quality_gate.py
NetramNova Quality Gate — OpenCV-based fundus image adequacy checker.

Evaluates three quality axes:
  1. Focus score   : Laplacian variance (sharpness)
  2. Glare ratio   : % overexposed pixels (>250 intensity)
  3. FOV coverage  : % pixels inside retinal circle vs bounding box

Returns PASS / FAIL with per-axis subscores for downstream logging.
"""

from __future__ import annotations
import cv2
import numpy as np


# ─── Thresholds ────────────────────────────────────────────────────────────────
FOCUS_MIN   = 25.0    # Laplacian variance (lower → blurry)
GLARE_MAX   = 8.0     # Maximum % overexposed pixels
FOV_MIN     = 35.0    # Minimum retinal circle coverage %


def _focus_score(gray: np.ndarray) -> float:
    """Laplacian variance — higher is sharper."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _glare_ratio(gray: np.ndarray) -> float:
    """Percentage of pixels with intensity > 250."""
    overexposed = np.sum(gray > 250)
    total = gray.size
    return (overexposed / total) * 100.0


def _fov_coverage(gray: np.ndarray) -> float:
    """
    Estimate retinal field-of-view coverage.
    Thresholds dark background and fits a circle to the retinal region.
    Returns coverage (%) = retinal_area / bounding_box_area * 100.
    """
    _, mask = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE,
                            np.ones((15, 15), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return 0.0
    largest = max(contours, key=cv2.contourArea)
    (_, _), radius = cv2.minEnclosingCircle(largest)
    circle_area = np.pi * radius ** 2
    h, w = gray.shape
    bbox_area = h * w
    return min((circle_area / bbox_area) * 100.0, 100.0)


def check_quality(image_bgr: np.ndarray) -> dict:
    """
    Run all quality checks on a BGR fundus image.

    Returns
    -------
    dict with keys:
        passed      : bool  — overall PASS/FAIL
        focus       : float
        glare_pct   : float
        fov_pct     : float
        reason      : str   — human-readable failure reason or 'OK'
    """
    if image_bgr is None or not hasattr(image_bgr, "size") or image_bgr.size == 0:
        return {
            "passed": False,
            "quality_tier": "RED",
            "route": "recapture_required",
            "technician_feedback": "UNGRADEABLE: Empty or corrupt image file.",
            "focus": 0.0,
            "glare_pct": 100.0,
            "fov_pct": 0.0,
            "reason": "Image is empty or None",
        }

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    focus    = _focus_score(gray)
    glare    = _glare_ratio(gray)
    fov      = _fov_coverage(gray)

    failures = []
    if focus < FOCUS_MIN:
        failures.append(f"Focus inadequate ({focus:.1f} < {FOCUS_MIN}): Motion or defocus blur")
    if glare > GLARE_MAX:
        failures.append(f"Glare excessive ({glare:.1f}% > {GLARE_MAX}%): Saturated specular flash artifact")
    if fov < FOV_MIN:
        failures.append(f"FOV limited ({fov:.1f}% < {FOV_MIN}%): Retinal eye cup decentered")

    # Tri-Color Quality Router
    # RED: Severe glare (>8%) or extreme blur (<5.0) or minimal FOV (<20%) -> Reject & Recapture
    # AMBER: Borderline focus (5.0 - 25.0) or mild peripheral shadow -> Adaptive Ben Graham Enhancement
    # GREEN: Optimal scan (Focus >= 25.0, Glare <= 3.0%, FOV >= 35%) -> Direct pass
    if glare > GLARE_MAX or focus < 5.0 or fov < 20.0:
        quality_tier = "RED"
        technician_feedback = "UNGRADEABLE: Saturated flash reflection or severe blur. Adjust patient alignment and recapture immediately."
        route = "recapture_required"
    elif focus < 25.0 or fov < FOV_MIN or (glare > 2.0 and glare <= GLARE_MAX):
        quality_tier = "AMBER"
        technician_feedback = "BORDERLINE: Mild underexposure or peripheral shadow. Routing to Adaptive Ben Graham Illumination Standardization."
        route = "adaptive_enhancement"
    else:
        quality_tier = "GREEN"
        technician_feedback = "OPTIMAL: Sharp focus, uniform illumination, and centered retinal field. Direct pass to classifier."
        route = "direct_pass"

    return {
        "passed":              quality_tier != "RED",
        "quality_tier":        quality_tier,
        "route":               route,
        "technician_feedback": technician_feedback,
        "focus":               round(focus, 2),
        "glare_pct":           round(glare, 2),
        "fov_pct":             round(fov, 2),
        "reason":              "OK" if not failures else "; ".join(failures),
    }


def filter_image_list(paths: list[str]) -> tuple[list[str], list[dict]]:
    """
    Filter a list of image paths, returning (passed_paths, all_reports).
    Useful during dataset preprocessing to skip low-quality scans.
    """
    passed, reports = [], []
    for p in paths:
        img = cv2.imread(p)
        if img is None:
            reports.append({"path": p, "passed": False, "reason": "unreadable"})
            continue
        report = check_quality(img)
        report["path"] = p
        reports.append(report)
        if report["passed"]:
            passed.append(p)
    return passed, reports
