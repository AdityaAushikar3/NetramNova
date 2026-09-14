"""
preprocessing/convert_idrid_to_yolo.py
NetramNova — Convert IDRiD Segmentation Masks to YOLOv8 Format

YOLOv8-Seg requires annotations in YOLO instance segmentation format:
  class_id x1 y1 x2 y2 ... xn yn (polygon, normalized to [0,1])

This script converts IDRiD binary TIF masks → YOLO polygon annotations.

For microaneurysms (MA class 0):
  MAs are very small (< 10px at 512×512). YOLOv8 may miss them.
  This script still exports MA annotations but logs a warning.
  Consider using U-Net patch-based inference for MA class instead.

Output structure:
  datasets/idrid_yolo/
    images/train/   ← symlinks or copies of IDRiD training images
    images/val/     ← last 10 images
    labels/train/   ← .txt files (YOLO format)
    labels/val/     ← .txt files
    idrid_seg.yaml  ← YOLOv8 data config

Usage:
    cd ml_pipeline
    python preprocessing/convert_idrid_to_yolo.py --config config.yaml
"""

from __future__ import annotations
import os
import sys
import yaml
import shutil
import argparse
import cv2
import numpy as np
from pathlib import Path


LESION_DIRS = {
    0: "1. Microaneurysms",
    1: "2. Haemorrhages",
    2: "3. Hard Exudates",
    3: "4. Soft Exudates",
    4: "5. Optic Disc",
}
LESION_SUFFIX = {
    0: "MA",
    1: "HE",
    2: "EX",
    3: "SE",
    4: "OD",
}
CLASS_NAMES = ["Microaneurysm", "Haemorrhage",
               "Hard Exudate", "Soft Exudate", "Optic Disc"]


def mask_to_polygons(mask_gray: np.ndarray,
                     img_w: int,
                     img_h: int,
                     min_area: float = 5.0) -> list[list[float]]:
    """
    Convert binary mask to normalized YOLO polygon coordinates.

    Parameters
    ----------
    mask_gray : (H, W) uint8 binary mask (255 = lesion)
    img_w, img_h : original image dimensions for normalization
    min_area : minimum contour area in pixels (filter noise)

    Returns
    -------
    List of polygon annotations:
      Each entry is a flat list [x1, y1, x2, y2, ..., xn, yn] normalized to [0,1]
    """
    contours, _ = cv2.findContours(mask_gray,
                                   cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_SIMPLE)
    polygons = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        # Simplify contour slightly
        epsilon = 0.005 * cv2.arcLength(cnt, True)
        approx  = cv2.approxPolyDP(cnt, epsilon, True)
        points  = approx.reshape(-1, 2)
        if len(points) < 3:
            continue
        # Normalize
        norm_pts = []
        for x, y in points:
            norm_pts.extend([x / img_w, y / img_h])
        polygons.append(norm_pts)
    return polygons


def convert_image(stem: str,
                  image_path: str,
                  mask_root: str,
                  label_dir: str,
                  img_dir_out: str,
                  warn_ma: list) -> bool:
    """
    Convert one IDRiD image + its masks to YOLO format.
    Returns True if at least one annotation was written.
    """
    img = cv2.imread(image_path)
    if img is None:
        return False
    img_h, img_w = img.shape[:2]

    annotations = []

    for cls_id, subdir in LESION_DIRS.items():
        suffix  = LESION_SUFFIX[cls_id]
        mask_fn = f"{stem}_{suffix}.tif"
        mask_path = os.path.join(mask_root, subdir, mask_fn)

        if not os.path.exists(mask_path):
            continue

        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if mask is None:
            continue

        # Resize mask to match image
        mask = cv2.resize(mask, (img_w, img_h), interpolation=cv2.INTER_NEAREST)
        mask_bin = (mask > 127).astype(np.uint8) * 255

        polys = mask_to_polygons(mask_bin, img_w, img_h)

        if cls_id == 0 and polys:
            warn_ma.append(stem)

        for poly in polys:
            line = f"{cls_id} " + " ".join(f"{v:.6f}" for v in poly)
            annotations.append(line)

    if not annotations:
        return False

    # Write label file
    label_path = os.path.join(label_dir, stem + ".txt")
    with open(label_path, "w") as f:
        f.write("\n".join(annotations))

    # Copy image to YOLO images dir
    dst = os.path.join(img_dir_out, stem + ".jpg")
    if not os.path.exists(dst):
        shutil.copy2(image_path, dst)

    return True


def write_data_yaml(out_root: str, n_val: int = 10) -> None:
    """Write the YOLOv8 data config YAML."""
    data = {
        "path":  os.path.abspath(out_root),
        "train": "images/train",
        "val":   "images/val",
        "nc":    len(CLASS_NAMES),
        "names": CLASS_NAMES,
    }
    yaml_path = os.path.join(out_root, "idrid_seg.yaml")
    with open(yaml_path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)
    print(f"[Config] YOLO data YAML → {yaml_path}")


def main():
    p = argparse.ArgumentParser(description="Convert IDRiD masks to YOLO format")
    p.add_argument("--config", default="config.yaml")
    p.add_argument("--output", default="datasets/idrid_yolo")
    p.add_argument("--val-count", type=int, default=10,
                   help="Number of images to hold out for validation")
    args = p.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    idrid = cfg["datasets"]["idrid"]
    image_dir = idrid["seg_train_dir"]
    mask_root  = idrid["seg_mask_dir"]
    out_root   = args.output

    # Create output directory structure
    for split in ["train", "val"]:
        Path(out_root, "images", split).mkdir(parents=True, exist_ok=True)
        Path(out_root, "labels", split).mkdir(parents=True, exist_ok=True)

    # Find all training images
    img_files = sorted([
        f for f in os.listdir(image_dir)
        if f.lower().endswith((".jpg", ".png", ".tif"))
    ])

    if not img_files:
        print(f"[Error] No images found in: {image_dir}")
        return

    val_files   = img_files[-args.val_count:]
    train_files = img_files[:-args.val_count]

    print(f"[IDRiD→YOLO] Total images: {len(img_files)} | "
          f"Train: {len(train_files)} | Val: {len(val_files)}")

    warn_ma = []
    converted = 0

    for split, files in [("train", train_files), ("val", val_files)]:
        for fname in files:
            stem = os.path.splitext(fname)[0]
            img_path = os.path.join(image_dir, fname)
            label_dir = os.path.join(out_root, "labels",  split)
            img_dir   = os.path.join(out_root, "images",  split)
            ok = convert_image(stem, img_path, mask_root,
                               label_dir, img_dir, warn_ma)
            if ok:
                converted += 1

    print(f"[IDRiD→YOLO] Converted: {converted}/{len(img_files)} images")

    if warn_ma:
        print(f"\n[WARNING] {len(warn_ma)} images contain Microaneurysm (MA) annotations.")
        print("  MAs are very small lesions. YOLOv8-Seg may struggle to detect them.")
        print("  Recommendation: use U-Net with sliding window (train_segmenter.py --backend unet)")
        print(f"  Affected images: {warn_ma[:5]}{'...' if len(warn_ma) > 5 else ''}")

    write_data_yaml(out_root, args.val_count)
    print(f"\n[Done] YOLO dataset ready: {out_root}")
    print(f"       Run: python training/train_segmenter.py --backend yolo")


if __name__ == "__main__":
    main()
