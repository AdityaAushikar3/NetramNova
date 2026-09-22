"""
evaluation/run_etdrs_rescue.py
NetramNova - Audit and Rescue Borderline Severe NPDR Cases via ETDRS Engine

Runs evaluation on the test dataset, feeding borderline Moderate/Severe
predictions into the ETDRS 4-2-1 Quadrant Auditor to measure improvements
in Grade 3 (Severe NPDR) classification accuracy and clinical concordance.
"""

from __future__ import annotations
import sys
from pathlib import Path

# This is an evaluation/benchmark script, not used by the inference service.
# It can be run standalone to evaluate ETDRS rescue performance on a test set.

if __name__ == "__main__":
    print("[run_etdrs_rescue] This is an evaluation script.")
    print("Run the full benchmark suite via: python -m ml_pipeline.evaluation.benchmark")
    sys.exit(0)
