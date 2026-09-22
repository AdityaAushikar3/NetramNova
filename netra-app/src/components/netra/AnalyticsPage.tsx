'use client';

import React, { useMemo } from 'react';
import {
  BarChart3,
  Users,
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  PieChart,
  Calendar,
} from 'lucide-react';
import type { ScreeningCase } from './types';

interface AnalyticsPageProps {
  cases: ScreeningCase[];
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ cases }) => {
  const stats = useMemo(() => {
    const total = cases.length;
    if (total === 0) return null;
    
    // Count severity levels based on ICDR grading
    // 0 = Normal, 1 = Mild, 2 = Moderate, 3 = Severe, 4 = Proliferative
    let noDr = 0;
    let mild = 0;
    let moderate = 0;
    let severePdr = 0;
    
    let referrals = 0;
    let recaptures = 0;
    
    cases.forEach((c) => {
      const level = c.result?.icdrLevel;
      if (level === 0) noDr++;
      else if (level === 1) mild++;
      else if (level === 2) moderate++;
      else if (level === 3 || level === 4) severePdr++;
      
      // Specialist referral logic (Severe or PDR)
      if (level === 3 || level === 4 || c.result?.triageTier === 'Tier 3 (Specialist Escalation)') {
        referrals++;
      }
      
      // Recapture rate logic
      if (c.doctorReviewStatus === 'recapture_requested' || c.qualityStatus === 'rejected') {
        recaptures++;
      }
    });

    return {
      total,
      referrals,
      recaptures,
      recaptureRate: ((recaptures / total) * 100).toFixed(1),
      noDr,
      noDrPct: ((noDr / total) * 100).toFixed(1),
      mild,
      mildPct: ((mild / total) * 100).toFixed(1),
      moderate,
      moderatePct: ((moderate / total) * 100).toFixed(1),
      severePdr,
      severePdrPct: ((severePdr / total) * 100).toFixed(1),
    };
  }, [cases]);

  return (
    <div className="w-full space-y-4 font-sans select-none">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100 font-display">
              PHC Retinal Health & Tele-Triage Analytics
            </h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            NetramNova Workstation • Monthly Epidemiological Metrics
          </p>
        </div>

        <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-300">
          Period: <strong className="text-emerald-400">Current DB Snapshot</strong>
        </div>
      </div>

      {!stats ? (
        <div className="p-8 text-center text-slate-400 font-mono text-sm border border-slate-800 rounded-lg bg-slate-900">
          No screening data available to generate analytics. Please add cases.
        </div>
      ) : (
        <>
          {/* Top 4 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Total Screenings</div>
              <div className="text-2xl font-bold text-slate-100 font-display">{stats.total}</div>
              <div className="text-xs text-emerald-400 font-sans">Active Cases</div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Specialist Referrals</div>
              <div className="text-2xl font-bold text-amber-400 font-display">{stats.referrals}</div>
              <div className="text-xs text-slate-400 font-sans">
                {((stats.referrals / stats.total) * 100).toFixed(1)}% referral yield
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Recapture Rate</div>
              <div className="text-2xl font-bold text-emerald-400 font-display">{stats.recaptureRate}%</div>
              <div className="text-xs text-slate-400 font-sans">({stats.recaptures} rejected images)</div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Avg Triage Speed</div>
              <div className="text-2xl font-bold text-sky-400 font-display">~ 1.8s</div>
              <div className="text-xs text-slate-400 font-sans">Estimated inference time</div>
            </div>
          </div>

          {/* DR Severity Distribution Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-1 gap-4">
            {/* Severity Breakdown */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-emerald-400" />
                Diabetic Retinopathy ICDR Grading Distribution
              </h3>

              <div className="space-y-3 pt-1 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-300">No DR (Normal) - ICDR 0</span>
                    <span className="font-bold text-emerald-400">{stats.noDrPct}% ({stats.noDr} cases)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.noDrPct}%` }}></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-300">Mild NPDR - ICDR 1</span>
                    <span className="font-bold text-blue-400">{stats.mildPct}% ({stats.mild} cases)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${stats.mildPct}%` }}></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-300">Moderate NPDR - ICDR 2</span>
                    <span className="font-bold text-amber-400">{stats.moderatePct}% ({stats.moderate} cases)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${stats.moderatePct}%` }}></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-300">Severe NPDR & PDR - ICDR 3/4</span>
                    <span className="font-bold text-rose-400">{stats.severePdrPct}% ({stats.severePdr} cases)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${stats.severePdrPct}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
