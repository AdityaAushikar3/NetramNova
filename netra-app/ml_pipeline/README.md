# NetramNova ML Pipeline

Complete Python training pipeline for the NetramNova Diabetic Retinopathy screening system.  
Trains on **APTOS 2019**, **IDRiD**, and **EyePACS** — the three major public DR datasets.

---

## Directory Structure

```
ml_pipeline/
├── config.yaml                          ← Central config (edit dataset paths here)
├── requirements.txt                     ← Python dependencies
│
├── datasets/
│   ├── aptos_dataset.py                 ← APTOS 2019 loader + stratified K-fold
│   ├── idrid_dataset.py                 ← IDRiD grading + segmentation + localization
│   ├── eyepacs_dataset.py              ← EyePACS loader (Grade-0 balancing)
│   └── combined_dataset.py             ← Unified APTOS + EyePACS + IDRiD loader
│
├── preprocessing/
│   ├── quality_gate.py                  ← OpenCV quality check (focus, glare, FOV)
│   ├── foracchia_normalization.py       ← Illumination normalization + mild CLAHE
│   ├── augmentation.py                 ← Albumentations train/val transforms
│   └── convert_idrid_to_yolo.py        ← IDRiD masks → YOLOv8 polygon format
│
├── models/
│   ├── efficientnet_classifier.py       ← EfficientNet-B2 ICDR Grade 0-4 classifier
│   ├── segmentation_model.py           ← Dual-backend: YOLOv8-Seg OR U-Net
│   └── localization_model.py           ← OD/Fovea coordinate regression (EfficientNet-B0)
│
├── training/
│   ├── train_classifier.py              ← EfficientNet-B2 training loop
│   ├── train_segmenter.py              ← U-Net or YOLOv8-Seg training
│   └── train_localization.py           ← OD/Fovea localization training
│
├── evaluation/
│   ├── metrics.py                       ← Sensitivity, Specificity, AUC, Kappa, Dice
│   ├── gradcam.py                      ← Grad-CAM explainability heatmaps
│   └── benchmark.py                    ← Cross-dataset benchmark + ROC plots
│
└── export/
    └── export_onnx.py                  ← PyTorch → ONNX for edge CPU deployment
```

---

## Setup

### 1. Install dependencies

```bash
cd ml_pipeline
pip install -r requirements.txt
```

### 2. Download datasets

| Dataset | Source | Size | DR Labels |
|---------|--------|------|-----------|
| **APTOS 2019** | [Kaggle](https://www.kaggle.com/c/aptos2019-blindness-detection) | 3,662 imgs | Grade 0-4 |
| **IDRiD** | [IEEE DataPort](https://ieee-dataport.org/open-access/indian-diabetic-retinopathy-image-dataset-idrid) | 516 imgs | Grade 0-4 + pixel masks |
| **EyePACS** | [Kaggle](https://www.kaggle.com/c/diabetic-retinopathy-detection) | ~88k imgs | Grade 0-4 |

### 3. Organize data

Place datasets as described in `config.yaml`:

```
data/
├── aptos2019/
│   ├── train.csv
│   └── train_images/        (PNG files)
├── IDRiD/
│   ├── A. Segmentation/
│   ├── B. Disease Grading/
│   └── C. Optic Disc Center Location/
└── eyepacs/
    ├── trainLabels.csv
    └── train/               (JPEG files)
```

### 4. Edit config paths

Open `config.yaml` and set the correct paths for your system.

---

## Training

### Step 1: Train the DR Classifier (EfficientNet-B2)

```bash
cd ml_pipeline
python training/train_classifier.py --config config.yaml
```

- Trains on combined APTOS 2019 + EyePACS + IDRiD
- Saves best checkpoint to `outputs/checkpoints/best_classifier.pt`
- TensorBoard logs in `outputs/logs/classifier/`
- View logs: `tensorboard --logdir outputs/logs`

### Step 2a: Train Lesion Segmentation — U-Net (recommended for MAs)

```bash
python training/train_segmenter.py --backend unet --config config.yaml
```

### Step 2b: Train Lesion Segmentation — YOLOv8-Seg (for HE, EX, SE, OD)

First convert IDRiD masks to YOLO format:
```bash
python preprocessing/convert_idrid_to_yolo.py --config config.yaml
```
Then train:
```bash
python training/train_segmenter.py --backend yolo --config config.yaml
```

> **Note on Microaneurysms (MA):**  
> MAs are sub-pixel at 512×512 resolution. YOLOv8-Seg may miss them.  
> Use U-Net with sliding window inference (`segmentation_model.sliding_window_inference`)  
> for best MA detection performance.

### Step 3: Train OD/Fovea Localizer

```bash
python training/train_localization.py --config config.yaml
```

---

## Evaluation

### Benchmark on test set

```bash
# APTOS 2019 test set
python evaluation/benchmark.py \
    --checkpoint outputs/checkpoints/best_classifier.pt \
    --dataset aptos --config config.yaml

# All datasets
python evaluation/benchmark.py \
    --checkpoint outputs/checkpoints/best_classifier.pt \
    --dataset all --config config.yaml
```

Outputs:
- `outputs/eval/*/roc_curves.png` — ROC curve per ICDR grade
- `outputs/eval/*/confusion_matrix.png` — 5×5 confusion matrix heatmap
- `outputs/eval/*/aptos_report.json` — Full metrics JSON

### Generate Grad-CAM saliency maps

```python
from models.efficientnet_classifier import EfficientNetDRClassifier, load_checkpoint
from evaluation.gradcam import GradCAM, batch_gradcam
from preprocessing.augmentation import get_val_transforms

model = EfficientNetDRClassifier()
load_checkpoint(model, "outputs/checkpoints/best_classifier.pt", "cpu")

batch_gradcam(model,
              image_dir="data/aptos2019/train_images",
              output_dir="outputs/gradcam",
              transform=get_val_transforms(512),
              max_images=50)
```

---

## Export to ONNX (Edge Deployment)

```bash
# Export all models to ONNX
python export/export_onnx.py --config config.yaml --model all

# With INT8 quantization (2-4x speedup on CPU)
python export/export_onnx.py --config config.yaml --model all --quantize
```

Output files:
- `outputs/onnx/classifier.onnx` — DR grader (Grade 0-4)
- `outputs/onnx/unet_segmenter.onnx` — Lesion segmentation
- `outputs/onnx/od_localizer.onnx` — OD/Fovea coordinates

### ONNX Runtime Inference (for Next.js backend)

```python
import onnxruntime as ort
import numpy as np

sess = ort.InferenceSession("outputs/onnx/classifier.onnx",
                             providers=["CPUExecutionProvider"])
input_name = sess.get_inputs()[0].name
logits = sess.run(None, {input_name: image_array})[0]
grade  = np.argmax(logits, axis=1)[0]
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| EfficientNet-B2 for classification | Best accuracy/efficiency tradeoff; SOTA on APTOS |
| Dual backend (YOLOv8 + U-Net) | YOLOv8 good for large lesions; U-Net better for MAs |
| Sliding window for MA | MAs are ~10-100μm; downsampling loses them at 512×512 |
| Grade 0 EyePACS capped at 15k | 73% Grade-0 imbalance would overwhelm minority classes |
| Foracchia + CLAHE preprocessing | Compensates for portable camera illumination variability |
| ONNX Runtime for deployment | Cross-platform CPU inference; no NVIDIA GPU required |
| IDRiD for fine-tuning | Indian patient demographics match target PHC deployment |

---

## Target Performance Benchmarks

| Metric | Target | Clinical Significance |
|--------|--------|-----------------------|
| Sensitivity (Grade 2+) | > 95% | Minimize missed referable DR |
| Specificity (Grade 0-1) | > 90% | Minimize unnecessary referrals |
| AUC Macro | > 0.93 | Overall discrimination |
| Quadratic Kappa | > 0.85 | Agreement with ophthalmologist grading |
| U-Net Dice (HE, EX) | > 0.70 | Hard/soft exudate detection |
| Pixel Error (OD center) | < 30px | Acceptable localization for ETDRS grid |

> These are target benchmarks. Actual results depend on dataset quality, GPU availability, and training duration.
