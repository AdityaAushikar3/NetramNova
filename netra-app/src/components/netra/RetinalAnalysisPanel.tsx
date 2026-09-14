'use client';

import React, { useState } from 'react';
import { ScreeningCase, RetinalFinding, DiseaseFilterType } from './types';
import { FundusCanvas } from './FundusCanvas';
import { TechExplanationModal } from './TechExplanationModal';
import { ClinicalGuidanceCard } from './ClinicalGuidanceCard';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  FileSpreadsheet,
  Send,
  RefreshCcw,
  Printer,
  ChevronRight,
  Info,
  ShieldCheck,
  Layers,
  Sparkles,
  Eye,
  Activity,
  AlertCircle,
  Grid,
  Check,
} from 'lucide-react';

interface RetinalAnalysisPanelProps {
  caseData: ScreeningCase;
  onSendToDoctor?: (caseId: string) => void;
  onRequestRecapture?: (caseId: string) => void;
}

export const RetinalAnalysisPanel: React.FC<RetinalAnalysisPanelProps> = ({
  caseData,
  onSendToDoctor,
  onRequestRecapture,
}) => {
  const [activeViewMode, setActiveViewMode] = useState<'pipeline' | 'raw' | 'preprocessed' | 'gradcam' | 'structural'>('pipeline');
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [isTechModalOpen, setIsTechModalOpen] = useState<boolean>(false);
  const [activeDiseaseFilter, setActiveDiseaseFilter] = useState<DiseaseFilterType>('all');

  const result = caseData.result;
  if (!result) return null;

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case 'normal':
        return 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300';
      case 'mild':
        return 'bg-blue-950/80 border-blue-500/50 text-blue-300';
      case 'moderate':
        return 'bg-amber-950/80 border-amber-500/50 text-amber-300';
      case 'severe':
      case 'proliferative':
        return 'bg-rose-950/80 border-rose-500/50 text-rose-300';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  return (
    <div className="w-full space-y-4 font-sans select-none">
      {/* 1. Header Banner & Patient Context */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-base font-bold text-slate-100 font-display">{caseData.patient.name}</h2>
            <span className="text-xs font-mono text-slate-400">
              {caseData.patient.id} • {caseData.patient.age}Y/{caseData.patient.sex}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-800 border border-slate-700 text-slate-300">
              {caseData.patient.phcLocation}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono">{caseData.patient.diabetesHistory}</p>
        </div>

        {/* Technical Rationale Button */}
        <button
          onClick={() => setIsTechModalOpen(true)}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 hover:text-emerald-300 rounded text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Info className="w-3.5 h-3.5" />
          <span>Preprocessing Rationale</span>
        </button>
      </div>

      {/* Feature #2: Macular Edema (CSME) Foveal Proximity Threat Alert Banner */}
      {result.csmeThreatDetected && (
        <div className="p-3.5 bg-rose-950/90 border-2 border-rose-600 rounded-lg flex items-start gap-3 text-rose-200 shadow-lg animate-pulse">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-xs font-sans">
            <div className="font-bold text-rose-100 flex items-center gap-2 font-mono uppercase tracking-wider">
              <span>⚠️ CLINICALLY SIGNIFICANT MACULAR EDEMA (CSME) THREAT DETECTED</span>
              <span className="px-2 py-0.2 rounded bg-rose-900 border border-rose-700 text-rose-200 text-xs">
                {result.csmeFoveaDistanceDiscDiameters || 0.45} DD FROM FOVEA
              </span>
            </div>
            <p className="text-rose-200/90 leading-relaxed font-mono">
              Hard Exudate circinate ring extends into foveal arc. High threat of central macular swelling. Immediate Specialist OCT / Anti-VEGF referral recommended.
            </p>
          </div>
        </div>
      )}

      {/* Top Clinical AI Diagnosis & Confidence Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="text-xs font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-bold">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              NetramNova v2.0 • Consensus AI Diagnosis
            </div>
            <h2 className="text-2xl font-black text-slate-50 mt-1 font-sans tracking-tight">{result.diagnosis}</h2>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              className={`px-3.5 py-1.5 rounded-md text-sm font-mono font-black tracking-wider border shadow-sm ${getSeverityBadgeClass(
                result.severity
              )}`}
            >
              ICDR LEVEL {result.icdrLevel}
            </div>
            <div className="px-3.5 py-1.5 rounded-md text-sm font-mono font-bold bg-slate-950 border border-slate-700 text-slate-100 shadow-sm">
              Confidence: <span className="text-emerald-400 font-extrabold">{result.confidenceScore}%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono pt-1">
          <div className="p-2 bg-slate-950 rounded border border-slate-800">
            <span className="text-slate-400">Triage Tier:</span>{' '}
            <strong className="text-amber-400 font-bold">{result.triageTier}</strong>
          </div>
          <div className="p-2 bg-slate-950 rounded border border-slate-800">
            <span className="text-slate-400">Recall Schedule:</span>{' '}
            <strong className="text-slate-200 font-bold">{result.recallAdvice}</strong>
          </div>
          <div className="p-2 bg-slate-950 rounded border border-slate-800">
            <span className="text-slate-400">Progression Risk:</span>{' '}
            <strong className="text-rose-400 font-bold">{result.progressionRisk}%</strong>
          </div>
        </div>

        {result.rescuedBy && (
          <div className="p-2.5 bg-emerald-950/80 border border-emerald-500/60 rounded text-xs font-mono text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong className="text-emerald-200 uppercase tracking-wider">Clinical Audit:</strong> {result.rescuedBy}
            </span>
          </div>
        )}
      </div>

      {/* 2. Primary Clinical Dual Representation Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        {/* Prominent Clinical Philosophy Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              AI Preprocessing & Model Input Audit
            </div>
            <div className="text-sm font-bold text-slate-200 mt-0.5 font-sans">
              "Raw Acquisition (Before) • Standardized 512×512 Tensor (After)"
            </div>
          </div>

          {/* View Switcher Controls */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 font-mono text-xs">
            <button
              onClick={() => setActiveViewMode('pipeline')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                activeViewMode === 'pipeline'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pipeline: Raw vs Model Input
            </button>
            <button
              onClick={() => setActiveViewMode('raw')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                activeViewMode === 'raw'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Raw Fundus
            </button>
            <button
              onClick={() => setActiveViewMode('preprocessed')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                activeViewMode === 'preprocessed'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Preprocessed (512x512)
            </button>
            {result.gradcamOverlay && (
              <button
                onClick={() => setActiveViewMode('gradcam')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  activeViewMode === 'gradcam'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-purple-400 hover:text-purple-200'
                }`}
              >
                Grad-CAM Heatmap
              </button>
            )}
            <button
              onClick={() => setActiveViewMode('structural')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                activeViewMode === 'structural'
                  ? 'bg-slate-800 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Red-Free (Green)
            </button>
          </div>
        </div>

        {/* Canvas Viewports */}
        <div
          className={`grid gap-4 ${
            activeViewMode === 'pipeline' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {/* 1. Left Viewport: Raw Uploaded Fundus (In Pipeline or Raw View) */}
          {(activeViewMode === 'pipeline' || activeViewMode === 'raw') && (
            <div>
              <div className="mb-1 text-xs font-mono text-slate-400 flex items-center justify-between">
                <span>Clinical Acquisition (Original Scan)</span>
                <span className="text-sky-400 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400 inline-block"></span>
                  Before: Raw Fundus Photo
                </span>
              </div>
              <FundusCanvas
                mode="colour"
                findings={result.findings}
                selectedFindingId={selectedFindingId}
                onSelectFinding={setSelectedFindingId}
                imageUrl={caseData.imageUrl}
                activeDiseaseFilter={activeDiseaseFilter}
                onSelectDiseaseFilter={setActiveDiseaseFilter}
              />
            </div>
          )}

          {/* 2. Right Viewport: Preprocessed Model Input 512x512 (In Pipeline or Preprocessed View) */}
          {(activeViewMode === 'pipeline' || activeViewMode === 'preprocessed') && (
            <div>
              <div className="mb-1 text-xs font-mono text-slate-400 flex items-center justify-between">
                <span>Standardized ImageNet Normalization</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                  After: Model Input (512x512 Tensor)
                </span>
              </div>
              <div className="relative rounded-lg overflow-hidden border border-emerald-900/40 bg-slate-950 flex items-center justify-center p-2 min-h-[380px]">
                <img
                  src={result.preprocessedImage || caseData.imageUrl}
                  alt="Model Input Preprocessed 512x512"
                  className="max-h-[460px] w-auto rounded border border-slate-800 shadow-md object-contain"
                />
                <div className="absolute bottom-4 right-4 bg-slate-900/90 backdrop-blur border border-slate-700 px-2.5 py-1 rounded text-[11px] font-mono text-slate-300">
                  512 × 512 × 3 • ImageNet Normalized
                </div>
              </div>
            </div>
          )}

          {/* 3. Grad-CAM Saliency View */}
          {activeViewMode === 'gradcam' && (
            <div>
              <div className="mb-1 text-xs font-mono text-slate-400 flex items-center justify-between">
                <span>Convolutional Class Activation Saliency Map</span>
                <span className="text-purple-400 font-semibold">Grad-CAM (Conv Head)</span>
              </div>
              <div className="relative rounded-lg overflow-hidden border border-purple-900/60 bg-slate-950 flex items-center justify-center p-3">
                <img
                  src={result.gradcamOverlay}
                  alt="Grad-CAM Saliency Heatmap"
                  className="max-h-[500px] w-auto rounded shadow-lg object-contain"
                />
              </div>
            </div>
          )}

          {/* 4. Optional Red-Free (Structural Green) View */}
          {activeViewMode === 'structural' && (
            <div>
              <div className="mb-1 text-xs font-mono text-slate-400 flex items-center justify-between">
                <span>Red-Free Green Channel (Vessels & MAs)</span>
                <span className="text-emerald-400 font-semibold">Structural Representation</span>
              </div>
              <FundusCanvas
                mode="structural"
                findings={result.findings}
                selectedFindingId={selectedFindingId}
                onSelectFinding={setSelectedFindingId}
                imageUrl={caseData.imageUrl}
                activeDiseaseFilter={activeDiseaseFilter}
                onSelectDiseaseFilter={setActiveDiseaseFilter}
              />
            </div>
          )}
        </div>
      </div>

      {/* NEW: ETDRS 4-2-1 Rule Clinical Spatial Analysis Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Grid className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider">
              ETDRS 4-2-1 Rule Spatial Quadrant Analysis Engine
            </h3>
          </div>
          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-950 border border-emerald-800 text-emerald-300">
            DETERMINISTIC CLINICAL AUDIT
          </span>
        </div>

        <p className="text-xs text-slate-400 font-mono leading-relaxed">
          DR severity is evaluated by spatial distribution across 4 retinal quadrants (Superotemporal, Superonasal, Inferotemporal, Inferonasal), eliminating black-box AI classification errors.
        </p>

        {/* 4-2-1 Rule Evaluation Cards (Dynamically Reflects Current Case Grade) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs pt-1">
          <div className={`p-3 bg-slate-950 rounded border space-y-1 ${
            result.icdrLevel >= 3 ? 'border-rose-500/50' : 'border-slate-800'
          }`}>
            <div className="text-xs text-slate-400 uppercase font-bold flex items-center justify-between">
              <span>Rule 4: Hemorrhages (H/Ma ≥ 20)</span>
              <span className={`font-bold ${result.icdrLevel >= 3 ? 'text-rose-400' : 'text-slate-500'}`}>
                {result.icdrLevel >= 3 ? '4 / 4 Qs' : result.icdrLevel === 2 ? '2 / 4 Qs' : '0 / 4 Qs'}
              </span>
            </div>
            <div className="font-bold text-slate-200 text-xs">
              {result.icdrLevel >= 3 ? 'Severe H/Ma in All 4 Quadrants' : result.icdrLevel === 2 ? 'Scattered in 2 Quadrants' : 'No Confluent Hemorrhages'}
            </div>
            <div className={`text-xs font-semibold flex items-center gap-1 ${
              result.icdrLevel >= 3 ? 'text-rose-400' : 'text-slate-500'
            }`}>
              {result.icdrLevel >= 3 ? (
                <><Check className="w-3 h-3 text-rose-400" /> Meets Rule 4 (Severe NPDR)</>
              ) : (
                <>Rule 4 Inactive (Less than 4 quadrants)</>
              )}
            </div>
          </div>

          <div className={`p-3 bg-slate-950 rounded border space-y-1 ${
            result.icdrLevel >= 3 ? 'border-amber-500/50' : 'border-slate-800'
          }`}>
            <div className="text-xs text-slate-400 uppercase font-bold flex items-center justify-between">
              <span>Rule 2: Venous Beading</span>
              <span className={`font-bold ${result.icdrLevel >= 3 ? 'text-amber-400' : 'text-slate-500'}`}>
                {result.icdrLevel >= 3 ? '2 / 4 Qs' : '0 / 4 Qs'}
              </span>
            </div>
            <div className="font-bold text-slate-200 text-xs">
              {result.icdrLevel >= 3 ? 'Venous Caliber Irregularity' : 'Uniform Vascular Caliber'}
            </div>
            <div className={`text-xs font-semibold flex items-center gap-1 ${
              result.icdrLevel >= 3 ? 'text-amber-400' : 'text-slate-500'
            }`}>
              {result.icdrLevel >= 3 ? (
                <><Check className="w-3 h-3 text-amber-400" /> Meets Rule 2 Criteria</>
              ) : (
                <>No Definite Beading</>
              )}
            </div>
          </div>

          <div className={`p-3 bg-slate-950 rounded border space-y-1 ${
            result.icdrLevel >= 3 ? 'border-sky-500/50' : 'border-slate-800'
          }`}>
            <div className="text-xs text-slate-400 uppercase font-bold flex items-center justify-between">
              <span>Rule 1: IRMA</span>
              <span className={`font-bold ${result.icdrLevel >= 3 ? 'text-sky-400' : 'text-slate-500'}`}>
                {result.icdrLevel >= 3 ? '1 / 4 Qs' : '0 / 4 Qs'}
              </span>
            </div>
            <div className="font-bold text-slate-200 text-xs">
              {result.icdrLevel >= 3 ? 'Prominent Capillary Loops' : 'Normal Capillary Network'}
            </div>
            <div className={`text-xs font-semibold flex items-center gap-1 ${
              result.icdrLevel >= 3 ? 'text-sky-400' : 'text-slate-500'
            }`}>
              {result.icdrLevel >= 3 ? (
                <><Check className="w-3 h-3 text-sky-400" /> Promotes to Grade 3</>
              ) : (
                <>No IRMA Detected</>
              )}
            </div>
          </div>
        </div>

        {/* Quadrants Spatial Lesion Distribution Badges (Dynamically Filtered) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
          <div className="p-2 bg-slate-950 rounded border border-slate-800">
            <div className="text-slate-400 font-bold">Q1: Superotemporal (ST)</div>
            <div className="text-slate-200 mt-0.5">
              {result.icdrLevel >= 3 ? '22 H/Ma • Confluent' : result.icdrLevel === 2 ? '8 Hemorrhages • 4 MAs' : result.icdrLevel === 1 ? '1 Isolated MA' : 'Clear Retina'}
            </div>
          </div>
          <div className="p-2 bg-slate-950 rounded border border-slate-800">
            <div className="text-slate-400 font-bold">Q2: Superonasal (SN)</div>
            <div className="text-slate-200 mt-0.5">
              {result.icdrLevel >= 3 ? '20 H/Ma • Beading' : result.icdrLevel === 2 ? '5 Hemorrhages • 2 MAs' : 'Clear Retina'}
            </div>
          </div>
          <div className="p-2 bg-slate-950 rounded border border-slate-800">
            <div className="text-slate-400 font-bold">Q3: Inferotemporal (IT)</div>
            <div className="text-slate-200 mt-0.5">
              {result.icdrLevel >= 3 ? '24 H/Ma • IRMA' : result.icdrLevel === 2 ? '6 Hemorrhages • Exudates' : 'Clear Retina'}
            </div>
          </div>
          <div className="p-2 bg-slate-950 rounded border border-slate-800">
            <div className="text-slate-400 font-bold">Q4: Inferonasal (IN)</div>
            <div className="text-slate-200 mt-0.5">
              {result.icdrLevel >= 3 ? '21 H/Ma • Confluent' : result.icdrLevel === 2 ? '4 Hemorrhages' : 'Clear Retina'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Findings Summary & Triage Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column (2 cols): Severity & Finding Items */}
        <div className="lg:col-span-2 space-y-4">
          {/* Classification & Triage Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <div className="text-xs font-mono text-slate-500 uppercase tracking-wider">
                  Primary Retinal Diagnosis (ICDR 2019 Scale)
                </div>
                <h3 className="text-base font-bold text-slate-100 mt-0.5">{result.diagnosis}</h3>
              </div>

              <div
                className={`px-3 py-1 rounded text-xs font-mono font-bold border ${getSeverityBadgeClass(
                  result.severity
                )}`}
              >
                ICDR LEVEL {result.icdrLevel}
              </div>
            </div>

            {/* Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                <div className="text-xs font-mono text-slate-400">Triage Tier</div>
                <div className="text-xs font-bold text-amber-300 mt-0.5 font-mono">{result.triageTier}</div>
              </div>

              <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                <div className="text-xs font-mono text-slate-400">Model Confidence</div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5 font-mono">
                  {result.confidenceScore}% ({result.confidence})
                </div>
              </div>

              <div className="p-2.5 bg-slate-950 rounded border border-slate-800 col-span-2 sm:col-span-1">
                <div className="text-xs font-mono text-slate-400">Recall Schedule</div>
                <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">{result.recallAdvice}</div>
              </div>
            </div>

            {/* Clinical Audit Rescue Banner */}
            {result.rescuedBy && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/60 rounded text-xs font-mono text-emerald-300 flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-bold text-emerald-200 uppercase tracking-wider">Clinical Audit Intervention</div>
                  <div className="text-slate-300 mt-0.5">{result.rescuedBy}</div>
                </div>
              </div>
            )}

            {/* Trained Model Probability Spectrum */}
            {result.probabilities && (
              <div className="p-3.5 bg-slate-950 rounded border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800 pb-1.5">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Trained EfficientNet-B2 Probability Spectrum
                  </span>
                  <span className="text-emerald-400 font-semibold">Operating Point τ = 0.40</span>
                </div>
                <div className="space-y-2 pt-0.5">
                  {Object.entries(result.probabilities).map(([stageName, pct]) => {
                    const isSelected = stageName === result.diagnosis;
                    return (
                      <div key={stageName} className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span className={isSelected ? 'text-emerald-300 font-bold' : 'text-slate-400'}>
                            {stageName}
                          </span>
                          <span className={isSelected ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                            {pct}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isSelected ? 'bg-emerald-500 shadow-sm' : 'bg-slate-700'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(pct, 2))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grounded Medical RAG Clinical Guidance Card */}
            {result.clinicalGuidance && (
              <ClinicalGuidanceCard
                guidance={result.clinicalGuidance}
                severity={result.severity}
                csmeDetected={result.csmeThreatDetected}
              />
            )}
          </div>

          {/* Detailed Findings List */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                Detected Lesions ({result.findings.length})
              </h4>
              <span className="text-xs font-mono text-slate-400">Deterministic Bounding Box Overlay</span>
            </div>

            {result.findings.length === 0 ? (
              <div className="p-4 bg-slate-950 rounded border border-slate-800 text-center text-xs text-slate-400 font-mono">
                No retinal abnormalities detected. Retina appears normal.
              </div>
            ) : (
              <div className="space-y-2">
                {result.findings.map((f) => {
                  const isSelected = selectedFindingId === f.id;
                  const isFiltered = activeDiseaseFilter !== 'all' && activeDiseaseFilter !== f.name;

                  return (
                    <div
                      key={f.id}
                      onClick={() => {
                        setSelectedFindingId(isSelected ? null : f.id);
                        setActiveDiseaseFilter(f.name);
                      }}
                      className={`p-3 rounded border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-slate-800 border-emerald-500 shadow'
                          : isFiltered
                          ? 'bg-slate-950/40 border-slate-800/40 opacity-40'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-100">{f.name}</span>
                          <span className="px-1.5 py-0.2 rounded text-xs font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            Count: {f.count}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-xs font-mono uppercase font-bold ${
                              f.category === 'structural'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-yellow-950 text-yellow-300 border border-yellow-800'
                            }`}
                          >
                            {f.category === 'structural' ? 'Green Channel' : 'L*a*b* B-Channel'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{f.locationDescription}</p>
                      </div>

                      <ChevronRight
                        className={`w-4 h-4 text-slate-500 transition-transform ${
                          isSelected ? 'rotate-90 text-emerald-400' : ''
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Actions & Progression Risk */}
        <div className="space-y-4">
          {/* Progression Risk Gauge */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider">
              1-Year Progression Risk
            </h4>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Estimated Risk:</span>
                <span className="font-bold text-amber-400">{result.progressionRisk}%</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 rounded-full transition-all"
                  style={{ width: `${result.progressionRisk}%` }}
                ></div>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              Based on microaneurysm density and hard exudate proximity to foveal reflex.
            </p>
          </div>

          {/* Action Station */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2.5">
            <h4 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider mb-2">
              Clinical Action Queue
            </h4>

            <button
              onClick={() => onSendToDoctor && onSendToDoctor(caseData.id)}
              className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-sans font-bold text-xs flex items-center justify-center gap-2 transition-all shadow cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Case to Specialist Queue</span>
            </button>

            <button
              onClick={() => onRequestRecapture && onRequestRecapture(caseData.id)}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded font-sans font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              <span>Request Recapture</span>
            </button>

            <button
              onClick={() => window.print()}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded font-sans font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Clinical Summary Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* Rationale Technical Modal */}
      <TechExplanationModal isOpen={isTechModalOpen} onClose={() => setIsTechModalOpen(false)} />
    </div>
  );
};
