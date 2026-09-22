'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { NavigationTab, ConnectivityState, ScreeningCase, Patient } from '../components/netra/types';
import { StatusBar } from '../components/netra/StatusBar';
import { Sidebar } from '../components/netra/Sidebar';
import { ScreeningPage } from '../components/netra/ScreeningPage';
import { DoctorReviewPage } from '../components/netra/DoctorReviewPage';
import { OfflineSyncPanel } from '../components/netra/OfflineSyncPanel';
import { AnalyticsPage } from '../components/netra/AnalyticsPage';
import { NewPatientModal } from '../components/netra/NewPatientModal';
import { Users, Search, UserPlus } from 'lucide-react';
import { getSession } from '../lib/auth';

export default function NetraConsoleApp() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('screening');
  const [connectivity, setConnectivity] = useState<ConnectivityState>('local');
  const [cases, setCases] = useState<ScreeningCase[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [activePatientId, setActivePatientId] = useState<string>('');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);
  const [dbLoaded, setDbLoaded] = useState(false);
  // BUG 2 FIX: isDoctor must be React state, not a plain variable computed at render time.
  // Plain var would be stale on SSR (window undefined) and wouldn't re-render if session changed.
  const [isDoctor, setIsDoctor] = useState<boolean>(false);

  // Guard: health workers cannot access review tab
  const handleSelectTab = (tab: NavigationTab) => {
    if (tab === 'review' && !isDoctor) return;
    setActiveTab(tab);
  };

  // ── Hydrate from persistent DB on mount ────────────────────────────────────
  useEffect(() => {
    // BUG 2 FIX: Read session client-side after mount (localStorage unavailable on SSR)
    const session = getSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDoctor(session?.role === 'doctor');

    async function hydrate() {
      try {
        const [casesRes, patientsRes] = await Promise.all([
          fetch('/api/cases'),
          fetch('/api/patients'),
        ]);

        const casesData: ScreeningCase[] = casesRes.ok ? await casesRes.json() : [];
        let patientsData: Patient[] = patientsRes.ok ? await patientsRes.json() : [];



        setCases(casesData);
        setPatients(patientsData);
        if (patientsData.length > 0) setActivePatientId(patientsData[0].id);
      } catch (err) {
        console.error('[NetramNova] Failed to hydrate from DB:', err);
      } finally {
        setDbLoaded(true);
      }
    }
    hydrate();
  }, []);

  // ── Derived counts ─────────────────────────────────────────────────────────
  // BUG 7 FIX: Only count cases that are actually 'completed' and pending doctor review.
  // Without the status check, mock-initialized cases (status='new') with no doctorReviewStatus
  // would all be counted, causing a misleading badge on first mount.
  const pendingReviewCount = cases.filter(
    (c) => c.status === 'completed' && (c.doctorReviewStatus === 'pending' || !c.doctorReviewStatus)
  ).length;

  const pendingSyncCount = cases.filter((c) => !c.synced).length;

  // ── Connectivity toggle ────────────────────────────────────────────────────
  const handleToggleConnectivity = () => {
    if (connectivity === 'local') {
      setConnectivity('syncing');
      setTimeout(() => setConnectivity('online'), 1500);
    } else if (connectivity === 'online') {
      setConnectivity('local');
    } else {
      setConnectivity('online');
    }
  };

  // ── New case: persist to DB + update state ─────────────────────────────────
  const handleNewCaseCompleted = useCallback(async (newCase: ScreeningCase) => {
    setCases((prev) => [newCase, ...prev]);
    try {
      await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCase),
      });
    } catch (err) {
      console.error('[NetramNova] Failed to persist case to DB:', err);
    }
  }, []);

  // ── Add patient: persist to DB + update state ──────────────────────────────
  const handleAddPatient = useCallback(async (newPatient: Patient) => {
    setPatients((prev) => [newPatient, ...prev]);
    try {
      await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPatient),
      });
    } catch (err) {
      console.error('[NetramNova] Failed to persist patient to DB:', err);
    }
  }, []);

  // ── Doctor review: persist status patch to DB ──────────────────────────────
  const handleUpdateDoctorStatus = useCallback(
    async (
      caseId: string,
      doctorStatus: 'approved' | 'overruled' | 'recapture_requested',
      notes: string
    ) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId ? { ...c, doctorReviewStatus: doctorStatus, doctorNotes: notes } : c
        )
      );
      try {
        await fetch(`/api/cases/${caseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doctorReviewStatus: doctorStatus, doctorNotes: notes }),
        });
      } catch (err) {
        console.error('[NetramNova] Failed to persist doctor review to DB:', err);
      }
    },
    []
  );

  // ── Sync all: mark all cases as synced in DB ───────────────────────────────
  const handleSyncCases = useCallback(async () => {
    setCases((prev) => prev.map((c) => ({ ...c, synced: true })));
    const unsynced = cases.filter((c) => !c.synced);
    await Promise.allSettled(
      unsynced.map((c) =>
        fetch(`/api/cases/${c.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ synced: true }),
        })
      )
    );
  }, [cases]);

  // ── Loading guard ──────────────────────────────────────────────────────────
  if (!dbLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
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
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          pendingReviewCount={pendingReviewCount}
        />

        {/* Primary Viewport Area */}
        <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
          {/* Re-added Top Status Bar */}
          <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">Clinic:</span>
              <span className="text-slate-600">NetramNova Workstation</span>
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
          {activeTab === 'screening' && (
            <ScreeningPage
              initialPatientId={activePatientId}
              onCaseCompleted={handleNewCaseCompleted}
              onPatientAdded={handleAddPatient}
              patients={patients}
            />
          )}

          {activeTab === 'review' && (
            <DoctorReviewPage
              cases={cases}
              onUpdateCaseStatus={handleUpdateDoctorStatus}
            />
          )}

          {activeTab === 'analytics' && <AnalyticsPage cases={cases} />}

          {activeTab === 'settings' && (
            <OfflineSyncPanel
              connectivity={connectivity}
              onTriggerSync={() => setConnectivity('online')}
              cases={cases}
              onSyncCases={handleSyncCases}
            />
          )}

          {activeTab === 'patients' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-slate-800 font-display">
                      Patients
                    </h2>
                  </div>
                  <p className="text-sm text-slate-500 font-sans mt-0.5">
                    Search and manage patient records
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-sans font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add Patient</span>
                  </button>

                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by Patient ID / Name..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-sans shadow-sm transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Patients Table */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 font-sans text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="p-3">Patient ID</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Age / Sex</th>
                      <th className="p-3">Diabetes History</th>
                      <th className="p-3">Camera Unit</th>
                      <th className="p-3">Last Screening</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 bg-white">
                    {patients
                      .filter(
                        (p) =>
                          p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
                          p.id.toLowerCase().includes(patientSearch.toLowerCase())
                      )
                      .map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-sans font-semibold text-slate-900">{p.id}</td>
                          <td className="p-3 font-sans font-medium text-slate-700">{p.name}</td>
                          <td className="p-3 font-sans">
                            {p.age}Y / {p.sex}
                          </td>
                          <td className="p-3 font-sans text-slate-500">{p.diabetesHistory}</td>
                          <td className="p-3 font-sans">{p.cameraDevice}</td>
                          <td className="p-3 font-sans">{p.lastScreeningDate}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                setActivePatientId(p.id);
                                setActiveTab('screening');
                              }}
                              className="text-blue-600 hover:text-blue-700 font-sans text-sm font-medium transition-colors cursor-pointer"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
      </div>

      {/* New Patient Registration Modal */}
      <NewPatientModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onAddPatient={handleAddPatient}
      />
    </div>
  );
}
