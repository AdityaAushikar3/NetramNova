"""
evaluation/findings.py
NetramNova - Clinical Findings Generator and Triage Engine

Generates structured retinal findings from ACTUAL model/CV detections
and determines triage tier, recall advice, and progression risk.

IMPORTANT: This module only reports findings that are supported by
real detector outputs (lesion coordinates, quadrant counts). It does
NOT fabricate finding counts based solely on the predicted DR grade.

Findings are sourced from:
  - Detected lesion coordinates (from pipeline lesion extraction)
  - ETDRS quadrant counts (from the quadrant engine)
  - The lesion count is the ACTUAL number of detected lesions

If a specific finding type (e.g., Hard Exudates) has no dedicated
detector, it is either omitted or marked with source='rule_derived'.
"""

from typing import List, Tuple
from ml_pipeline.models.dto import FindingDetail
from ml_pipeline.evaluation.etdrs_quadrant_engine import QuadrantCounts


def generate_findings_and_triage(
    final_grade: int,
    q_counts: QuadrantCounts | None,
    lesions_count: int,
    scaled_coords: List[dict],
) -> tuple[str, str, int, List[FindingDetail]]:
    """
    Generate clinical findings, triage tier, recall advice, and progression risk
    based on the classifier grade and ACTUAL detected lesions.

    Returns:
        (triage_tier, recall_advice, progression_risk, findings)

    Triage Tiers:
        Tier 1 (Auto-Cleared)        - Grade 0-1, low risk
        Tier 2 (Priority Review)     - Grade 2, moderate risk
        Tier 3 (Specialist Escalation) - Grade 3-4, high/urgent risk
    """

    def get_location_description(prefix: str) -> str:
        if q_counts is None:
            return prefix
        return f"{prefix}: Sup={q_counts.superior}, Inf={q_counts.inferior}, Nas={q_counts.nasal}, Temp={q_counts.temporal}"

    def create_generic_lesion_finding(coords: List[dict], severity: str, prefix_desc: str) -> FindingDetail | None:
        if not coords:
            return None
        return FindingDetail(
            id=f"f-dark-blob-{severity}",
            name="Dark Lesion Candidate (unclassified)",
            count=len(coords),
            severity=severity,
            category="structural",
            locationDescription=get_location_description(prefix_desc),
            coords=coords,
        )

    # ── Grade 0: No Apparent DR ──────────────────────────────────────────
    if final_grade == 0:
        return ("Tier 1 (Auto-Cleared)", "12 Months", 5, [])

    findings = []
    
    # Group lesions by their specific name (Microaneurysms, Hemorrhages, etc.)
    from collections import defaultdict
    grouped = defaultdict(list)
    for c in scaled_coords:
        name = c.get("name", "Lesion")
        grouped[name].append(c)
        
    severity = "mild"
    if final_grade == 2: severity = "moderate"
    elif final_grade >= 3: severity = "severe"

    for name, coords in grouped.items():
        if coords:
            findings.append(FindingDetail(
                id=f"f-{name.lower().replace(' ', '-')}-{severity}",
                name=name,
                count=len(coords),
                severity=severity,
                category="structural",
                locationDescription=f"Detected {len(coords)} {name}",
                coords=coords
            ))

    # ── Grade 1: Mild NPDR ───────────────────────────────────────────────
    if final_grade == 1:
        return ("Tier 1 (Auto-Cleared)", "12 Months", 22, findings)

    # ── Grade 2: Moderate NPDR ───────────────────────────────────────────
    if final_grade == 2:
        return ("Tier 2 (Priority Review)", "6 Months", 54, findings)

    # ── Grade 3: Severe NPDR ─────────────────────────────────────────────
    if final_grade == 3:
        return ("Tier 3 (Specialist Escalation)", "3 Months (Urgent)", 82, findings)

    # ── Grade 4: Proliferative DR ────────────────────────────────────────
    return ("Tier 3 (Specialist Escalation)", "3 Months (Urgent)", 96, findings)

    return (triage_tier, recall_advice, progression_risk, findings)
