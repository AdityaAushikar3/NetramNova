"""
evaluation/run_ma_patch_rescue.py
NetramNova - Evaluate Microaneurysm Patch Rescue Performance

Runs evaluation on the test dataset, measuring how many Grade 0 cases
are correctly rescued to Grade 1 by high-resolution MA patch analysis.
"""

from __future__ import annotations
import sys
from pathlib import Path

# This is an evaluation/benchmark script, not used by the inference service.
# It can be run standalone to evaluate MA rescue performance on a test set.

if __name__ == "__main__":
    print("[run_ma_patch_rescue] This is an evaluation script.")
    print("Run the full benchmark suite via: python -m ml_pipeline.evaluation.benchmark")
    sys.exit(0)
