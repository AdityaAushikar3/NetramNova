'use client';

import React from 'react';
import { Sidebar } from '../../components/netra/Sidebar';
import { NetraContextProvider, useNetraContext } from '../../lib/NetraContext';

// We create an internal layout component to use the context hooks
const DashboardLayoutContent = ({ children }: { children: React.ReactNode }) => {
  const { pendingReviewCount, pendingSyncCount, connectivity, handleToggleConnectivity, dbLoaded } = useNetraContext();

  if (!dbLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-mono">Initializing NetramNova…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans select-none antialiased">
      {/* Main Workstation Body (Sidebar + Content Viewport) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Rail */}
        <Sidebar pendingReviewCount={pendingReviewCount} />

        {/* Primary Viewport Area */}
        <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
          {/* Top Status Bar */}
          <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">Clinic:</span>
              <span className="text-slate-600">Telangana East #04</span>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">Unsynced Cases:</span>
                <span className="font-bold text-slate-700">{pendingSyncCount}</span>
              </div>
              <button 
                onClick={handleToggleConnectivity}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors ${
                  connectivity === 'online' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                  connectivity === 'syncing' ? 'bg-orange-100 text-orange-700' :
                  'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${
                  connectivity === 'online' ? 'bg-green-500' : 
                  connectivity === 'syncing' ? 'bg-orange-500 animate-pulse' : 
                  'bg-slate-400'
                }`} />
                {connectivity === 'online' ? 'Online' : connectivity === 'syncing' ? 'Syncing...' : 'Local Only'}
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NetraContextProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </NetraContextProvider>
  );
}
