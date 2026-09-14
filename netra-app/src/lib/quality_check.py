"""
Netra Step 2: Fundus Image Quality Check (Python OpenCV Reference Implementation)
Runs 4 clinical quality checks before DR AI inference:
1. FOV Masking & Coverage Ratio (CR_FOV)
2. Focus Score via Modified Laplacian Variance (Var(Laplacian))
3. Illumination Uniformity (Mean Green Channel Luminance)
4. Saturation & Glare Ratio
"""

import cv2
import numpy as np
from typing import Dict, Any, List

def analyze_fundus_quality(image_path_or_bytes) -> Dict[str, Any]:
    # 1. Load Image
    if isinstance(image_path_or_bytes, str):
        img = cv2.imread(image_path_or_bytes)
    else:
        nparr = np.frombuffer(image_path_or_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return {
            "gradable": False,
            "quality_status": "rejected",
            "rejection_reasons": ["Invalid or corrupt image file"],
        }

    # Resize to standard width 512 for fast edge execution
    h, w = img.shape[:2]
    target_w = 512
    scale = target_w / float(w)
    img_resized = cv2.resize(img, (target_w, int(h * scale)), interpolation=cv2.INTER_AREA)
    
    # Extract Green Channel (Highest contrast for retinal structures)
    green_ch = img_resized[:, :, 1]
    
    # 2. Compute FOV Mask (Threshold background pixels)
    gray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2GRAY)
    _, fov_mask = cv2.threshold(gray, 20, 255, cv2.THRESH_BINARY)
    
    fov_pixels = cv2.countNonZero(fov_mask)
    total_pixels = img_resized.shape[0] * img_resized.shape[1]
    fov_coverage_ratio = fov_pixels / float(total_pixels)

    if fov_pixels == 0:
        return {
            "gradable": False,
            "quality_status": "rejected",
            "rejection_reasons": ["No retinal field detected (Black Image)"],
        }

    # 3. Illumination & Glare Check
    mean_illumination = cv2.mean(green_ch, mask=fov_mask)[0]
    
    # Saturated glare pixels (intensity > 245 inside FOV)
    _, glare_mask = cv2.threshold(green_ch, 245, 255, cv2.THRESH_BINARY)
    glare_mask = cv2.bitwise_and(glare_mask, fov_mask)
    glare_pixels = cv2.countNonZero(glare_mask)
    glare_ratio = glare_pixels / float(fov_pixels)

    # 4. Focus Score (Laplacian Variance inside FOV)
    laplacian = cv2.Laplacian(green_ch, cv2.CV_64F)
    # Mask out background to prevent edge boundary artificially inflating score
    kernel = np.ones((5, 5), np.uint8)
    eroded_fov = cv2.erode(fov_mask, kernel, iterations=2)
    
    laplacian_fov = laplacian[eroded_fov > 0]
    if len(laplacian_fov) > 0:
        focus_score = float(np.var(laplacian_fov))
    else:
        focus_score = 0.0

    # 5. Clinical Rejection Thresholds
    rejection_reasons: List[str] = []

    if fov_coverage_ratio < 0.35:
        rejection_reasons.append("Insufficient Retinal Field of View (<35% of frame)")
    
    if focus_score < 60.0:
        rejection_reasons.append(f"Out of Focus / Blurry (Laplacian Variance: {focus_score:.1f} < 60.0)")

    if mean_illumination < 25.0:
        rejection_reasons.append(f"Severe Under-Exposure (Mean Luminance: {mean_illumination:.1f} < 25.0)")
    elif mean_illumination > 225.0:
        rejection_reasons.append(f"Severe Over-Exposure / Flash Saturation ({mean_illumination:.1f} > 225.0)")

    if glare_ratio > 0.08:
        rejection_reasons.append(f"Corneal Glare / Flash Reflection (>8% saturated pixels)")

    gradable = len(rejection_reasons) == 0
    if gradable:
        quality_status = "passed" if focus_score >= 100.0 and glare_ratio <= 0.03 else "warning"
    else:
        quality_status = "rejected"

    return {
        "gradable": gradable,
        "quality_status": quality_status,
        "rejection_reasons": rejection_reasons,
        "fov_coverage_ratio": round(fov_coverage_ratio, 3),
        "focus_score": round(focus_score, 1),
        "mean_illumination": round(mean_illumination, 1),
        "glare_ratio": round(glare_ratio, 3),
        "retina_visible": fov_coverage_ratio >= 0.35 and mean_illumination >= 25.0,
    }

if __name__ == "__main__":
    print("Step 2 Quality Check Engine initialized.")
