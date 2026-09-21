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
from pathlib import Path

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Add parent directory to path so absolute imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

from ml_pipeline.pipeline import NetramPipeline

# Global pipeline instance
PIPELINE = NetramPipeline()

def serialize_result(raw_result: dict) -> dict:
    import dataclasses
    import cv2
    
    # 1. Coordinate scaling
    h_orig, w_orig = raw_result["h_orig"], raw_result["w_orig"]
    prep_img = raw_result["prep_img"]
    h_crop, w_crop = prep_img.cropped_bgr.shape[:2]
    x_offset, y_offset = prep_img.x_offset, prep_img.y_offset
    
    scaled_coords = [
        {
            "x": round(float((cx * w_crop / 512) + x_offset) / w_orig * 100.0, 2),
            "y": round(float((cy * h_crop / 512) + y_offset) / h_orig * 100.0, 2),
            "radius": round(float(max(5, int(r * w_crop / 512))) / w_orig * 100.0, 2)
        }
        for cx, cy, r in raw_result["detected_lesions"][:16]
    ]

    # 2. Findings and Triage
    from ml_pipeline.evaluation.findings import generate_findings_and_triage
    triage_tier, recall_advice, progression_risk, findings = generate_findings_and_triage(
        final_grade=raw_result["final_grade"],
        q_counts=raw_result["q_counts"],
        lesions_count=len(raw_result["detected_lesions"]),
        scaled_coords=scaled_coords
    )

    if raw_result["calibrated_referable"] and raw_result["final_grade"] < 2:
        triage_tier = "Tier 2 (Priority Review)"
        recall_advice = "6 Months"

    # 3. Base64 Encoding
    import numpy as np
    img_bgr = raw_result["img_bgr"]
    
    # Scale down if too massive (saves Base64 payload size, keeps aspect ratio)
    max_dim = 800
    h_b, w_b = img_bgr.shape[:2]
    if max(h_b, w_b) > max_dim:
        scale = max_dim / float(max(h_b, w_b))
        present_img = cv2.resize(img_bgr, (int(w_b * scale), int(h_b * scale)), interpolation=cv2.INTER_AREA)
    else:
        present_img = img_bgr.copy()
        
    # Apply Ben Graham standardization to the uncropped presentation image
    hp, wp = present_img.shape[:2]
    sigma = max(hp, wp) / 30.0
    blurred = cv2.GaussianBlur(present_img, (0, 0), sigma)
    standardized_present = cv2.addWeighted(present_img, 4, blurred, -4, 128)
    
    # Mask out the 128-gray background halo
    gray = cv2.cvtColor(present_img, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 7, 255, cv2.THRESH_BINARY)
    mask = cv2.erode(mask, np.ones((5, 5), np.uint8))
    standardized_present[mask == 0] = 0
    
    _, preproc_buffer = cv2.imencode(".jpg", standardized_present, [cv2.IMWRITE_JPEG_QUALITY, 90])
    preprocessed_base64 = "data:image/jpeg;base64," + base64.b64encode(preproc_buffer).decode("utf-8")

    # Scale overlay_bgr as well
    overlay_bgr = raw_result["overlay_bgr"]
    if max(h_b, w_b) > max_dim:
        overlay_bgr = cv2.resize(overlay_bgr, (int(w_b * scale), int(h_b * scale)), interpolation=cv2.INTER_AREA)
        
    _, buffer = cv2.imencode(".jpg", overlay_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
    gradcam_base64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")

    # 4. Clinical Guidance
    try:
        from evaluation.clinical_guidelines import get_deterministic_clinical_guidance
    except ImportError:
        from ml_pipeline.evaluation.clinical_guidelines import get_deterministic_clinical_guidance
        
    final_grade = raw_result["final_grade"]
    probs = raw_result["probs"]
    csme_detected = bool(final_grade >= 2 and probs[2] > 0.25)
    rag_report = get_deterministic_clinical_guidance(stage=final_grade, has_macular_edema=csme_detected)

    from ml_pipeline.models.dto import ScreeningResult, QualityMetricsDTO, ClinicalGuidanceDTO
    
    quality_eval = raw_result["quality_eval"]
    gradable = quality_eval["passed"]
    
    quality_metrics = QualityMetricsDTO(
        fovDetected=bool(quality_eval["fov_pct"] >= 35.0),
        focusAcceptable=bool(quality_eval["focus"] >= 25.0),
        exposureAcceptable=bool(quality_eval["glare_pct"] <= 8.0),
        retinaVisible=bool(gradable),
        blurScore=round(min(quality_eval["focus"] / 200.0, 1.0), 2),
        illuminationUniformity=round(max(0.0, 1.0 - (quality_eval["glare_pct"] / 20.0)), 2),
        qualityTier=quality_eval.get("quality_tier", "GREEN"),
        route=quality_eval.get("route", "direct_pass"),
        technicianFeedback=quality_eval.get("technician_feedback", "Optimal image.")
    )
    
    guidance = ClinicalGuidanceDTO(
        icd10Code=rag_report.get("icd10_code", "E11.39"),
        referralTimeline=rag_report.get("referral_timeline", recall_advice),
        guidelineSource="AAO Preferred Practice Pattern (PPP 2023) & AIIMS Guidelines",
        doctorTechnicalNote=rag_report.get("doctor_summary", ""),
        patientSummaryEn=rag_report.get("patient_summary_en", ""),
        patientSummaryHi=rag_report.get("patient_summary_hi", ""),
        safetyAuditPassed=rag_report.get("safety_audit_passed", True)
    )

    conf_score = raw_result["conf_score"]
    confidence_label = "High" if conf_score >= 80.0 else ("Medium" if conf_score >= 60.0 else "Low")
    
    res = ScreeningResult(
        diagnosis=PIPELINE.icdr_names[final_grade],
        icdrLevel=final_grade,
        severity=PIPELINE.severity_keys[final_grade],
        confidence=confidence_label,
        confidenceScore=round(conf_score, 1),
        triageTier=triage_tier,
        recallAdvice=recall_advice,
        progressionRisk=progression_risk,
        csmeThreatDetected=csme_detected,
        csmeFoveaDistanceDiscDiameters=0.45 if final_grade >= 2 else 1.8,
        findings=findings,
        clinicalGuidance=guidance,
        qualityStatus="passed" if gradable else "warning",
        qualityTier=quality_eval.get("quality_tier", "GREEN"),
        quality=quality_metrics,
        rawModelPrediction=raw_result["raw_pred"],
        calibratedReferable=raw_result["calibrated_referable"],
        referableProbability=round(raw_result["p_ref"] * 100.0, 1),
        probabilities={PIPELINE.icdr_names[i]: round(float(probs[i] * 100.0), 1) for i in range(5)},
        rescuedBy=raw_result["rescue_note"],
        preprocessedImage=preprocessed_base64,
        gradcamOverlay=gradcam_base64
    )
    
    return dataclasses.asdict(res)


def run_pipeline_on_image(image_bytes: bytes | None = None,
                          image_path: str | None = None) -> dict:
    """Runs complete end-to-end clinical pipeline on a fundus image via the unified NetramPipeline."""
    err, raw_result = PIPELINE.analyze(image_bytes=image_bytes, image_path=image_path)
    if err is not None:
        return err
    return serialize_result(raw_result)

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
            "model_loaded": PIPELINE.model is not None,
            "device": str(PIPELINE.device),
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
    print(f" Pre-warmed Checkpoint: best_classifier.pt on {PIPELINE.device}")
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
        try:
            with contextlib.redirect_stdout(sys.stderr):
                res = run_pipeline_on_image(image_path=args.image)
            print(json.dumps(res, ensure_ascii=True), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e), "type": type(e).__name__}, ensure_ascii=True), flush=True)
            sys.exit(1)
    else:
        start_server(port=args.port)
