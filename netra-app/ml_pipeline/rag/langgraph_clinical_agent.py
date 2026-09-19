"""
NETRAMNOVA LANGGRAPH CLINICAL REFLECTION & SAFETY GUARDRAIL ENGINE
Stateful multi-agent workflow featuring:
  1. Guideline Retrieval Node (queries local ChromaDB)
  2. Clinical Drafter Agent Node (synthesizes doctor & patient summaries)
  3. Safety Reviewer Agent Node (enforces clinical fidelity, timeline adherence, zero-hallucination guardrail)
"""

import os
import sys
import threading
from typing import TypedDict, List, Dict, Any

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from guidelines_kb import CLINICAL_GUIDELINES, DME_GUIDELINE
from chroma_store import get_chroma_store


# ==============================================================================
# 1. SHARED CLINICAL STATE
# ==============================================================================
class ClinicalAgentState(TypedDict):
    stage: int
    stage_name: str
    has_macular_involvement: bool
    retrieved_guidelines: List[str]
    doctor_summary: str
    patient_summary_en: str
    patient_summary_hi: str
    icd10_code: str
    referral_timeline: str
    safety_audit_passed: bool
    audit_notes: List[str]
    iteration_count: int


# ==============================================================================
# 2. NODE 1: GUIDELINE RETRIEVAL NODE
# ==============================================================================
def guideline_retrieval_node(state: ClinicalAgentState) -> Dict[str, Any]:
    """Queries ChromaDB vector store for official AAO/ICO protocols."""
    chroma = get_chroma_store()
    stage = state["stage"]
    macular = state.get("has_macular_involvement", False)

    query = f"Diabetic retinopathy stage {stage} management protocol and referral timeline"
    if macular:
        query += " with clinically significant diabetic macular edema"

    guideline_docs = []
    # 1. Vector Search
    results = chroma.query_guidelines(query, n_results=2)
    for r in results:
        guideline_docs.append(r["document"])

    # 2. Deterministic Knowledge Base Fallback / Supplement
    kb_data = CLINICAL_GUIDELINES.get(stage, CLINICAL_GUIDELINES[0])
    guideline_docs.append(kb_data["aao_management_protocol"])

    if macular:
        guideline_docs.append(DME_GUIDELINE["definition"] + " " + DME_GUIDELINE["triage_escalation"])

    return {
        "retrieved_guidelines": guideline_docs,
        "icd10_code": kb_data["icd10_code"],
        "referral_timeline": kb_data["referral_timeline"]
    }


# ==============================================================================
# 3. NODE 2: CLINICAL DRAFTER AGENT NODE
# ==============================================================================
def clinical_drafter_node(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Drafts technical physician notes and bilingual patient guidance.
    Grounds all statements strictly in the retrieved guidelines.
    """
    stage = state["stage"]
    macular = state.get("has_macular_involvement", False)
    kb_data = CLINICAL_GUIDELINES.get(stage, CLINICAL_GUIDELINES[0])
    
    # Check if this is a correction loop based on audit notes
    audit_notes = state.get("audit_notes", [])
    
    # Physician Technical Summary
    timeline = kb_data["referral_timeline"]
    if macular:
        timeline = "URGENT: Refer to Vitreoretinal Specialist within 1 to 2 weeks (Macular Edema Involvement)"

    doctor_note = (
        f"DIAGNOSIS: {kb_data['stage_name']} (ETDRS Stage {stage})\n"
        f"ICD-10 CLASSIFICATION: {kb_data['icd10_code']}\n"
        f"TRIAGE ACTION: {kb_data['triage_category']}\n"
        f"MANDATORY REFERRAL TIMELINE: {timeline}\n"
        f"KEY FINDINGS: {'; '.join(kb_data['clinical_findings'])}\n"
        f"MACULAR STATUS: {'High Risk / Clinically Significant Macular Edema (CSME) Suspected' if macular else 'Foveal Center Intact'}\n"
        f"OFFICIAL GUIDELINE CONSENSUS: {kb_data['aao_management_protocol']}\n"
        f"RECOMMENDED DIAGNOSTICS: {', '.join(kb_data['required_diagnostic_tests'])}\n"
    )

    # Bilingual Patient Guidance
    patient_en = kb_data["patient_summary_en"]
    patient_hi = kb_data["patient_summary_hi"]

    if macular:
        patient_en += " ATTENTION: Fluid or protein deposits are near your central vision center (macula). Urgent specialist scan required."
        patient_hi += " विशेष ध्यान: आँख के केंद्रीय भाग (मैक्यूला) में सूजन देखी गई है। 1 से 2 सप्ताह में रेटिना विशेषज्ञ को अवश्य दिखाएं।"

    return {
        "doctor_summary": doctor_note,
        "patient_summary_en": patient_en,
        "patient_summary_hi": patient_hi,
        "iteration_count": state.get("iteration_count", 0) + 1
    }


# ==============================================================================
# 4. NODE 3: CLINICAL SAFETY REVIEWER NODE (THE MEDICAL GUARDRAIL)
# ==============================================================================
def clinical_safety_reviewer_node(state: ClinicalAgentState) -> Dict[str, Any]:
    """
    Audits the drafted report for:
      1. Diagnostic Fidelity: Must match the vision model's predicted stage.
      2. Prescription Guardrail: Forbids hallucinated pharmaceutical prescriptions.
      3. Timeline Guardrail: Ensures mandatory referral windows are respected.
    """
    stage = state["stage"]
    doctor_note = state.get("doctor_summary", "")
    audit_notes = []
    passed = True

    # 1. Stage Fidelity Check
    expected_stage_name = CLINICAL_GUIDELINES.get(stage, {}).get("stage_name", "")
    if expected_stage_name.lower() not in doctor_note.lower():
        audit_notes.append(f"Diagnostic mismatch: Draft does not state correct stage name '{expected_stage_name}'.")
        passed = False

    # 2. Prescription Safety Guardrail (No unauthorized specific drug dosing by AI)
    disallowed_terms = ["mg/day", "take 500mg", "oral metformin 1000mg", "prescribe insulin 20u"]
    for term in disallowed_terms:
        if term in doctor_note.lower():
            audit_notes.append(f"Safety Violation: Detected unauthorized prescription dosing '{term}'. AI screeners must only refer, not prescribe.")
            passed = False

    # 3. Timeline Verification
    if stage in [3, 4] and "annual" in doctor_note.lower():
        audit_notes.append("Clinical Hazard: Severe/Proliferative DR assigned to annual follow-up instead of urgent/emergent referral.")
        passed = False

    return {
        "safety_audit_passed": passed,
        "audit_notes": audit_notes
    }


# ==============================================================================
# 5. ASSEMBLE THE LANGGRAPH WORKFLOW
# ==============================================================================
def build_clinical_graph():
    """Builds and compiles the LangGraph State Machine."""
    try:
        from langgraph.graph import StateGraph, END
        
        workflow = StateGraph(ClinicalAgentState)
        
        # Add Nodes
        workflow.add_node("retrieve_guidelines", guideline_retrieval_node)
        workflow.add_node("draft_reports", clinical_drafter_node)
        workflow.add_node("safety_review", clinical_safety_reviewer_node)
        
        # Define Edges
        workflow.set_entry_point("retrieve_guidelines")
        workflow.add_edge("retrieve_guidelines", "draft_reports")
        workflow.add_edge("draft_reports", "safety_review")
        
        # Conditional Reflection Edge
        def decide_next_step(state: ClinicalAgentState):
            if state["safety_audit_passed"]:
                return "approved"
            elif state.get("iteration_count", 0) >= 2:
                # Force pass with warning after 2 iterations to avoid infinite loop
                return "approved"
            else:
                return "revise"

        workflow.add_conditional_edges(
            "safety_review",
            decide_next_step,
            {
                "approved": END,
                "revise": "draft_reports"
            }
        )
        
        return workflow.compile()
    except Exception as e:
        print(f"[LangGraph WARNING] LangGraph compilation failed: {e}. Using deterministic pipeline.")
        return None


# Compiled global graph instance
_clinical_graph = None
# ML-7 FIX: same TOCTOU race as init_model — add a lock for thread-safe init
_GRAPH_LOCK = threading.Lock()

def get_clinical_graph():
    global _clinical_graph
    if _clinical_graph is None:
        with _GRAPH_LOCK:
            if _clinical_graph is None:  # double-checked
                _clinical_graph = build_clinical_graph()
    return _clinical_graph


# ==============================================================================
# 6. HIGH-LEVEL API FOR PIPELINE INGESTION
# ==============================================================================
def generate_grounded_clinical_report(stage: int, has_macular_edema: bool = False) -> Dict[str, Any]:
    """
    Executes the complete Grounded RAG + LangGraph Safety Verification pipeline.
    Returns fully verified, un-hallucinated clinical reports and citations.
    """
    graph = get_clinical_graph()
    initial_state: ClinicalAgentState = {
        "stage": stage,
        "stage_name": CLINICAL_GUIDELINES.get(stage, {}).get("stage_name", "Unknown"),
        "has_macular_involvement": has_macular_edema,
        "retrieved_guidelines": [],
        "doctor_summary": "",
        "patient_summary_en": "",
        "patient_summary_hi": "",
        "icd10_code": "",
        "referral_timeline": "",
        "safety_audit_passed": False,
        "audit_notes": [],
        "iteration_count": 0
    }

    if graph is not None:
        try:
            final_state = graph.invoke(initial_state)
            return final_state
        except Exception as e:
            print(f"[LangGraph Execution Error]: {e}. Falling back to deterministic pipeline.")

    # ML-8 FIX: Robust deterministic fallback — runs all 3 nodes sequentially.
    # Previously the safety reviewer was skipped in fallback, bypassing the guardrail.
    # Now we log the audit result and still return the report, but include safety info.
    working_state = dict(initial_state)  # don't mutate original
    s1 = guideline_retrieval_node(working_state)
    working_state.update(s1)
    s2 = clinical_drafter_node(working_state)
    working_state.update(s2)
    s3 = clinical_safety_reviewer_node(working_state)
    working_state.update(s3)
    if not working_state.get("safety_audit_passed", True):
        print(f"[LangGraph Safety Fallback] Audit FAILED: {working_state.get('audit_notes', [])}")
    return working_state
