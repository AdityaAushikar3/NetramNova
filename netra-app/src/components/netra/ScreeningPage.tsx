'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Patient, ScreeningCase } from './types';
import { MOCK_PATIENTS } from './mockData';
import { RetinalAnalysisPanel } from './RetinalAnalysisPanel';
import { NewPatientModal } from './NewPatientModal';
import { analyzeFundusQuality, QualityMetrics } from '../../lib/qualityCheck';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  UserPlus,
  Search,
  Cpu,
  Loader2,
  Check,
  Upload,
  Plus,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface ScreeningPageProps {
  onCaseCompleted?: (newCase: ScreeningCase) => void;
  /** Called when a new patient is registered from this page's modal, so parent can persist to DB */
  onPatientAdded?: (patient: Patient) => void;
  initialPatientId?: string;
  /** DB-loaded patients from the parent. Falls back to MOCK_PATIENTS if not provided. */
  patients?: Patient[];
}

export const ScreeningPage: React.FC<ScreeningPageProps> = ({ onCaseCompleted, onPatientAdded, initialPatientId, patients: patientsProp }) => {
  // Use DB-loaded patients from parent; fall back to mock
  const currentPatients = patientsProp && patientsProp.length > 0 ? patientsProp : MOCK_PATIENTS;

  const [selectedPatient, setSelectedPatient] = useState<Patient>(() => {
    const src = patientsProp ?? MOCK_PATIENTS;
    if (initialPatientId) {
      const match = src.find((p) => p.id === initialPatientId);
      if (match) return match;
    }
    return src[0] ?? MOCK_PATIENTS[0];
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cameraDevice, setCameraDevice] = useState<string>('Remidio NM-FOP');
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);

  // Processing state machine: 'idle' | 'processing' | 'completed'
  const [stage, setStage] = useState<'idle' | 'processing' | 'completed'>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  // BUG 6 FIX: explicit error state so failures show a clear message, not stale MOCK data
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // UI-3 FIX: Initialize with a blank case, not MOCK_CASES[0].
  // Spreading MOCK_CASES[0] put a fake 'Moderate DR' result, 'completed' status,
  // and '/samples/moderate_dr.jpg' imageUrl into state before any scan is run.
  const [activeCase, setActiveCase] = useState<ScreeningCase>({
    id: '',
    patient: patientsProp?.[0] ?? MOCK_PATIENTS[0],
    timestamp: new Date().toISOString(),
    imageUrl: undefined,
    quality: {
      fovDetected: false,
      focusAcceptable: false,
      exposureAcceptable: false,
      retinaVisible: false,
      blurScore: 0,
      illuminationUniformity: 0,
    },
    qualityStatus: 'passed',
    status: 'new',
    result: undefined,
    synced: false,
  });

  useEffect(() => {
    if (initialPatientId) {
      const match = currentPatients.find((p) => p.id === initialPatientId);
      if (match) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedPatient(match);
         
        setActiveCase((prev) => ({ ...prev, patient: match }));
      }
    }
  }, [initialPatientId, currentPatients]);

  // Live Step 2 Quality Metrics state
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics>({
    gradable: true,
    qualityStatus: 'passed',
    rejectionReasons: [],
    fovCoverageRatio: 0.88,
    focusScore: 172.5,
    meanIllumination: 114.2,
    glareRatio: 0.008,
    retinaVisible: true,
  });

  const previewImgRef = useRef<HTMLImageElement | null>(null);

  // Clinical processing microinteraction sequence steps
  const processingSteps = [
    { title: 'Stage 1: Tri-Axis Adequacy Gate', desc: 'Focus, Glare & Retinal FOV evaluation (RED/AMBER/GREEN)' },
    { title: 'Stage 2: Ben Graham Illumination Engine', desc: 'Local color subtraction standardizes acquisition lighting' },
    { title: 'Stage 3: Deep Feature Classification', desc: 'EfficientNet-B2 forward pass with Focal Loss' },
    { title: 'Stage 4: Biomarker Lesion Extraction', desc: 'Pinpointing microaneurysms, hemorrhages & exudates' },
    { title: 'Stage 5: ETDRS 4-2-1 Clinical Consensus', desc: 'Quadrant consensus audit & human-in-the-loop triage' },
  ];

  const handlePatientSelect = (p: Patient) => {
    setSelectedPatient(p);
    setCustomImageUrl(null);
    setSelectedFile(null);
    setStage('idle');
    setActiveCase((prev) => ({ ...prev, patient: p }));
  };

  // BUG 1 & 4 FIX:
  // BUG 1: Never inject MOCK result data for a newly registered patient.
  //        A newly registered patient has no scan yet — status should be 'new', result undefined.
  // BUG 4: Call onPatientAdded prop so the parent (page.tsx) persists the new patient to the DB.
  //        Previously this only updated local patientsList state and the patient was lost on refresh.
  const handleAddPatient = (newPatient: Patient) => {
    setSelectedPatient(newPatient);
    setStage('idle');
    setCustomImageUrl(null);
    setSelectedFile(null);
    setActiveCase((prev) => ({ ...prev, patient: newPatient, status: 'new', result: undefined }));
    // Notify parent to persist to DB
    onPatientAdded?.(newPatient);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (customImageUrl && customImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(customImageUrl);
      }
      const url = URL.createObjectURL(file);
      setCustomImageUrl(url);
      setActiveCase((prev) => ({
        ...prev,
        imageUrl: url,
      }));
    }
  };

  const handleStartAnalysis = async () => {
    setStage('processing');
    setCurrentStepIndex(0);
    setAnalysisError(null); // clear previous errors

    let step = 0;
    const interval = setInterval(() => {
      step = Math.min(step + 1, processingSteps.length - 2);
      setCurrentStepIndex(step);
    }, 400);

    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('file', selectedFile);
      } else if (currentPreviewUrl) {
        // BUG 5 FIX: Only fetch the preview URL if it's a real blob URL (user uploaded)
        // Do not attempt to fetch a non-existent /samples/ path
        const res = await fetch(currentPreviewUrl);
        if (!res.ok) throw new Error('Could not load the preview image for analysis.');
        const blob = await res.blob();
        formData.append('file', blob, 'sample_fundus.jpg');
      } else {
        clearInterval(interval);
        setStage('idle');
        setAnalysisError('Please upload a fundus image before running analysis.');
        return;
      }

      const apiRes = await fetch('/api/classify', {
        method: 'POST',
        body: formData,
      });

      if (!apiRes.ok) {
        throw new Error(`Inference API returned status: ${apiRes.status}`);
      }

      const data = await apiRes.json();

      clearInterval(interval);
      setCurrentStepIndex(processingSteps.length - 1);

      setTimeout(() => {
        const completedCase: ScreeningCase = {
          id: `CASE-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          patient: selectedPatient,
          timestamp: new Date().toISOString(),
          imageUrl: currentPreviewUrl ?? undefined,
          status: 'completed',
          quality: data.quality || activeCase.quality,
          qualityStatus: data.qualityStatus || activeCase.qualityStatus,
          synced: false,
          doctorReviewStatus: 'pending',
          result: {
            diagnosis: data.diagnosis || 'Retinal Assessment Complete',
            icdrLevel: data.icdrLevel ?? 0,
            severity: data.severity || 'normal',
            confidence: data.confidence || 'High',
            confidenceScore: data.confidenceScore ?? 85,
            triageTier: data.triageTier || 'Tier 1 (Auto-Cleared)',
            findings: data.findings || [],
            progressionRisk: data.progressionRisk ?? 10,
            recallAdvice: data.recallAdvice || '12 Months',
            csmeThreatDetected: data.csmeThreatDetected,
            csmeFoveaDistanceDiscDiameters: data.csmeFoveaDistanceDiscDiameters,
            gradcamOverlay: data.gradcamOverlay,
            preprocessedImage: data.preprocessedImage,
            probabilities: data.probabilities,
            rescuedBy: data.rescuedBy,
            clinicalGuidance: data.clinicalGuidance,
          },
        };

        setActiveCase(completedCase);
        setStage('completed');
        onCaseCompleted?.(completedCase);
      }, 400);
    } catch (err) {
      // BUG 6 FIX: Show explicit error state instead of silently displaying stale MOCK data
      clearInterval(interval);
      console.error('[NetramNova] Classification error:', err);
      setStage('idle');
      setAnalysisError(
        err instanceof Error ? err.message : 'Analysis failed. Please try again.'
      );
    }
  };

  const handleResetScreening = () => {
    // Clean up blob URL to prevent memory leak
    if (customImageUrl && customImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(customImageUrl);
    }
    setStage('idle');
    setCustomImageUrl(null);
    setSelectedFile(null);
    setAnalysisError(null);
    // Reset activeCase back to blank (no stale result/imageUrl from previous scan)
    setActiveCase((prev) => ({
      ...prev,
      id: '',
      imageUrl: undefined,
      status: 'new',
      result: undefined,
      quality: { fovDetected: false, focusAcceptable: false, exposureAcceptable: false, retinaVisible: false, blurScore: 0, illuminationUniformity: 0 },
      qualityStatus: 'passed',
      synced: false,
    }));
  };

  // BUG 5 FIX: Remove hardcoded fallback to '/samples/moderate_dr.jpg' which doesn't exist in public/.
  // If no file is uploaded, use a placeholder. The analyze button is still available
  // but the user should be prompted to upload a real image.
  const currentPreviewUrl = customImageUrl || null;

  const filteredPatients = patientsList.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full space-y-4 font-sans select-none">
      {/* Stage 1 & Stage 2 (Idle / Capture / Setup) */}
      {stage !== 'completed' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column (1 col): Patient & Device Selector */}
          <div className="space-y-4">
            {/* Patient Selector Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider">
                  1. Patient Context
                </h3>
                <button
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Register Patient</span>
                </button>
              </div>

              {/* Search Patient */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search Patient Name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Patient Selector List */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {filteredPatients.map((p) => {
                  const isSelected = selectedPatient.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handlePatientSelect(p)}
                      className={`p-2.5 rounded border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-950/60 border-emerald-500 text-slate-100'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs font-sans">{p.name}</span>
                        <span className="text-xs font-mono text-emerald-400">{p.id}</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        {p.age}Y/{p.sex} • {p.diabetesHistory}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fundus Camera Device Selector & Custom Photo Upload */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  2. Retinal Camera Connection
                </h3>
              </div>

              <select
                value={cameraDevice}
                onChange={(e) => setCameraDevice(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded p-2 focus:outline-none focus:border-emerald-500 font-mono"
              >
                <option value="Remidio NM-FOP">Remidio NM-FOP (USB 3.0 Connected)</option>
                <option value="Forus 3nethra classic">Forus 3nethra classic (Optical Port)</option>
                <option value="Zeiss Visucam 500">Zeiss Visucam 500 (DICOM Stream)</option>
                <option value="Topcon TRC-NW400">Topcon TRC-NW400 (Local Network)</option>
              </select>

              {/* Upload Custom Fundus JPEG */}
              <div className="pt-1">
                <label className="w-full py-2 px-3 bg-slate-950 hover:bg-slate-800 border border-dashed border-slate-700 hover:border-emerald-500 rounded text-slate-300 text-xs font-mono flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Upload Real Fundus JPEG/PNG</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Right Column (2 cols): Real Fundus Image Preview & Quality Checklist */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-emerald-400" />
                  3. Real Fundus Image Preview & Quality Validation
                </h3>
                {qualityMetrics.qualityStatus === 'passed' && (
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    PASSED STEP 2 QUALITY GATE
                  </span>
                )}
                {qualityMetrics.qualityStatus === 'warning' && (
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    QUALITY WARNING
                  </span>
                )}
                {qualityMetrics.qualityStatus === 'rejected' && (
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-rose-400" />
                    UNGRADABLE - RECAPTURE NEEDED
                  </span>
                )}
              </div>

              {/* Viewport Displaying Real Fundus Photo */}
              <div className="relative w-full aspect-video bg-slate-950 rounded border border-slate-800 flex flex-col items-center justify-center p-4 overflow-hidden">
                {stage === 'processing' ? (
                  /* Microinteraction Sequence Overlay */
                  <div className="w-full max-w-md p-6 bg-slate-900/90 border border-slate-700 rounded-lg text-center space-y-4 shadow-2xl backdrop-blur">
                    <div className="flex justify-center">
                      <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-slate-100 uppercase tracking-wider">
                        Processing Step {currentStepIndex + 1} of {processingSteps.length}
                      </div>
                      <h4 className="text-sm font-bold text-emerald-400 mt-1 font-sans">
                        {processingSteps[currentStepIndex].title}
                      </h4>
                      <p className="text-xs text-slate-400 font-mono mt-1">
                        {processingSteps[currentStepIndex].desc}
                      </p>
                    </div>

                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{
                          width: `${((currentStepIndex + 1) / processingSteps.length) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                ) : currentPreviewUrl ? (
                  /* Real Fundus Image Display */
                  <div className="relative flex flex-col items-center justify-center text-center space-y-2">
                    <div className="w-44 h-44 rounded-full border-2 border-emerald-500/60 overflow-hidden shadow-2xl relative bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        ref={previewImgRef}
                        src={currentPreviewUrl}
                        alt="Retinal Fundus Preview"
                        crossOrigin="anonymous"
                        onLoad={() => {
                          if (previewImgRef.current) {
                            const res = analyzeFundusQuality(previewImgRef.current);
                            setQualityMetrics(res);
                          }
                        }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-xs text-slate-300 font-mono">
                      Acquired via {cameraDevice} • 45° Non-Mydriatic FOV
                    </p>
                  </div>
                ) : (
                  /* BUG 5 FIX: No image loaded — show upload prompt placeholder */
                  <div className="flex flex-col items-center justify-center gap-3 text-slate-500">
                    <Camera className="w-12 h-12 opacity-30" />
                    <div className="text-center">
                      <p className="text-xs font-mono font-bold text-slate-400">No Fundus Image Loaded</p>
                      <p className="text-xs font-mono text-slate-600 mt-0.5">Upload a JPEG/PNG fundus photograph to begin analysis</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Live Quality Checklist Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
                <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">FOV Ratio:</span>
                  <span className={`font-bold flex items-center gap-1 ${qualityMetrics.fovCoverageRatio >= 0.35 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {qualityMetrics.fovCoverageRatio >= 0.35 ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {(qualityMetrics.fovCoverageRatio * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Focus Score:</span>
                  <span className={`font-bold flex items-center gap-1 ${qualityMetrics.focusScore >= 60 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {qualityMetrics.focusScore >= 60 ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {qualityMetrics.focusScore}
                  </span>
                </div>

                <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Luminance:</span>
                  <span className={`font-bold flex items-center gap-1 ${qualityMetrics.meanIllumination >= 25 && qualityMetrics.meanIllumination <= 225 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {qualityMetrics.meanIllumination >= 25 && qualityMetrics.meanIllumination <= 225 ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {qualityMetrics.meanIllumination}
                  </span>
                </div>

                <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Glare Ratio:</span>
                  <span className={`font-bold flex items-center gap-1 ${qualityMetrics.glareRatio <= 0.08 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {qualityMetrics.glareRatio <= 0.08 ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {(qualityMetrics.glareRatio * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Rejection Warning Banner if Ungradable */}
              {qualityMetrics.rejectionReasons.length > 0 && (
                <div className="p-2.5 bg-rose-950/60 border border-rose-800 rounded text-rose-200 text-xs font-mono space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>Image Quality Check Warning / Rejection Reasons:</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-rose-200/90 pl-1">
                    {qualityMetrics.rejectionReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* BUG 6 FIX: Analysis Error Banner */}
              {analysisError && (
                <div className="p-2.5 bg-rose-950/60 border border-rose-800 rounded text-rose-200 text-xs font-mono flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{analysisError}</span>
                </div>
              )}

              {/* Action Trigger Button */}
              <div className="pt-2">
                <button
                  onClick={handleStartAnalysis}
                  disabled={stage === 'processing' || !currentPreviewUrl}
                  title={!currentPreviewUrl ? 'Upload a fundus image first' : undefined}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-sans font-bold text-sm rounded shadow flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Execute Foracchia Normalization &amp; Retinal Assessment</span>
                </button>
                {!currentPreviewUrl && (
                  <p className="text-center text-xs text-slate-500 font-mono mt-1.5">⬆ Upload a fundus JPEG/PNG to enable analysis</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage 3: Completed Results Dual Analysis Console */}
      {stage === 'completed' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded p-2.5 text-xs font-mono">
            <span className="text-slate-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Retinal Assessment Completed for <strong>{selectedPatient.name}</strong> ({selectedPatient.id})
            </span>
            <button
              onClick={handleResetScreening}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Start New Screening
            </button>
          </div>

          <RetinalAnalysisPanel caseData={activeCase} />
        </div>
      )}

      {/* Register Patient Modal */}
      <NewPatientModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onAddPatient={handleAddPatient}
      />
    </div>
  );
};
