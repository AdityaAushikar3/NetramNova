'use client';

import React, { useState } from 'react';
import { ScreeningCase } from './types';
import { MOCK_CASES } from './mockData';
import { FundusCanvas } from './FundusCanvas';
import {
  Stethoscope,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserCheck,
  FileEdit,
  Send,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface DoctorReviewPageProps {
  cases?: ScreeningCase[];
  onUpdateCaseStatus?: (caseId: string, doctorStatus: 'approved' | 'overruled' | 'recapture_requested', notes: string) => void;
}

export const DoctorReviewPage: React.FC<DoctorReviewPageProps> = ({
  cases: propCases,
  onUpdateCaseStatus,
}) => {
  // UI-1 FIX: Only fall back to MOCK_CASES when propCases is truly empty (length 0),
  // not just undefined. An empty real array is falsy-equivalent but truthy, so
  // the old `propCases || MOCK_CASES` would never trigger for an empty DB.
  const cases = (propCases && propCases.length > 0) ? propCases : MOCK_CASES;
  const [selectedCaseId, setSelectedCaseId] = useState<string>(cases[0]?.id || '');
  const [activeQueueTab, setActiveQueueTab] = useState<'high' | 'standard'>('high');

  // Decision form state
  const [decision, setDecision] = useState<'approved' | 'overruled' | 'recapture_requested'>('approved');
  const [overruleGrade, setOverruleGrade] = useState<string>('Moderate NPDR');
  const [notes, setNotes] = useState<string>('Confirmed findings of temporal MAs and perimacular hard exudates. Recommend 6-month follow-up.');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const selectedCase = cases.find((c) => c.id === selectedCaseId) || cases[0];

  // UI-2 FIX: Real ML cases from /api/classify never have priority set explicitly.
  // Derive priority from icdrLevel so they appear in the correct queue tab.
  const getEffectivePriority = (c: ScreeningCase): 'HIGH PRIORITY' | 'STANDARD REVIEW' => {
    if (c.priority) return c.priority;
    if (c.result && c.result.icdrLevel >= 2) return 'HIGH PRIORITY';
    return 'STANDARD REVIEW';
  };

  const highPriorityCases = cases.filter((c) => getEffectivePriority(c) === 'HIGH PRIORITY');
  const standardPriorityCases = cases.filter((c) => getEffectivePriority(c) === 'STANDARD REVIEW');

  const visibleQueueCases = activeQueueTab === 'high' ? highPriorityCases : standardPriorityCases;

  const handleSubmitDecision = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      if (onUpdateCaseStatus) {
        onUpdateCaseStatus(selectedCaseId, decision, notes);
      }
    }, 800);
  };

  return (
    <div className="w-full space-y-4 font-sans select-none">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100 font-display">
              Specialist Review Queue & Tele-Ophthalmology Workstation
            </h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Secondary verification portal for remote ophthalmologists & retina specialists
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2.5 py-1 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 font-bold">
            {highPriorityCases.length} HIGH PRIORITY CASES
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
            {standardPriorityCases.length} STANDARD REVIEW
          </span>
        </div>
      </div>

      {/* Workspace Grid: Left Queue (1 col), Right Detailed Decision Panel (2 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Queue Panel */}
        <div className="space-y-3">
          {/* Queue Tab Switches */}
          <div className="flex items-center bg-slate-900 p-1 rounded border border-slate-800 font-mono text-xs">
            <button
              onClick={() => setActiveQueueTab('high')}
              className={`flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                activeQueueTab === 'high'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              High Priority ({highPriorityCases.length})
            </button>
            <button
              onClick={() => setActiveQueueTab('standard')}
              className={`flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                activeQueueTab === 'standard'
                  ? 'bg-slate-800 text-slate-200 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Standard ({standardPriorityCases.length})
            </button>
          </div>

          {/* Queue Case Items */}
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {visibleQueueCases.map((c) => {
              const isSelected = selectedCaseId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCaseId(c.id)}
                  className={`p-3 rounded border transition-all cursor-pointer space-y-1.5 ${
                    isSelected
                      ? 'bg-slate-800 border-emerald-500 shadow'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-100">{c.patient.name}</span>
                    <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-400" />
                      {c.waitingTimeMinutes || 15}m ago
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 font-medium">{c.result?.diagnosis}</div>

                  <div className="flex items-center justify-between text-xs font-mono pt-1">
                    <span className="text-slate-400">{c.patient.phcLocation}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                        c.doctorReviewStatus === 'approved'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {c.doctorReviewStatus || 'PENDING'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Detailed Case Review Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Case Retinal Image Viewer & Patient Details */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100">{selectedCase.patient.name}</h3>
                <p className="text-xs font-mono text-slate-400">
                  {selectedCase.patient.id} • {selectedCase.patient.age}Y/{selectedCase.patient.sex} • {selectedCase.patient.diabetesHistory}
                </p>
              </div>
              <div className="text-right font-mono text-xs">
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                  {selectedCase.result?.triageTier}
                </span>
              </div>
            </div>

            {/* Retinal Canvas */}
            {selectedCase.result && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-mono text-slate-400 mb-1 flex items-center justify-between">
                    <span>Clinical Acquisition</span>
                    <span className="text-sky-400 font-semibold">Before: Raw Fundus Photo</span>
                  </div>
                  <FundusCanvas mode="colour" findings={selectedCase.result.findings} imageUrl={selectedCase.imageUrl} />
                </div>
                <div>
                  <div className="text-xs font-mono text-slate-400 mb-1 flex items-center justify-between">
                    <span>Standardized Model Input</span>
                    <span className="text-emerald-400 font-semibold">After: Preprocessed 512×512</span>
                  </div>
                  {selectedCase.result.preprocessedImage ? (
                    <div className="relative rounded-lg overflow-hidden border border-emerald-900/40 bg-slate-950 flex items-center justify-center p-2 min-h-[380px]">
                      <img
                        src={selectedCase.result.preprocessedImage}
                        alt="Preprocessed Model Input"
                        className="max-h-[460px] w-auto rounded border border-slate-800 shadow-md object-contain"
                      />
                      <div className="absolute bottom-4 right-4 bg-slate-900/90 backdrop-blur border border-slate-700 px-2.5 py-1 rounded text-[11px] font-mono text-slate-300">
                        512 × 512 × 3 • Model Input
                      </div>
                    </div>
                  ) : (
                    <FundusCanvas mode="colour" findings={selectedCase.result.findings} imageUrl={selectedCase.imageUrl} />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Specialist Decision Form */}
          <form
            onSubmit={handleSubmitDecision}
            className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <FileEdit className="w-4 h-4 text-emerald-400" />
                Specialist Diagnostic Verification & Sign-Off
              </h3>
            </div>

            {/* Decision Radio Options */}
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 p-2.5 bg-slate-950 border border-slate-800 rounded cursor-pointer hover:border-slate-700">
                <input
                  type="radio"
                  name="decision"
                  value="approved"
                  checked={decision === 'approved'}
                  onChange={() => setDecision('approved')}
                  className="accent-emerald-500"
                />
                <div>
                  <strong className="text-slate-200">Approve AI Diagnostic Assessment</strong>
                  <p className="text-xs text-slate-400">Confirm {selectedCase.result?.diagnosis}</p>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 bg-slate-950 border border-slate-800 rounded cursor-pointer hover:border-slate-700">
                <input
                  type="radio"
                  name="decision"
                  value="overruled"
                  checked={decision === 'overruled'}
                  onChange={() => setDecision('overruled')}
                  className="accent-emerald-500"
                />
                <div className="flex-1">
                  <strong className="text-slate-200">Overrule Grade / Modify Diagnosis</strong>
                  {decision === 'overruled' && (
                    <select
                      value={overruleGrade}
                      onChange={(e) => setOverruleGrade(e.target.value)}
                      className="mt-1.5 w-full bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs p-1.5 focus:outline-none font-mono"
                    >
                      <option value="No DR (Normal)">No DR (Normal)</option>
                      <option value="Mild NPDR">Mild NPDR</option>
                      <option value="Moderate NPDR">Moderate NPDR</option>
                      <option value="Severe NPDR">Severe NPDR</option>
                      <option value="Proliferative DR (PDR)">Proliferative DR (PDR)</option>
                    </select>
                  )}
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 bg-slate-950 border border-slate-800 rounded cursor-pointer hover:border-slate-700">
                <input
                  type="radio"
                  name="decision"
                  value="recapture_requested"
                  checked={decision === 'recapture_requested'}
                  onChange={() => setDecision('recapture_requested')}
                  className="accent-emerald-500"
                />
                <div>
                  <strong className="text-amber-300">Request Image Recapture</strong>
                  <p className="text-xs text-slate-400">Instruct ANM at PHC to re-take non-mydriatic photo</p>
                </div>
              </label>
            </div>

            {/* Specialist Clinical Notes */}
            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-400">Specialist Clinical Remarks / Instructions:</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitted}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-sans font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitted ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Decision Recorded & Transmitted to PHC Node</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-white" />
                  <span>Submit Specialist Decision</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
