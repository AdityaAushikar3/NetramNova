export type NavigationTab = 'screening' | 'patients' | 'review' | 'analytics' | 'settings';

export type ConnectivityState = 'online' | 'local' | 'syncing';

export type ImageQualityStatus = 'passed' | 'warning' | 'rejected';

export type SeverityLevel = 'normal' | 'mild' | 'moderate' | 'severe' | 'proliferative';

export type LanguageCode = 'en' | 'te' | 'hi';

export type DiseaseFilterType = 'all' | 'Microaneurysms' | 'Hemorrhages' | 'Hard Exudates' | 'Vascular Abnormalities';

export interface ImageQualityCheck {
  fovDetected: boolean;
  focusAcceptable: boolean;
  exposureAcceptable: boolean;
  retinaVisible: boolean;
  blurScore: number;
  illuminationUniformity: number;
}

export interface RetinalFinding {
  id: string;
  name: 'Microaneurysms' | 'Hemorrhages' | 'Hard Exudates' | 'Vascular Abnormalities';
  count: number;
  severity: 'mild' | 'moderate' | 'severe';
  category: 'structural' | 'colour';
  locationDescription: string;
  coords: { x: number; y: number; radius: number; cropX?: number; cropY?: number; cropRadius?: number }[];
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: 'Male' | 'Female' | 'Other';
  diabetesHistory: string;
  cameraDevice: string;
  lastScreeningDate?: string;
  phcLocation: string;
}

export interface ScreeningCase {
  id: string;
  patient: Patient;
  timestamp: string;
  imageUrl?: string;
  quality: ImageQualityCheck;
  qualityStatus: ImageQualityStatus;
  status: 'new' | 'captured' | 'analyzing' | 'completed' | 'recapture_required';
  result?: {
    diagnosis: string;
    icdrLevel: number;
    severity: SeverityLevel;
    confidence: 'High' | 'Medium' | 'Low';
    confidenceScore: number;
    triageTier: 'Tier 1 (Auto-Cleared)' | 'Tier 2 (Priority Review)' | 'Tier 3 (Specialist Escalation)';
    findings: RetinalFinding[];
    progressionRisk: number; // 0-100%
    recallAdvice: '12 Months' | '6 Months' | '3 Months (Urgent)';
    csmeThreatDetected?: boolean;
    csmeFoveaDistanceDiscDiameters?: number;
    gradcamOverlay?: string;
    preprocessedImage?: string;
    probabilities?: Record<string, number>;
    rescuedBy?: string;
    clinicalGuidance?: {
      icd10Code: string;
      referralTimeline: string;
      guidelineSource: string;
      doctorTechnicalNote: string;
      patientSummaryEn: string;
      patientSummaryHi: string;
      safetyAuditPassed: boolean;
    };
  };
  doctorReviewStatus?: 'pending' | 'approved' | 'overruled' | 'recapture_requested';
  doctorNotes?: string;
  waitingTimeMinutes?: number;
  priority?: 'HIGH PRIORITY' | 'STANDARD REVIEW';
  synced: boolean;
}
