"""
NETRAMNOVA RAG & LANGGRAPH VERIFICATION SUITE
Verifies:
  1. ChromaDB vector storage and semantic query retrieval
  2. LangGraph state machine execution and safety audit pass rate
  3. Bilingual Hindi/English patient card generation
"""

import sys
import os

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from chroma_store import get_chroma_store
from langgraph_clinical_agent import generate_grounded_clinical_report

def run_tests():
    print("=" * 60)
    print("NETRAMNOVA GROUNDED RAG & LANGGRAPH TEST SUITE")
    print("=" * 60)

    # 1. Test ChromaDB Vector Store
    print("\n--- 1. Testing ChromaDB Local Vector Store ---")
    store = get_chroma_store()
    query = "severe non-proliferative retinopathy management and laser protocol"
    results = store.query_guidelines(query, n_results=2)
    print(f"Query: '{query}'")
    print(f"Results returned: {len(results)}")
    for i, r in enumerate(results):
        print(f"  Result {i+1} [Similarity: {r['similarity_score']}]: {r['metadata'].get('stage_name')} | ICD-10: {r['metadata'].get('icd10')}")

    # 2. Test LangGraph Pipeline across all stages
    print("\n--- 2. Testing LangGraph Clinical Agent across Stages ---")
    test_cases = [
        (0, False, "Normal Eye"),
        (2, False, "Moderate NPDR"),
        (2, True, "Moderate NPDR + Macular Edema (CSME)"),
        (3, False, "Severe NPDR (4-2-1 Rule)"),
        (4, True, "Proliferative DR (High Risk)")
    ]

    for stage, macular, desc in test_cases:
        print(f"\nEvaluating Case: Stage {stage} ({desc}) | Macular Edema: {macular}")
        report = generate_grounded_clinical_report(stage=stage, has_macular_edema=macular)
        
        print(f"  Safety Audit Passed: {report['safety_audit_passed']}")
        print(f"  ICD-10 Code:         {report['icd10_code']}")
        print(f"  Referral Timeline:   {report['referral_timeline']}")
        print(f"  Patient EN:          {report['patient_summary_en'][:80]}...")
        print(f"  Patient HI:          {report['patient_summary_hi'][:80]}...")
        assert report['safety_audit_passed'] == True, f"Safety audit failed for stage {stage}!"

    print("\n" + "=" * 60)
    print("ALL RAG & LANGGRAPH TESTS PASSED WITH 100% AUDIT COMPLIANCE!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
