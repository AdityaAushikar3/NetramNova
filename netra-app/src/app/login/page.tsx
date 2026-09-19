'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { login, UserRole } from '../../lib/auth';
import { Eye, EyeOff, ShieldCheck, Stethoscope, Activity, Lock, User } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('health_worker');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Small artificial delay for UX
    await new Promise((r) => setTimeout(r, 600));

    const session = login({ name, pin, role });
    if (!session) {
      setError('Invalid PIN. Please try again.');
      setLoading(false);
      return;
    }

    router.replace('/');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans antialiased">
      {/* Background grid pattern */}
      <div
        className="fixed inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.4) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 shadow-2xl shadow-emerald-900/50 mb-4">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight">NETRAMNOVA</h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Retinal Screening Workstation • Telangana East PHC #04
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="text-center">
            <h2 className="text-sm font-bold text-slate-200">Clinical Access Login</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Select your role and enter your access PIN
            </p>
          </div>

          {/* Role Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => { setRole('health_worker'); setError(''); }}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                role === 'health_worker'
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Stethoscope className="w-4 h-4" />
              <span>Health Worker</span>
            </button>
            <button
              type="button"
              onClick={() => { setRole('doctor'); setError(''); }}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                role === 'doctor'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Doctor / Specialist</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name field */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Your Name
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder={role === 'doctor' ? 'Dr. Name' : 'ANM / Staff Name'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors font-mono"
                />
              </div>
            </div>

            {/* PIN field */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Access PIN
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                <input
                  type={showPin ? 'text' : 'password'}
                  placeholder="Enter your PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors font-mono tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="px-3 py-2 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 font-mono">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg text-sm font-bold text-white transition-all cursor-pointer ${
                role === 'doctor'
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/30'
              } disabled:opacity-60`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Authenticating…
                </span>
              ) : (
                `Login as ${role === 'doctor' ? 'Doctor' : 'Health Worker'}`
              )}
            </button>
          </form>

          {/* Hint */}
          <div className="border-t border-slate-800 pt-4 text-center text-xs text-slate-600 font-mono space-y-0.5">
            <p>Health Worker PIN: <span className="text-slate-500">1234</span></p>
            <p>Doctor PIN: <span className="text-slate-500">doctor2024</span></p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-700 font-mono mt-4">
          NetramNova v2.4-CLINICAL • Offline-First • No Cloud Required
        </p>
      </div>
    </div>
  );
}
