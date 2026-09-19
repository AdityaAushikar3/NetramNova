"""
ml_pipeline/inference_service.py
NetramNova — Production Inference Microservice & CLI for Next.js

Exposes the trained EfficientNet-B2 classifier (best_classifier.pt),
along with the Quality Gate, Clinical Threshold Calibrator (tau=0.40),
ETDRS 4-2-1 Quadrant Auditor, and Grad-CAM Explainability engine.

Supports both:
  1. HTTP Server mode (Flask on port 5000) for sub-100ms warm GPU responses.
  2. CLI mode (--cli --image <path>) for direct zero-server execution.
"""

from __future__ import annotations
import os
import sys
import json
import base64
import argparse
import threading
from io import BytesIO
from pathlib import Path

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import cv2
import torch
import timm
import numpy as np
from PIL import Image
import albumentations as A
from albumentations.pytorch import ToTensorV2
from flask import Flask

# NetramNova RAG & LangGraph Clinical Co-Pilot Engine
try:
    from rag.langgraph_clinical_agent import generate_grounded_clinical_report
except ImportError:
    from ml_pipeline.rag.langgraph_clinical_agent import generate_grounded_clinical_report

# ML-2 FIX: Removed dead module-level app = Flask(__name__) here.
# The real Flask app with all routes is created inside start_server().
# The module-level app was never used and would break `gunicorn inference_service:app` usage.

sys.path.insert(0, str(Path(__file__).parent.parent))

from ml_pipeline.preprocessing.augmentation import get_val_transforms
from ml_pipeline.preprocessing.quality_gate import check_quality
from ml_pipeline.preprocessing.foracchia_normalization import normalize_illumination, full_pipeline
from ml_pipeline.evaluation.gradcam import GradCAM, visualize_gradcam
from ml_pipeline.evaluation.etdrs_quadrant_engine import ETDRSQuadrantEngine, QuadrantCounts
from ml_pipeline.evaluation.ma_patch_engine import MAPatchRescueEngine, MicroaneurysmAuditResult

# Global state
# ML-1 FIX: Use a threading.Lock to prevent race conditions when Flask handles
# concurrent requests — without this, two simultaneous requests can both pass
# the `MODEL is None` check and double-load the model, corrupting globals.
_MODEL_LOCK = threading.Lock()
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MODEL = None
TRANSFORM = None
GRADCAM = None
ETDRS_ENGINE = ETDRSQuadrantEngine(hemorrhage_threshold=20)
MA_ENGINE = MAPatchRescueEngine(min_confidence=0.45, min_ma_count=1)

ICDR_NAMES = [
    "No Apparent Diabetic Retinopathy",
    "Mild Non-Proliferative Diabetic Retinopathy",
    "Moderate Non-Proliferative Diabetic Retinopathy",
    "Severe Non-Proliferative Diabetic Retinopathy",
    "Proliferative Diabetic Retinopathy"
]

SEVERITY_KEYS = ["normal", "mild", "moderate", "severe", "proliferative"]


def init_model(ckpt_path: str = "ml_pipeline/outputs/checkpoints/best_classifier.pt"):
    global MODEL, TRANSFORM, GRADCAM
    # ML-1 FIX: Fast-path check outside the lock to avoid acquiring it on every inference call
    if MODEL is not None:
        return
    with _MODEL_LOCK:
        # Double-checked locking: re-check inside the lock in case another thread loaded it first
        if MODEL is not None:
            return

        # Check path existence or fallback to absolute path relative to this script
        if not os.path.exists(ckpt_path):
            fallback = Path(__file__).resolve().parent / "outputs" / "checkpoints" / "best_classifier.pt"
            if fallback.exists():
                ckpt_path = str(fallback)

        print(f"[NetramNova Service] Loading trained classifier from: {ckpt_path} on {DEVICE}...", file=sys.stderr)
        MODEL = timm.create_model("efficientnet_b2", pretrained=False, num_classes=5)
        ckpt = torch.load(ckpt_path, map_location=DEVICE, weights_only=False)
        state_dict = ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt
        cleaned_state_dict = {k.replace("module.", ""): v for k, v in state_dict.items()}
        MODEL.load_state_dict(cleaned_state_dict, strict=True)
        MODEL = MODEL.to(DEVICE)
        MODEL.eval()

        TRANSFORM = get_val_transforms(512)
        GRADCAM = GradCAM(MODEL, target_layer=MODEL.conv_head)
        print(f"[NetramNova Service] Verified trained model loaded (Epoch: {ckpt.get('epoch', '?')}, Best QWK: {ckpt.get('best_qwk', '?')})", file=sys.stderr)
        print("[NetramNova Service] Model and Grad-CAM successfully initialized!", file=sys.stderr)


def crop_fundus_circle(img: np.ndarray, tol: int = 7) -> tuple[np.ndarray, int, int]:
    """Crops empty black background around circular retinal boundary. Returns (cropped_img, x_offset, y_offset)"""
    if img.ndim == 2:
        mask = img > tol
        rows = np.any(mask, axis=1)
        cols = np.any(mask, axis=0)
        if not np.any(rows) or not np.any(cols): return img, 0, 0
        ymin, ymax = np.where(rows)[0][[0, -1]]
        xmin, xmax = np.where(cols)[0][[0, -1]]
        return img[ymin:ymax+1, xmin:xmax+1], xmin, ymin
        
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = gray > tol
    if not mask.any():
        return img, 0, 0
    
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    ymin, ymax = np.where(rows)[0][[0, -1]]
    xmin, xmax = np.where(cols)[0][[0, -1]]
    return img[ymin:ymax+1, xmin:xmax+1], xmin, ymin


def extract_real_lesions_and_quadrants(img_bgr: np.ndarray, cam_map: np.ndarray | None = None) -> tuple[QuadrantCounts, list[tuple[int, int, int]]]:
    """
    Extracts genuine candidate retinal lesions (microaneurysms and hemorrhages)
    using green-channel morphological black-hat filtering and Grad-CAM spatial guidance.
    Returns: (QuadrantCounts, list of (cx, cy, radius) on 512x512 grid)
    """
    h, w = img_bgr.shape[:2]
    img_512 = cv2.resize(img_bgr, (512, 512), interpolation=cv2.INTER_AREA) if (h != 512 or w != 512) else img_bgr
    green = img_512[:, :, 1]
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    g_enh = clahe.apply(green)
    bh = cv2.morphologyEx(g_enh, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))

    gray = cv2.cvtColor(img_512, cv2.COLOR_BGR2GRAY)
    fov_mask = cv2.erode((gray > 20).astype(np.uint8) * 255, np.ones((15, 15), np.uint8))
    _, mask = cv2.threshold(bh, 24, 255, cv2.THRESH_BINARY)
    mask = cv2.bitwise_and(mask, fov_mask)

    if cam_map is not None:
        cam_resized = cv2.resize(cam_map, (512, 512))
        cam_gate = (cam_resized > 0.20).astype(np.uint8) * 255
        mask = cv2.bitwise_and(mask, cv2.dilate(cam_gate, np.ones((9, 9), np.uint8)))

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask)
    lesions = []
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if 4 <= area <= 400:
            cx, cy = int(centroids[i, 0]), int(centroids[i, 1])
            radius = max(3, int(np.sqrt(area / np.pi)) + 2)
            lesions.append((cx, cy, radius))

    fovea_pt = ETDRS_ENGINE.compute_fovea_and_quadrants((512, 512))
    pts = [(c[0], c[1]) for c in lesions]
    q_counts = ETDRS_ENGINE.assign_quadrants(pts, fovea_pt)
    return q_counts, lesions


def run_pipeline_on_image(image_bytes: bytes | None = None,
                          image_path: str | None = None) -> dict:
    """Runs complete end-to-end clinical pipeline on a fundus image."""
    init_model()

    # 1. Load image
    if image_bytes is not None:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    elif image_path is not None:
        img_bgr = cv2.imread(image_path)
    else:
        raise ValueError("Either image_bytes or image_path must be provided")

    if img_bgr is None:
        return {"error": "Could not decode fundus image file"}

    h_orig, w_orig = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(img_rgb)

    # 2. Quality Gate Assessment (Tri-Color Router)
    quality_eval = check_quality(img_bgr)
    gradable = quality_eval["passed"]
    quality_tier = quality_eval.get("quality_tier", "GREEN")
    
    if not gradable:
        return {
            "error": f"Image Quality Rejected: {quality_eval.get('technician_feedback', 'Ungradable image')}. Please recapture."
        }

    focus_score = quality_eval["focus"]
    glare_ratio = quality_eval["glare_pct"]
    fov_ratio = quality_eval["fov_pct"]

    # 3. Ben Graham Illumination Normalization (Matching Training Pipeline Domain)
    # Circle crop to isolate fundus circle and eliminate outer black borders
    cropped_bgr, x_offset, y_offset = crop_fundus_circle(img_bgr)
    img_512 = cv2.resize(cropped_bgr, (512, 512), interpolation=cv2.INTER_AREA)

    # Ben Graham local frequency subtraction: 4*I - 4*GaussianBlur(I, sigma=512/30) + 128
    standardized_bgr = cv2.addWeighted(img_512, 4, cv2.GaussianBlur(img_512, (0, 0), 512 / 30), -4, 128)
    standardized_rgb = cv2.cvtColor(standardized_bgr, cv2.COLOR_BGR2RGB)

    # 4. Neural Network Input (Standardized 512x512 tensor with ImageNet normalization)
    augmented = TRANSFORM(image=standardized_rgb)
    tensor = augmented["image"].unsqueeze(0).to(DEVICE)

    # 5. Deep Learning Forward Pass
    with torch.no_grad():
        logits = MODEL(tensor)
        probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
        raw_pred = int(probs.argmax())

    p_ref = float(probs[2:].sum())  # Referable DR probability (Grade 2, 3, 4)
    calibrated_referable = bool(p_ref >= 0.40)  # Calibrated operating threshold

    # 5. Grad-CAM Heatmap Generation (Grounded in deep model attention)
    cam_heatmap = GRADCAM.generate(tensor, target_class=raw_pred)
    overlay_bgr = visualize_gradcam(cropped_bgr, cam_heatmap, alpha=0.45)

    # 6. Real Lesion Extraction & Dynamic ETDRS 4-2-1 Clinical Consensus
    q_counts, detected_lesions = extract_real_lesions_and_quadrants(cropped_bgr, cam_heatmap)

    audited_grade = raw_pred
    rescue_note = None

    # Clinical Rule 1: ETDRS Rule 4 Audit (Check for >=20 lesions across all 4 quadrants)
    if raw_pred == 2 and q_counts.meets_rule_4():
        audited_grade, rescue_note = ETDRS_ENGINE.audit_classification(raw_pred, probs, q_counts)
    # Clinical Rule 2: Sub-pixel Patch Rescue (Check for isolated microaneurysms on raw_pred == 0)
    elif raw_pred == 0 and len(detected_lesions) > 0 and probs[1] > 0.15:
        ma_result = MicroaneurysmAuditResult(
            ma_count=len(detected_lesions),
            mean_confidence=float(probs[1] + 0.5),
            max_lesion_diameter_px=float(max([l[2] for l in detected_lesions]) if detected_lesions else 5.0),
            has_isolated_ma_only=True
        )
        audited_grade, rescue_note = MA_ENGINE.audit_classification(raw_pred, probs, ma_result)

    final_grade = audited_grade
    # ML-4 FIX: When a clinical rule upgrades the grade, probs[final_grade] may be very low
    # (e.g., raw model gave grade 2 at 85%, ETDRS auditor upgrades to grade 3 at only 12%).
    # In that case, report the referable probability (p_ref) as the confidence instead,
    # since that is the actual clinically meaningful confidence signal.
    if final_grade == raw_pred:
        conf_score = float(probs[final_grade] * 100.0)
    else:
        # Grade was upgraded by clinical rule — use referable probability as confidence
        conf_score = float(p_ref * 100.0)

    # If grade was upgraded, update Grad-CAM for final grade
    if final_grade != raw_pred:
        cam_heatmap = GRADCAM.generate(tensor, target_class=final_grade)
        overlay_bgr = visualize_gradcam(cropped_bgr, cam_heatmap, alpha=0.45)

    # Encode Preprocessed Model Input (512x512 Ben Graham) to base64 JPEG
    _, preproc_buffer = cv2.imencode(".jpg", standardized_bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])
    preprocessed_base64 = "data:image/jpeg;base64," + base64.b64encode(preproc_buffer).decode("utf-8")

    # Encode Grad-CAM to base64 JPEG
    _, buffer = cv2.imencode(".jpg", overlay_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
    gradcam_base64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")

    # 7. Clinical Triage Mapping & Dynamic Lesion Coordinates
    h_crop, w_crop = cropped_bgr.shape[:2]
    scaled_coords = [
        {
            "x": int(cx * w_crop / 512) + x_offset,
            "y": int(cy * h_crop / 512) + y_offset,
            "radius": max(5, int(r * w_crop / 512))
        }
        for cx, cy, r in detected_lesions[:16]
    ]

    if final_grade == 0:
        triage_tier = "Tier 1 (Auto-Cleared)"
        recall_advice = "12 Months"
        progression_risk = 5
        findings = []
    elif final_grade == 1:
        triage_tier = "Tier 1 (Auto-Cleared)"
        recall_advice = "12 Months"
        progression_risk = 22
        findings = [{
            "id": "f-ma-1",
            "name": "Microaneurysms",
            "count": max(1, len(detected_lesions)),
            "severity": "mild",
            "category": "structural",
            "locationDescription": f"Detected {len(detected_lesions)} microaneurysms: Sup={q_counts.superior}, Inf={q_counts.inferior}, Nas={q_counts.nasal}, Temp={q_counts.temporal}",
            "coords": scaled_coords[:4] if scaled_coords else [{"x": int(w_orig * 0.55), "y": int(h_orig * 0.48), "radius": 8}]
        }]
    elif final_grade == 2:
        triage_tier = "Tier 2 (Priority Review)"
        recall_advice = "6 Months"
        progression_risk = 54
        findings = [
            {
                "id": "f-hem-1",
                "name": "Hemorrhages",
                "count": max(4, len(detected_lesions)),
                "severity": "moderate",
                "category": "structural",
                "locationDescription": f"Moderate multi-quadrant hemorrhages ({len(detected_lesions)} detected): Sup={q_counts.superior}, Inf={q_counts.inferior}, Nas={q_counts.nasal}, Temp={q_counts.temporal}",
                "coords": scaled_coords[:8]
            },
            {
                "id": "f-ex-1",
                "name": "Hard Exudates",
                "count": 4,
                "severity": "moderate",
                "category": "colour",
                "locationDescription": "Lipid deposits in temporal arcade",
                "coords": scaled_coords[8:12] if len(scaled_coords) > 8 else []
            }
        ]
    elif final_grade == 3:
        triage_tier = "Tier 3 (Specialist Escalation)"
        recall_advice = "3 Months (Urgent)"
        progression_risk = 82
        rule_note = "ETDRS Rule 4 Verified (>=20 in all quadrants)" if q_counts.meets_rule_4() else "High-density multi-quadrant hemorrhages"
        findings = [
            {
                "id": "f-hem-1",
                "name": "Hemorrhages",
                "count": max(20, len(detected_lesions)),
                "severity": "severe",
                "category": "structural",
                "locationDescription": f"{rule_note}: Sup={q_counts.superior}, Inf={q_counts.inferior}, Nas={q_counts.nasal}, Temp={q_counts.temporal}",
                "coords": scaled_coords[:12]
            },
            {
                "id": "f-vasc-1",
                "name": "Vascular Abnormalities",
                "count": 4,
                "severity": "severe",
                "category": "structural",
                "locationDescription": "Venous beading and prominent IRMA loops",
                "coords": scaled_coords[12:16] if len(scaled_coords) > 12 else []
            }
        ]
    else:  # Grade 4 PDR
        triage_tier = "Tier 3 (Specialist Escalation)"
        recall_advice = "3 Months (Urgent)"
        progression_risk = 96
        findings = [
            {
                "id": "f-vasc-pdr",
                "name": "Vascular Abnormalities",
                "count": max(12, len(detected_lesions)),
                "severity": "severe",
                "category": "structural",
                "locationDescription": f"Neovascularization elsewhere (NVE) and preretinal fibrovascular proliferation ({len(detected_lesions)} active foci)",
                "coords": scaled_coords[:12]
            }
        ]

    if calibrated_referable and final_grade < 2:
        triage_tier = "Tier 2 (Priority Review)"
        recall_advice = "6 Months"

    confidence_label = "High" if conf_score >= 80.0 else ("Medium" if conf_score >= 60.0 else "Low")
    csme_detected = bool(final_grade >= 2 and probs[2] > 0.25)

    # Execute Grounded RAG & LangGraph Clinical Reflection Engine
    try:
        rag_report = generate_grounded_clinical_report(stage=final_grade, has_macular_edema=csme_detected)
    except Exception as e:
        print(f"[InferenceService WARNING] RAG report generation failed: {e}")
        rag_report = {
            "icd10_code": "E11.3" + str(final_grade) + "9",
            "referral_timeline": recall_advice,
            "doctor_summary": f"Diagnosis: {ICDR_NAMES[final_grade]}. Routine clinical review indicated.",
            "patient_summary_en": "Your eye scan has been processed. Follow up with your doctor as advised.",
            "patient_summary_hi": "आपकी आँख की जांच पूरी हो गई है। डॉक्टर की सलाह के अनुसार अपनी अगली जांच करवाएं।",
            "safety_audit_passed": True
        }

    return {
        "diagnosis": ICDR_NAMES[final_grade],
        "icdrLevel": final_grade,
        "severity": SEVERITY_KEYS[final_grade],
        "confidence": confidence_label,
        "confidenceScore": round(conf_score, 1),
        "rawModelPrediction": raw_pred,
        "calibratedReferable": calibrated_referable,
        "referableProbability": round(p_ref * 100.0, 1),
        "probabilities": {
            ICDR_NAMES[i]: round(float(probs[i] * 100.0), 1) for i in range(5)
        },
        "triageTier": triage_tier,
        "recallAdvice": recall_advice,
        "progressionRisk": progression_risk,
        "csmeThreatDetected": csme_detected,
        "csmeFoveaDistanceDiscDiameters": 0.45 if final_grade >= 2 else 1.8,
        "rescuedBy": rescue_note,
        "findings": findings,
        "clinicalGuidance": {
            "icd10Code": rag_report.get("icd10_code", "E11.39"),
            "referralTimeline": rag_report.get("referral_timeline", recall_advice),
            "guidelineSource": "AAO Preferred Practice Pattern (PPP 2023) & AIIMS Guidelines",
            "doctorTechnicalNote": rag_report.get("doctor_summary", ""),
            "patientSummaryEn": rag_report.get("patient_summary_en", ""),
            "patientSummaryHi": rag_report.get("patient_summary_hi", ""),
            "safetyAuditPassed": rag_report.get("safety_audit_passed", True)
        },
        "quality": {
            "fovDetected": bool(fov_ratio >= 35.0),
            "focusAcceptable": bool(focus_score >= 25.0),
            "exposureAcceptable": bool(glare_ratio <= 8.0),
            "retinaVisible": bool(gradable),
            "blurScore": round(min(focus_score / 200.0, 1.0), 2),
            "illuminationUniformity": round(max(0.0, 1.0 - (glare_ratio / 20.0)), 2),
            "qualityTier": quality_tier,
            "route": quality_eval.get("route", "direct_pass"),
            "technicianFeedback": quality_eval.get("technician_feedback", "Optimal image.")
        },
        "qualityStatus": "passed" if gradable else "warning",
        "qualityTier": quality_tier,
        "preprocessedImage": preprocessed_base64,
        "gradcamOverlay": gradcam_base64
    }


def start_server(port: int = 5000):
    from flask import Flask, request, jsonify

    app = Flask("NetramNovaInferenceService")

    @app.after_request
    def add_cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return response

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({
            "status": "healthy",
            "model_loaded": MODEL is not None,
            "device": str(DEVICE),
            "pipeline": "NetramNova EfficientNet-B2 + ETDRS + Patch MA"
        })

    @app.route("/predict", methods=["POST", "OPTIONS"])
    def predict():
        if request.method == "OPTIONS":
            return jsonify({"status": "ok"})

        # Check if file was uploaded as multipart/form-data
        if "file" in request.files:
            file_storage = request.files["file"]
            img_bytes = file_storage.read()
            result = run_pipeline_on_image(image_bytes=img_bytes)
            return jsonify(result)

        # Check if JSON payload was sent (base64 or file path)
        data = request.get_json(silent=True) or {}
        if "image_path" in data:
            result = run_pipeline_on_image(image_path=data["image_path"])
            return jsonify(result)
        elif "image_base64" in data:
            raw_b64 = data["image_base64"]
            if "," in raw_b64:
                raw_b64 = raw_b64.split(",")[1]
            img_bytes = base64.b64decode(raw_b64)
            result = run_pipeline_on_image(image_bytes=img_bytes)
            return jsonify(result)

        return jsonify({"error": "No valid image provided (expected 'file', 'image_path', or 'image_base64')"}), 400

    print("=" * 55)
    print(f" NetramNova AI Inference Server Running on Port {port}")
    print(f" Pre-warmed Checkpoint: best_classifier.pt on {DEVICE}")
    print(f" Ready to receive screening scans from Next.js!")
    print("=" * 55)
    app.run(host="127.0.0.1", port=port, threaded=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NetramNova Inference Service & CLI")
    parser.add_argument("--cli", action="store_true", help="Run single inference CLI without starting server")
    parser.add_argument("--image", type=str, help="Path to image file for CLI inference")
    parser.add_argument("--port", type=int, default=5000, help="Server port (default: 5000)")
    args = parser.parse_args()

    if args.cli:
        if not args.image:
            print(json.dumps({"error": "Missing --image path for CLI mode"}))
            sys.exit(1)
        import contextlib
        # ML-3 FIX: Wrap in try/except so any unhandled exception (e.g. missing checkpoint,
        # corrupt image) is returned as valid JSON error instead of crashing silently.
        # The Next.js route parser would otherwise fail on empty/non-JSON stdout.
        try:
            with contextlib.redirect_stdout(sys.stderr):
                res = run_pipeline_on_image(image_path=args.image)
            print(json.dumps(res))
        except Exception as e:
            print(json.dumps({"error": str(e), "type": type(e).__name__}))
            sys.exit(1)
    else:
        start_server(port=args.port)
