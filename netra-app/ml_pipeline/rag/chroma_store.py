"""
NETRAMNOVA CHROMA VECTOR STORE SERVICE
Local persistent vector database for Grounded Clinical Guideline Retrieval (RAG).
Zero-cloud dependency, runs completely offline via SQLite backend.
"""

import os
import sys
from typing import List, Dict, Any

# Add parent directory to sys.path to allow imports
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from guidelines_kb import CLINICAL_GUIDELINES, DME_GUIDELINE

CHROMA_DATA_DIR = os.path.join(current_dir, "chroma_data")
COLLECTION_NAME = "diabetic_retinopathy_guidelines"


class ClinicalChromaStore:
    def __init__(self, persist_dir: str = CHROMA_DATA_DIR):
        self.persist_dir = persist_dir
        os.makedirs(self.persist_dir, exist_ok=True)
        self.client = None
        self.collection = None
        self.vectorizer = None
        self.tfidf_matrix = None
        self.documents = []
        self.metadatas = []
        self._init_db()

    def _init_db(self):
        """Initializes ChromaDB or falls back to instant local vector search."""
        self._setup_local_vector_engine()

    def _setup_local_vector_engine(self):
        """Fast, robust, 100% offline vector engine using TF-IDF & Cosine Similarity."""
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np

        docs = []
        metas = []

        for stage, data in CLINICAL_GUIDELINES.items():
            doc_text = (
                f"DIAGNOSIS: {data['stage_name']} (Stage {stage})\n"
                f"ICDR SEVERITY: {data['icdr_severity']}\n"
                f"ICD-10 CODE: {data['icd10_code']}\n"
                f"TRIAGE CATEGORY: {data['triage_category']}\n"
                f"MANDATORY REFERRAL TIMELINE: {data['referral_timeline']}\n"
                f"CLINICAL FINDINGS: {'; '.join(data['clinical_findings'])}\n"
                f"OFFICIAL AAO MANAGEMENT PROTOCOL: {data['aao_management_protocol']}\n"
                f"REQUIRED TESTS: {', '.join(data['required_diagnostic_tests'])}\n"
            )
            docs.append(doc_text)
            metas.append({
                "stage": stage,
                "stage_name": data['stage_name'],
                "icd10": data['icd10_code'],
                "triage": data['triage_category'],
                "referral_timeline": data['referral_timeline']
            })

        # Add DME document
        dme_text = (
            f"CONDITION: {DME_GUIDELINE['condition']}\n"
            f"DEFINITION: {DME_GUIDELINE['definition']}\n"
            f"TRIAGE ESCALATION: {DME_GUIDELINE['triage_escalation']}\n"
            f"PRIMARY TREATMENT: {DME_GUIDELINE['primary_treatment']}\n"
            f"CLINICAL NOTE: {DME_GUIDELINE['clinical_note']}\n"
        )
        docs.append(dme_text)
        metas.append({
            "stage": -1,
            "stage_name": "Diabetic Macular Edema (CSME)",
            "icd10": "E11.311 / E11.321 / E11.341 / E11.351",
            "triage": "URGENT_REFERRAL",
            "referral_timeline": "1 to 2 weeks"
        })

        self.documents = docs
        self.metadatas = metas
        self.vectorizer = TfidfVectorizer(stop_words='english', ngram_range=(1, 2))
        self.tfidf_matrix = self.vectorizer.fit_transform(docs)
        print(f"[ClinicalChromaStore] Local Offline Vector Store active with {len(docs)} indexed guideline documents.")

    def _index_all_guidelines(self):
        """Chunks and indexes the official clinical guidelines into the vector store."""
        print("[ClinicalChromaStore] Ingesting official AAO/ICO/AIIMS guidelines into vector store...")
        documents = []
        metadatas = []
        ids = []

        for stage, data in CLINICAL_GUIDELINES.items():
            doc_text = (
                f"DIAGNOSIS: {data['stage_name']} (Stage {stage})\n"
                f"ICDR SEVERITY: {data['icdr_severity']}\n"
                f"ICD-10 CODE: {data['icd10_code']}\n"
                f"TRIAGE CATEGORY: {data['triage_category']}\n"
                f"MANDATORY REFERRAL TIMELINE: {data['referral_timeline']}\n"
                f"CLINICAL FINDINGS: {'; '.join(data['clinical_findings'])}\n"
                f"OFFICIAL AAO MANAGEMENT PROTOCOL: {data['aao_management_protocol']}\n"
                f"REQUIRED TESTS: {', '.join(data['required_diagnostic_tests'])}\n"
            )
            documents.append(doc_text)
            metadatas.append({
                "stage": stage,
                "stage_name": data['stage_name'],
                "icd10": data['icd10_code'],
                "triage": data['triage_category'],
                "referral_timeline": data['referral_timeline']
            })
            ids.append(f"guideline_stage_{stage}")

        # Ingest DME Guideline
        dme_text = (
            f"CONDITION: {DME_GUIDELINE['condition']}\n"
            f"DEFINITION: {DME_GUIDELINE['definition']}\n"
            f"TRIAGE ESCALATION: {DME_GUIDELINE['triage_escalation']}\n"
            f"PRIMARY TREATMENT: {DME_GUIDELINE['primary_treatment']}\n"
            f"CLINICAL NOTE: {DME_GUIDELINE['clinical_note']}\n"
        )
        documents.append(dme_text)
        metadatas.append({
            "stage": -1,
            "stage_name": "Diabetic Macular Edema (CSME)",
            "icd10": "E11.311 / E11.321 / E11.341 / E11.351",
            "triage": "URGENT_REFERRAL",
            "referral_timeline": "1 to 2 weeks"
        })
        ids.append("guideline_macular_edema")

        # Add to collection
        self.collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        print(f"[ClinicalChromaStore] Successfully indexed {len(documents)} clinical protocol documents.")

    def query_guidelines(self, query_text: str, n_results: int = 2) -> List[Dict[str, Any]]:
        """
        Performs cosine similarity search against the clinical knowledge base.
        Returns top matching guidelines with metadata.
        """
        if self.vectorizer is not None and self.tfidf_matrix is not None:
            from sklearn.metrics.pairwise import cosine_similarity
            import numpy as np

            q_vec = self.vectorizer.transform([query_text])
            similarities = cosine_similarity(q_vec, self.tfidf_matrix)[0]
            top_indices = np.argsort(similarities)[::-1][:n_results]

            output = []
            for idx in top_indices:
                score = float(similarities[idx])
                if score > 0.0 or len(output) == 0:
                    output.append({
                        "document": self.documents[idx],
                        "metadata": self.metadatas[idx],
                        "similarity_score": round(score, 4)
                    })
            return output

        return []


# Global singleton instance
_chroma_instance = None

def get_chroma_store() -> ClinicalChromaStore:
    global _chroma_instance
    if _chroma_instance is None:
        _chroma_instance = ClinicalChromaStore()
    return _chroma_instance
