'use client';

import React, { useState } from 'react';
import { ConnectivityState, ScreeningCase } from './types';
import { MOCK_CASES } from './mockData';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  CheckCircle2,
  Lock,
  CloudUpload,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';

interface OfflineSyncPanelProps {
  connectivity: ConnectivityState;
  onTriggerSync: () => void;
  cases?: ScreeningCase[];
  onSyncCases?: () => void;
}

export const OfflineSyncPanel: React.FC<OfflineSyncPanelProps> = ({
  connectivity,
  onTriggerSync,
  cases: propCases,
  onSyncCases,
}) => {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const syncTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const cases = propCases || MOCK_CASES;

  const pendingCases = cases.filter((c) => !c.synced);

  React.useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
  }, []);

  const handleManualSync = () => {
    setIsSyncing(true);
    setSyncProgress(0);

    let progress = 0;
    if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    syncTimerRef.current = setInterval(() => {
      progress += 25;
      setSyncProgress(progress);
      if (progress >= 100) {
        if (syncTimerRef.current) clearInterval(syncTimerRef.current);
        setIsSyncing(false);
        if (onSyncCases) {
          onSyncCases();
        }
        onTriggerSync();
      }
    }, 400);
  };

  return (
    <div className="w-full space-y-4 font-sans select-none">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded border border-slate-700">
            <HardDrive className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 font-display">
              Rural PHC Offline Storage & Cloud Synchronization Hub
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Local Encrypted Edge SQLite Database • Store-and-Forward Protocol
            </p>
          </div>
        </div>

        {/* Sync Trigger Button */}
        <button
          onClick={handleManualSync}
          disabled={isSyncing || pendingCases.length === 0}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-sans font-bold text-xs flex items-center gap-2 transition-all shadow cursor-pointer"
        >
          {isSyncing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              <span>Transmitting Encrypted Records ({syncProgress}%)...</span>
            </>
          ) : (
            <>
              <CloudUpload className="w-4 h-4 text-white" />
              <span>Sync {pendingCases.length} Pending Records to Hospital Cloud</span>
            </>
          )}
        </button>
      </div>

      {/* Sync Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Status Card 1 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
            Current Network State
          </div>
          <div className="flex items-center gap-2 text-sm font-bold font-mono">
            {connectivity === 'online' ? (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <Wifi className="w-4 h-4" /> ONLINE SYNC ACTIVE
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1.5">
                <WifiOff className="w-4 h-4" /> RURAL LOCAL MODE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Full AI inference runs locally on workstation hardware even with zero internet.
          </p>
        </div>

        {/* Status Card 2 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
            Pending Cloud Sync Queue
          </div>
          <div className="text-sm font-bold font-mono text-amber-300">
            {pendingCases.length} Retinal Cases Stored Locally
          </div>
          <p className="text-xs text-slate-400">
            Auto-syncs when 4G/Cellular telemetry connection restores.
          </p>
        </div>

        {/* Status Card 3 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
            Edge Security Protocol
          </div>
          <div className="text-sm font-bold font-mono text-slate-100 flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-emerald-400" /> AES-256 ENCRYPTED
          </div>
          <p className="text-xs text-slate-400">
            Compliant with ICMR & Telemedicine Guidelines for PHCs.
          </p>
        </div>
      </div>

      {/* Pending Sync Queue List */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-4 h-4 text-emerald-400" />
            Edge Storage Audit Trail & Pending Queue
          </h3>
          <span className="text-xs font-mono text-slate-400">
            {cases.length} Total Local Records
          </span>
        </div>

        <div className="space-y-2">
          {cases.map((c) => (
            <div
              key={c.id}
              className="p-3 bg-slate-950 border border-slate-800 rounded flex items-center justify-between gap-3 text-xs font-mono"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <span>{c.id}</span>
                  <span className="font-sans text-slate-300 font-medium">• {c.patient.name}</span>
                </div>
                <div className="text-xs text-slate-400">
                  Diagnosis: {c.result?.diagnosis}
                </div>
              </div>

              <div>
                {c.synced ? (
                  <span className="px-2 py-0.5 rounded text-xs bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> CLOUD SYNCED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-xs bg-amber-950 border border-amber-800 text-amber-300 font-bold">
                    PENDING RURAL SYNC
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
