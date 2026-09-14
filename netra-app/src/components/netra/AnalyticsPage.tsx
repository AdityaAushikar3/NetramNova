'use client';

import React from 'react';
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

export const AnalyticsPage: React.FC = () => {
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
            Node #04 Telangana East • Monthly Epidemiological Metrics
          </p>
        </div>

        <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-300">
          Period: <strong className="text-emerald-400">September 2026</strong>
        </div>
      </div>

      {/* Top 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
          <div className="text-xs text-slate-400 uppercase tracking-wider">Total Screenings Today</div>
          <div className="text-2xl font-bold text-slate-100 font-display">42</div>
          <div className="text-xs text-emerald-400 font-sans">+14% vs yesterday</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
          <div className="text-xs text-slate-400 uppercase tracking-wider">Specialist Referrals</div>
          <div className="text-2xl font-bold text-amber-400 font-display">8</div>
          <div className="text-xs text-slate-400 font-sans">19% referral yield</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
          <div className="text-xs text-slate-400 uppercase tracking-wider">Recapture Rate</div>
          <div className="text-2xl font-bold text-emerald-400 font-display">2.4%</div>
          <div className="text-xs text-slate-400 font-sans">Below target threshold (&lt;5%)</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
          <div className="text-xs text-slate-400 uppercase tracking-wider">Avg Triage Speed</div>
          <div className="text-2xl font-bold text-sky-400 font-display">1.8s</div>
          <div className="text-xs text-slate-400 font-sans">Edge preprocessing + inference</div>
        </div>
      </div>

      {/* DR Severity Distribution Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <span className="font-bold text-emerald-400">65% (182 patients)</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '65%' }}></div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between font-mono">
                <span className="text-slate-300">Mild NPDR - ICDR 1</span>
                <span className="font-bold text-blue-400">16% (45 patients)</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '16%' }}></div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between font-mono">
                <span className="text-slate-300">Moderate NPDR - ICDR 2</span>
                <span className="font-bold text-amber-400">12% (34 patients)</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: '12%' }}></div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between font-mono">
                <span className="text-slate-300">Severe NPDR & PDR - ICDR 3/4</span>
                <span className="font-bold text-rose-400">7% (19 patients)</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: '7%' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Device Performance Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Retinal Camera Compatibility & Device Metrics
          </h3>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-2.5 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300 font-sans">Remidio NM-FOP</span>
              <span className="text-emerald-400 font-bold">142 Screenings (98.2% Pass Rate)</span>
            </div>
            <div className="p-2.5 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300 font-sans">Forus 3nethra classic</span>
              <span className="text-emerald-400 font-bold">86 Screenings (96.5% Pass Rate)</span>
            </div>
            <div className="p-2.5 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300 font-sans">Zeiss Visucam 500</span>
              <span className="text-emerald-400 font-bold">52 Screenings (99.1% Pass Rate)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
