'use client';

import React, { useState } from 'react';
import { ShieldCheck, BookOpen, Clock, AlertTriangle, Globe, FileText, CheckCircle2 } from 'lucide-react';

interface ClinicalGuidanceProps {
  guidance?: {
    icd10Code: string;
    referralTimeline: string;
    guidelineSource: string;
    doctorTechnicalNote: string;
    patientSummaryEn: string;
    patientSummaryHi: string;
    safetyAuditPassed: boolean;
  };
  severity: string;
  csmeDetected?: boolean;
}

export const ClinicalGuidanceCard: React.FC<ClinicalGuidanceProps> = ({
  guidance,
  severity,
  csmeDetected = false
}) => {
  const [activeView, setActiveView] = useState<'doctor' | 'patient'>('doctor');
  const [patientLang, setPatientLang] = useState<'en' | 'hi'>('en');

  if (!guidance) {
    return null;
  }

  const isUrgent = severity === 'severe' || severity === 'proliferative' || csmeDetected;

  return (
    <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl overflow-hidden shadow-xl mt-4">
      {/* Header with Badges */}
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-100">Grounded Clinical Guidance</span>
          <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/50 font-mono">
            {guidance.icd10Code}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-700/40">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>AAO PPP 2023 Verified</span>
          </div>

          {guidance.safetyAuditPassed && (
            <div className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-700/40">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Safety Audit Passed</span>
            </div>
          )}
        </div>
      </div>

      {/* Referral Action Banner */}
      <div className={`px-4 py-2.5 flex items-center gap-3 text-xs border-b ${
        isUrgent 
          ? 'bg-rose-950/40 border-rose-800/50 text-rose-200' 
          : 'bg-amber-950/30 border-amber-800/40 text-amber-200'
      }`}>
        <Clock className={`w-4 h-4 shrink-0 ${isUrgent ? 'text-rose-400' : 'text-amber-400'}`} />
        <div className="flex-1">
          <span className="font-semibold uppercase tracking-wide">Mandatory Clinical Protocol: </span>
          <span>{guidance.referralTimeline}</span>
        </div>
      </div>

      {/* View Toggle Tabs */}
      <div className="px-4 pt-3 flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveView('doctor')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeView === 'doctor'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Physician Summary
          </button>
          <button
            onClick={() => setActiveView('patient')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeView === 'patient'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Patient Communication Card
          </button>
        </div>

        {activeView === 'patient' && (
          <div className="flex gap-1 text-[11px]">
            <button
              onClick={() => setPatientLang('en')}
              className={`px-2 py-0.5 rounded ${patientLang === 'en' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
            >
              English
            </button>
            <button
              onClick={() => setPatientLang('hi')}
              className={`px-2 py-0.5 rounded ${patientLang === 'hi' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
            >
              हिंदी (Hindi)
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="p-4 text-xs leading-relaxed">
        {activeView === 'doctor' ? (
          <div className="space-y-2">
            <div className="text-slate-300 whitespace-pre-line font-mono text-[11px] bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              {guidance.doctorTechnicalNote}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
              <span className="font-semibold text-slate-300">Grounded Citation:</span>
              <span>{guidance.guidelineSource}</span>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-slate-950/60 rounded-lg border border-slate-800/80">
            <p className="text-slate-200 text-sm leading-relaxed">
              {patientLang === 'en' ? guidance.patientSummaryEn : guidance.patientSummaryHi}
            </p>
            <div className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Target: HbA1c &lt; 7.0% • BP &lt; 130/80 mmHg</span>
              <span className="text-cyan-400 font-medium">Free Tele-Consultation at PHC</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
