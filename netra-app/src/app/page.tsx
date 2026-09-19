'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { NavigationTab, ConnectivityState, ScreeningCase, Patient } from '../components/netra/types';
import { MOCK_PATIENTS } from '../components/netra/mockData';
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
  const [activePatientId, setActivePatientId] = useState<string>(MOCK_PATIENTS[0].id);
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

        // If DB is empty (first run), seed with mock patients
        if (patientsData.length === 0) {
          await Promise.all(
            MOCK_PATIENTS.map((p) =>
              fetch('/api/patients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p),
              })
            )
          );
          patientsData = MOCK_PATIENTS;
        }

        setCases(casesData);
        setPatients(patientsData);
        if (patientsData.length > 0) setActivePatientId(patientsData[0].id);
      } catch (err) {
        console.error('[NetramNova] Failed to hydrate from DB, using mock patients:', err);
        setPatients(MOCK_PATIENTS);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* 1. Top Clinical Status Header */}
      <StatusBar
        connectivity={connectivity}
        onToggleConnectivity={handleToggleConnectivity}
        pendingSyncCount={pendingSyncCount}
      />

      {/* 2. Main Workstation Body (Sidebar + Content Viewport) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Rail */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          pendingReviewCount={pendingReviewCount}
        />

        {/* Primary Viewport Area */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto bg-slate-950">
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

          {activeTab === 'analytics' && <AnalyticsPage />}

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
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-base font-bold text-slate-100 font-display">
                      PHC Patient Directory &amp; Retinal Screening History
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Telangana East #04 Node Register • {patients.length} Registered Patients
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Register New Patient</span>
                  </button>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search Patient Name or ID..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Patients Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 border-b border-slate-800 font-mono text-xs uppercase text-slate-400">
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
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {patients
                      .filter(
                        (p) =>
                          p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
                          p.id.toLowerCase().includes(patientSearch.toLowerCase())
                      )
                      .map((p) => (
                        <tr key={p.id} className="hover:bg-slate-800/50">
                          <td className="p-3 font-mono font-bold text-emerald-400">{p.id}</td>
                          <td className="p-3 font-bold text-slate-100">{p.name}</td>
                          <td className="p-3 font-mono">
                            {p.age}Y / {p.sex}
                          </td>
                          <td className="p-3 font-mono text-slate-400">{p.diabetesHistory}</td>
                          <td className="p-3 font-mono">{p.cameraDevice}</td>
                          <td className="p-3 font-mono">{p.lastScreeningDate}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                setActivePatientId(p.id);
                                setActiveTab('screening');
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-mono text-xs font-bold transition-colors cursor-pointer"
                            >
                              New Scan
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

      {/* New Patient Registration Modal */}
      <NewPatientModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onAddPatient={handleAddPatient}
      />
    </div>
  );
}
