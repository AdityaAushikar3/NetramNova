'use client';

import React from 'react';
import { Users, AlertCircle } from 'lucide-react';

export default function PatientsRoute() {
  return (
    <div className="w-full h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-500">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
        <Users className="w-8 h-8 text-slate-400" />
      </div>
      <h2 className="text-xl font-bold text-slate-700 font-display">Patient Records</h2>
      <p className="text-sm">Detailed patient management is under construction.</p>
    </div>
  );
}
