'use client';

import React, { useState, useEffect } from 'react';
import { ConnectivityState, LanguageCode } from './types';
import { Wifi, WifiOff, RefreshCw, Cpu, UserCheck, Globe, Server } from 'lucide-react';

interface StatusBarProps {
  connectivity: ConnectivityState;
  onToggleConnectivity: () => void;
  pendingSyncCount: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  connectivity,
  onToggleConnectivity,
  pendingSyncCount,
}) => {
  const [lang, setLang] = useState<LanguageCode>('en');
  const [mlRunning, setMlRunning] = useState<boolean | null>(null);
  const [operatorName, setOperatorName] = useState<string>('Operator');
  const [operatorRole, setOperatorRole] = useState<string>('Health Worker');

  useEffect(() => {
    // Read session from localStorage
    try {
      const raw = localStorage.getItem('netramnova_session');
      if (raw) {
        const session = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (session.name) setOperatorName(session.name);
         
        if (session.role) setOperatorRole(session.role === 'doctor' ? 'Doctor' : 'Health Worker');
      }
    } catch {}

    // Poll ML service status
    async function checkMl() {
      try {
        const res = await fetch('/api/ml-status');
        const data = await res.json();
        setMlRunning(data.running);
      } catch {
        setMlRunning(false);
      }
    }
    checkMl();
    const interval = setInterval(checkMl, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="w-full bg-slate-900 text-slate-100 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-md select-none">
      {/* Left Branding & Station Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
          <div className="w-7 h-7 rounded bg-emerald-600 flex items-center justify-center font-extrabold text-white text-xs tracking-wider shadow-inner">
            N
          </div>
          <div>
            <div className="font-bold text-slate-100 tracking-wide text-xs flex items-center gap-1.5 font-display">
              NETRAMNOVA <span className="text-xs font-mono font-medium px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded border border-slate-700">v2.4-CLINICAL</span>
            </div>
            <div className="text-xs text-slate-400 font-mono">Retinal Screening Workstation</div>
          </div>
        </div>

        {/* PHC Location & Device Connection */}
        <div className="hidden md:flex items-center gap-4 text-slate-300 font-mono text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            PHC: <strong className="text-slate-100 font-sans font-semibold">NetramNova Workstation</strong>
          </span>
          <span className="text-slate-600">•</span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            Device: <strong className="text-slate-100 font-sans font-semibold">Remidio NM-FOP (USB 3.0)</strong>
          </span>
        </div>
      </div>

      {/* Right Controls: Connectivity Badge, Multi-lingual Switcher & Operator Session */}
      <div className="flex items-center gap-3 font-mono">
        {/* Multi-lingual Language Selector */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-xs">
          <Globe className="w-3 h-3 text-emerald-400 ml-1" />
          <button
            onClick={() => setLang('en')}
            className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              lang === 'en' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLang('te')}
            className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              lang === 'te' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            తెలుగు
          </button>
          <button
            onClick={() => setLang('hi')}
            className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              lang === 'hi' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            हिंदी
          </button>
        </div>

        {/* ML Service Status Badge */}
        <div
          title={mlRunning ? 'Flask ML service is running on port 5000 (fast mode)' : 'Flask not running — using Python CLI fallback (~10s)'}
          className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono font-semibold ${
            mlRunning === true
              ? 'bg-emerald-950/70 border-emerald-700/50 text-emerald-300'
              : mlRunning === false
              ? 'bg-amber-950/70 border-amber-700/50 text-amber-300'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          <Server className="w-3 h-3" />
          <span>
            {mlRunning === true ? 'ML:FAST' : mlRunning === false ? 'ML:CLI' : 'ML:...'}
          </span>
        </div>

        {/* Connectivity Toggle Badge */}
        <button
          onClick={onToggleConnectivity}
          title="Click to toggle Network Sync state"
          className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
            connectivity === 'online'
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
              : connectivity === 'syncing'
              ? 'bg-amber-950/70 border-amber-500/40 text-amber-300 hover:bg-amber-900/60'
              : 'bg-rose-950/70 border-rose-500/40 text-rose-300 hover:bg-rose-900/60'
          }`}
        >
          {connectivity === 'online' && (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>CLOUD SYNC ONLINE</span>
            </>
          )}
          {connectivity === 'syncing' && (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span>SYNCING ({pendingSyncCount} QUEUED)</span>
            </>
          )}
          {connectivity === 'local' && (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              <span>LOCAL MODE ({pendingSyncCount} PENDING SYNC)</span>
            </>
          )}
        </button>

        {/* Operator Profile */}
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 text-xs">
          <UserCheck className="w-3.5 h-3.5 text-teal-400" />
          <span className="font-sans font-medium text-slate-200">{operatorName}</span>
          <span className="text-slate-500 font-mono text-xs">• {operatorRole}</span>
        </div>
      </div>
    </header>
  );
};
