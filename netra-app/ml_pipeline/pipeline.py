import os
import sys
import threading
from pathlib import Path
import base64

import cv2
import torch
import timm
import numpy as np
from PIL import Image, ImageOps
import io

try:
    from evaluation.clinical_guidelines import get_deterministic_clinical_guidance
except ImportError:
    from ml_pipeline.evaluation.clinical_guidelines import get_deterministic_clinical_guidance

from ml_pipeline.preprocessing.augmentation import get_val_transforms
from ml_pipeline.preprocessing.quality_gate import check_quality
from ml_pipeline.preprocessing.model_input import prepare_model_input
from ml_pipeline.evaluation.gradcam import GradCAM, visualize_gradcam
from ml_pipeline.evaluation.etdrs_quadrant_engine import ETDRSQuadrantEngine, QuadrantCounts
from ml_pipeline.evaluation.ma_patch_engine import MAPatchRescueEngine, MicroaneurysmAuditResult
from ml_pipeline.models.segmentation_model import PrismDRYoloWrapper
class NetramPipeline:
    def __init__(self, ckpt_path: str = "ml_pipeline/outputs/checkpoints/best_classifier.pt"):
        self.ckpt_path = ckpt_path
        self._lock = threading.Lock()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.transform = None
        self.gradcam = None
        self.etdrs_engine = ETDRSQuadrantEngine(hemorrhage_threshold=20)
        self.ma_engine = MAPatchRescueEngine(min_confidence=0.45, min_ma_count=1)

        self.icdr_names = [
            "No Apparent Diabetic Retinopathy",
            "Mild Non-Proliferative Diabetic Retinopathy",
            "Moderate Non-Proliferative Diabetic Retinopathy",
            "Severe Non-Proliferative Diabetic Retinopathy",
            "Proliferative Diabetic Retinopathy"
        ]
        self.severity_keys = ["normal", "mild", "moderate", "severe", "proliferative"]

    def _ensure_model_loaded(self):
        if self.model is not None:
            return
        with self._lock:
            if self.model is not None:
                return

            ckpt_path = self.ckpt_path
            if not os.path.exists(ckpt_path):
                fallback = Path(__file__).resolve().parent / "outputs" / "checkpoints" / "best_classifier.pt"
                if fallback.exists():
                    ckpt_path = str(fallback)

            print(f"[NetramNova Pipeline] Loading trained classifier from: {ckpt_path} on {self.device}...", file=sys.stderr)
            self.model = timm.create_model("efficientnet_b2", pretrained=False, num_classes=5)
            ckpt = torch.load(ckpt_path, map_location=self.device, weights_only=False)
            state_dict = ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt
            cleaned_state_dict = {k.replace("module.", ""): v for k, v in state_dict.items()}
            self.model.load_state_dict(cleaned_state_dict, strict=True)
            self.model = self.model.to(self.device)
            self.model.eval()

            # Freeze all parameters to prevent massive RAM spikes during Grad-CAM backward()
            for param in self.model.parameters():
                param.requires_grad_(False)
            
            # Unfreeze only the head layers needed for Grad-CAM
            for param in self.model.conv_head.parameters():
                param.requires_grad_(True)
            if hasattr(self.model, 'bn2'):
                for param in self.model.bn2.parameters():
                    param.requires_grad_(True)
            if hasattr(self.model, 'classifier'):
                for param in self.model.classifier.parameters():
                    param.requires_grad_(True)

            self.transform = get_val_transforms(512)
            self.gradcam = GradCAM(self.model, target_layer=self.model.conv_head)
            
            ckpt_dir = os.path.dirname(ckpt_path)
            self.yolo_models = PrismDRYoloWrapper(checkpoints_dir=ckpt_dir)
            
            print(f"[NetramNova Pipeline] Verified trained model loaded (Epoch: {ckpt.get('epoch', '?')}, Best QWK: {ckpt.get('best_qwk', '?')})", file=sys.stderr)
            print("[NetramNova Pipeline] Model and Grad-CAM successfully initialized!", file=sys.stderr)

    def _extract_real_lesions_and_quadrants(self, img_512: np.ndarray) -> tuple[QuadrantCounts | None, list[tuple[int, int, int, str, float]]]:
        """Runs the 4 PRISM-DR YOLO models on the colorful image to find real lesions."""
        lesions = self.yolo_models.predict_lesions(img_512)

        fovea_pt = self.etdrs_engine.compute_fovea_and_quadrants(img_512)
        pts = [(c[0], c[1]) for c in lesions]
        q_counts = self.etdrs_engine.assign_quadrants(pts, fovea_pt)
        return q_counts, lesions

    @staticmethod
    def _load_bgr_exif_corrected(image_bytes: bytes | None = None, image_path: str | None = None) -> np.ndarray | None:
        """
        Decode an uploaded fundus photo into a BGR numpy array whose pixel grid
        matches what a browser <img>/<canvas> will actually display.

        cv2.imread/imdecode ignore the EXIF "Orientation" tag entirely and return
        the raw, un-rotated pixel grid. Browsers (Chrome/Firefox/Safari) DO apply
        EXIF orientation when decoding JPEGs for display. Since the frontend shows
        the original file as a data: URL and overlays lesion markers using
        percentages computed against cv2's (un-rotated) width/height, any photo
        carrying orientation metadata (extremely common for phone/clip-on fundus
        camera captures) causes every marker to land in the wrong place relative
        to what the user sees - typically off by a 90/180/270 degree rotation or
        a mirror flip.

        Fix: normalize orientation with PIL (which does honor EXIF) BEFORE any
        width/height is measured or any crop offset is computed, so every
        downstream pixel coordinate agrees with the rotated image the browser
        renders.
        """
        try:
            if image_bytes is not None:
                pil_img = Image.open(io.BytesIO(image_bytes))
            elif image_path is not None:
                pil_img = Image.open(image_path)
            else:
                raise ValueError("Either image_bytes or image_path must be provided")

            # Bake the EXIF orientation into the actual pixel data and drop the tag,
            # so every later consumer (cv2, and the browser re-reading these bytes)
            # agrees on what "up" means.
            pil_img = ImageOps.exif_transpose(pil_img)
            pil_img = pil_img.convert("RGB")

            rgb = np.array(pil_img)
            return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        except Exception:
            return None

    def analyze(self, image_bytes: bytes | None = None, image_path: str | None = None) -> tuple[dict | None, dict]:
        """
        Returns (error_dict, None) if failed, else (None, raw_result_dict)
        where raw_result_dict contains the ML outputs, PrepImage, and overlay.
        """
        self._ensure_model_loaded()

        if image_bytes is None and image_path is None:
            raise ValueError("Either image_bytes or image_path must be provided")

        img_bgr = self._load_bgr_exif_corrected(image_bytes=image_bytes, image_path=image_path)

        if img_bgr is None:
            return {"error": "Could not decode fundus image file"}, {}
            
        h_orig, w_orig = img_bgr.shape[:2]

        quality_eval = check_quality(img_bgr)
        gradable = quality_eval["passed"]
        
        if not gradable:
            return {
                "error": f"Image Quality Rejected: {quality_eval.get('technician_feedback', 'Ungradable image')}. Please recapture."
            }, {}

        prep_img = prepare_model_input(img_bgr)

        augmented = self.transform(image=prep_img.standardized_rgb)
        tensor = augmented["image"].unsqueeze(0).to(self.device)

        self.model.eval()
        self.model.zero_grad()

        logits = self.model(tensor)
        probs = torch.softmax(logits, dim=1).detach().cpu().numpy()[0]
        raw_pred = int(probs.argmax())

        p_ref = float(probs[2:].sum())
        calibrated_referable = bool(p_ref >= 0.40)

        # Trigger backward pass to capture Grad-CAM gradients from the main forward pass
        self.model.zero_grad()
        score = logits[0, raw_pred]
        score.backward(retain_graph=True)
        cam_heatmap = self.gradcam.compute_map_from_hooks()
        
        q_counts, detected_lesions = self._extract_real_lesions_and_quadrants(prep_img.pre_ben_graham_512)

        audited_grade = raw_pred
        rescue_note = None

        if raw_pred == 2 and q_counts.meets_rule_4():
            audited_grade, rescue_note = self.etdrs_engine.audit_classification(raw_pred, probs, q_counts)
        elif raw_pred == 0 and len(detected_lesions) > 0 and probs[1] > 0.15:
            ma_result = MicroaneurysmAuditResult(
                ma_count=len(detected_lesions),
                mean_confidence=float(probs[1] + 0.5),
                max_lesion_diameter_px=float(max([l[2] for l in detected_lesions]) if detected_lesions else 5.0),
                has_isolated_ma_only=True
            )
            audited_grade, rescue_note = self.ma_engine.audit_classification(raw_pred, probs, ma_result)

        final_grade = audited_grade
        if final_grade == raw_pred:
            conf_score = float(probs[final_grade] * 100.0)
        else:
            conf_score = float(p_ref * 100.0)

        if final_grade != raw_pred:
            self.model.zero_grad()
            score_final = logits[0, final_grade]
            score_final.backward()
            cam_heatmap = self.gradcam.compute_map_from_hooks()
            
        # Map 512x512 heatmap back to uncropped original dimensions
        h_crop, w_crop = prep_img.cropped_bgr.shape[:2]
        hm_resized = cv2.resize(cam_heatmap, (w_crop, h_crop), interpolation=cv2.INTER_LINEAR)
        full_heatmap = np.zeros((h_orig, w_orig), dtype=np.float32)
        y1, x1 = prep_img.y_offset, prep_img.x_offset
        full_heatmap[y1:y1+h_crop, x1:x1+w_crop] = hm_resized

        overlay_bgr = visualize_gradcam(img_bgr, full_heatmap, alpha=0.45)

        return None, {
            "final_grade": final_grade,
            "raw_pred": raw_pred,
            "conf_score": conf_score,
            "p_ref": p_ref,
            "calibrated_referable": calibrated_referable,
            "probs": probs,
            "q_counts": q_counts,
            "detected_lesions": detected_lesions,
            "rescue_note": rescue_note,
            "quality_eval": quality_eval,
            "prep_img": prep_img,
            "overlay_bgr": overlay_bgr,
            "h_orig": h_orig,
            "w_orig": w_orig,
            "img_bgr": img_bgr
        }
