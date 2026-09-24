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

    # ── Grade 1: Mild NPDR ───────────────────────────────────────────────
    if final_grade == 1:
        triage_tier = "Tier 1 (Auto-Cleared)"
        recall_advice = "12 Months"
        progression_risk = 22

        f = create_generic_lesion_finding(scaled_coords, "mild", f"Detected {len(scaled_coords)} low-confidence unclassified lesions")
        if f: findings.append(f)

        return (triage_tier, recall_advice, progression_risk, findings)

    # ── Grade 2: Moderate NPDR ───────────────────────────────────────────
    if final_grade == 2:
        triage_tier = "Tier 2 (Priority Review)"
        recall_advice = "6 Months"
        progression_risk = 54

        f = create_generic_lesion_finding(scaled_coords, "moderate", f"Moderate multi-quadrant unclassified lesions ({len(scaled_coords)} detected)")
        if f: findings.append(f)

        return (triage_tier, recall_advice, progression_risk, findings)

    # ── Grade 3: Severe NPDR ─────────────────────────────────────────────
    if final_grade == 3:
        triage_tier = "Tier 3 (Specialist Escalation)"
        recall_advice = "3 Months (Urgent)"
        progression_risk = 82

        rule_note = "High-density multi-quadrant unclassified lesions"
        if q_counts is not None and q_counts.meets_rule_4():
            rule_note = "ETDRS Rule 4 Verified (>=20 in all quadrants) for unclassified dark lesions"
            
        f = create_generic_lesion_finding(scaled_coords, "severe", rule_note)
        if f: findings.append(f)

        return (triage_tier, recall_advice, progression_risk, findings)

    # ── Grade 4: Proliferative DR ────────────────────────────────────────
    # (final_grade >= 4)
    triage_tier = "Tier 3 (Specialist Escalation)"
    recall_advice = "3 Months (Urgent)"
    progression_risk = 96

    f = create_generic_lesion_finding(
        scaled_coords, 
        "severe", 
        f"Severe unclassified lesions ({len(scaled_coords)} detected) with high risk of neovascularization"
    )
    if f: findings.append(f)

    return (triage_tier, recall_advice, progression_risk, findings)
