from dataclasses import dataclass, field
from typing import Literal, List, Dict, Any, Optional

@dataclass
class FindingDetail:
    id: str
    name: str
    count: int
    severity: Literal["mild", "moderate", "severe"]
    category: Literal["structural", "colour"]
    locationDescription: str
    coords: List[Dict[str, float]]

@dataclass
class ClinicalGuidanceDTO:
    icd10Code: str
    referralTimeline: str
    guidelineSource: str
    doctorTechnicalNote: str
    patientSummaryEn: str
    patientSummaryHi: str
    safetyAuditPassed: bool

@dataclass
class QualityMetricsDTO:
    fovDetected: bool
    focusAcceptable: bool
    exposureAcceptable: bool
    retinaVisible: bool
    blurScore: float
    illuminationUniformity: float
    qualityTier: str
    route: str
    technicianFeedback: str

@dataclass
class ScreeningResult:
    diagnosis: str
    icdrLevel: int
    severity: Literal["normal", "mild", "moderate", "severe", "proliferative"]
    confidence: Literal["High", "Medium", "Low"]
    confidenceScore: float
    
    triageTier: Literal["Tier 1 (Auto-Cleared)", "Tier 2 (Priority Review)", "Tier 3 (Specialist Escalation)"]
    recallAdvice: str
    progressionRisk: int
    csmeThreatDetected: bool
    csmeFoveaDistanceDiscDiameters: float
    
    findings: List[FindingDetail]
    clinicalGuidance: ClinicalGuidanceDTO
    
    qualityStatus: Literal["passed", "warning", "failed"]
    qualityTier: str
    quality: QualityMetricsDTO
    
    # Internal fields not formally in types.ts but useful/historically present
    rawModelPrediction: int
    calibratedReferable: bool
    referableProbability: float
    probabilities: Dict[str, float]
    rescuedBy: Optional[str]
    
    # Base64 strings (populated by the adapter layer)
    preprocessedImage: str = ""
    gradcamOverlay: str = ""
