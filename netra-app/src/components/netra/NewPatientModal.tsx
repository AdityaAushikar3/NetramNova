'use client';

import React, { useState } from 'react';
import { Patient } from './types';
import { X, UserPlus, CheckCircle2, UserCheck, Stethoscope } from 'lucide-react';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPatient: (patient: Patient) => void;
}

export const NewPatientModal: React.FC<NewPatientModalProps> = ({
  isOpen,
  onClose,
  onAddPatient,
}) => {
  const [name, setName] = useState<string>('');
  const [age, setAge] = useState<number | ''>(52);
  const [sex, setSex] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [diabetesHistory, setDiabetesHistory] = useState<string>('Type 2 DM (8 years) • HbA1c 8.2%');
  const [cameraDevice, setCameraDevice] = useState<string>('Remidio NM-FOP');
  const [phcLocation, setPhcLocation] = useState<string>('NetramNova Workstation');

  // Reset all form fields to defaults
  const resetForm = () => {
    setName('');
    setAge(52);
    setSex('Female');
    setDiabetesHistory('Type 2 DM (8 years) • HbA1c 8.2%');
    setCameraDevice('Remidio NM-FOP');
    setPhcLocation('NetramNova Workstation');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // UI-10 FIX: Math.floor(Math.random() * 9000) only has 9000 possibilities —
    // ~1% collision chance after 133 patients. Use timestamp + random suffix instead.
    const newId = `PT-${Date.now().toString(36).toUpperCase().slice(-4)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const newPatient: Patient = {
      id: newId,
      name: name.trim(),
      age: Number(age) || 50,
      sex,
      diabetesHistory,
      cameraDevice,
      lastScreeningDate: 'Today (New Screening)',
      phcLocation,
    };

    onAddPatient(newPatient);
    resetForm();
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none font-sans">
      <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-5 text-slate-200 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100 font-sans">Register New PHC Patient</h3>
              <p className="text-xs text-slate-400 font-mono">NetramNova Local Encrypted Edge Registry</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {/* Patient Full Name */}
          <div className="space-y-1">
            <label className="text-xs font-mono text-slate-400">Patient Full Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Sunita Devi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
            />
          </div>

          {/* Age & Sex Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-400">Age (Years) *</label>
              <input
                type="number"
                required
                min={10}
                max={110}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-400">Gender *</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value as 'Male' | 'Female' | 'Other')}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Diabetes History & HbA1c */}
          <div className="space-y-1">
            <label className="text-xs font-mono text-slate-400">Diabetes History & HbA1c</label>
            <input
              type="text"
              value={diabetesHistory}
              onChange={(e) => setDiabetesHistory(e.target.value)}
              placeholder="e.g. Type 2 DM (10 yrs) • HbA1c 8.5%"
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Camera Unit */}
          <div className="space-y-1">
            <label className="text-xs font-mono text-slate-400">Connected Fundus Camera Unit</label>
            <select
              value={cameraDevice}
              onChange={(e) => setCameraDevice(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="Remidio NM-FOP">Remidio NM-FOP (USB 3.0)</option>
              <option value="Forus 3nethra classic">Forus 3nethra classic</option>
              <option value="Zeiss Visucam 500">Zeiss Visucam 500</option>
              <option value="Topcon TRC-NW400">Topcon TRC-NW400</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs transition-all shadow flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Register & Select Patient</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
