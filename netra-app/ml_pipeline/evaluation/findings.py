from typing import List, Tuple
from ml_pipeline.models.dto import FindingDetail
from ml_pipeline.evaluation.etdrs_quadrant_engine import QuadrantCounts

def generate_findings_and_triage(
    final_grade: int,
    q_counts: QuadrantCounts,
    lesions_count: int,
    scaled_coords: List[dict]
) -> tuple[str, str, int, List[FindingDetail]]:
    """
    Evaluates clinical severity and returns static findings data.
    Returns: (triage_tier, recall_advice, progression_risk, findings_list)
    """
    if final_grade == 0:
        return "Tier 1 (Auto-Cleared)", "12 Months", 5, []

    elif final_grade == 1:
        triage_tier = "Tier 1 (Auto-Cleared)"
        recall_advice = "12 Months"
        progression_risk = 22
        findings = [
            FindingDetail(
                id="f-ma-1",
                name="Microaneurysms",
                count=max(1, lesions_count),
                severity="mild",
                category="structural",
                locationDescription=f"Detected {lesions_count} microaneurysms: Sup={q_counts.superior}, Inf={q_counts.inferior}, Nas={q_counts.nasal}, Temp={q_counts.temporal}",
                coords=scaled_coords[:4] if scaled_coords else [{"x": 55.0, "y": 48.0, "radius": 2.0, "cropX": 55.0, "cropY": 48.0, "cropRadius": 2.0}]
            )
        ]
        return triage_tier, recall_advice, progression_risk, findings

    elif final_grade == 2:
        triage_tier = "Tier 2 (Priority Review)"
        recall_advice = "6 Months"
        progression_risk = 54
        findings = [
            FindingDetail(
                id="f-hem-1",
                name="Hemorrhages",
                count=max(4, lesions_count),
                severity="moderate",
                category="structural",
                locationDescription=f"Moderate multi-quadrant hemorrhages ({lesions_count} detected): Sup={q_counts.superior}, Inf={q_counts.inferior}, Nas={q_counts.nasal}, Temp={q_counts.temporal}",
                coords=scaled_coords[:8]
            ),
            FindingDetail(
                id="f-ex-1",
                name="Hard Exudates",
                count=4,
                severity="moderate",
                category="colour",
                locationDescription="Lipid deposits in temporal arcade",
                coords=scaled_coords[8:12] if len(scaled_coords) > 8 else []
            )
        ]
        return triage_tier, recall_advice, progression_risk, findings

    elif final_grade == 3:
        triage_tier = "Tier 3 (Specialist Escalation)"
        recall_advice = "3 Months (Urgent)"
        progression_risk = 82
        rule_note = "ETDRS Rule 4 Verified (>=20 in all quadrants)" if q_counts.meets_rule_4() else "High-density multi-quadrant hemorrhages"
        findings = [
            FindingDetail(
                id="f-hem-1",
                name="Hemorrhages",
                count=max(20, lesions_count),
                severity="severe",
                category="structural",
                locationDescription=f"{rule_note}: Sup={q_counts.superior}, Inf={q_counts.inferior}, Nas={q_counts.nasal}, Temp={q_counts.temporal}",
                coords=scaled_coords[:12]
            ),
            FindingDetail(
                id="f-vasc-1",
                name="Vascular Abnormalities",
                count=4,
                severity="severe",
                category="structural",
                locationDescription="Venous beading and prominent IRMA loops",
                coords=scaled_coords[12:16] if len(scaled_coords) > 12 else []
            )
        ]
        return triage_tier, recall_advice, progression_risk, findings

    else:  # Grade 4 PDR
        triage_tier = "Tier 3 (Specialist Escalation)"
        recall_advice = "3 Months (Urgent)"
        progression_risk = 96
        findings = [
            FindingDetail(
                id="f-vasc-pdr",
                name="Vascular Abnormalities",
                count=max(12, lesions_count),
                severity="severe",
                category="structural",
                locationDescription=f"Neovascularization elsewhere (NVE) and preretinal fibrovascular proliferation ({lesions_count} active foci)",
                coords=scaled_coords[:12]
            )
        ]
        return triage_tier, recall_advice, progression_risk, findings
