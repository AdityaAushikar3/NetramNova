'use client';

import React from 'react';
import { Settings } from 'lucide-react';

export default function SettingsRoute() {
  return (
    <div className="w-full h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-500">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
        <Settings className="w-8 h-8 text-slate-400" />
      </div>
      <h2 className="text-xl font-bold text-slate-700 font-display">System Settings</h2>
      <p className="text-sm">Configuration panel is under construction.</p>
    </div>
  );
}
