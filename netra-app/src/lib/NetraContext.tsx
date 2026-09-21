'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ScreeningCase, Patient, ConnectivityState } from '../components/netra/types';
import { MOCK_PATIENTS } from '../components/netra/mockData';
import { getSession } from './auth';

interface NetraContextType {
  cases: ScreeningCase[];
  patients: Patient[];
  connectivity: ConnectivityState;
  isDoctor: boolean;
  dbLoaded: boolean;
  activePatientId: string;
  setActivePatientId: (id: string) => void;
  handleNewCaseCompleted: (newCase: ScreeningCase) => void;
  handleAddPatient: (newPatient: Patient) => void;
  handleUpdateDoctorStatus: (caseId: string, status: 'approved' | 'overruled' | 'recapture_requested', notes: string) => void;
  handleSyncCases: () => void;
  handleToggleConnectivity: () => void;
  pendingReviewCount: number;
  pendingSyncCount: number;
}

const NetraContext = createContext<NetraContextType | undefined>(undefined);

export const NetraContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [cases, setCases] = useState<ScreeningCase[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [connectivity, setConnectivity] = useState<ConnectivityState>('local');
  const [activePatientId, setActivePatientId] = useState<string>(MOCK_PATIENTS[0].id);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [isDoctor, setIsDoctor] = useState<boolean>(false);

  // ── Hydrate from persistent DB on mount ────────────────────────────────────
  useEffect(() => {
    const session = getSession();
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

  // ── Handlers ───────────────────────────────────────────────────────────────
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

  // ── Derived counts ─────────────────────────────────────────────────────────
  const pendingReviewCount = cases.filter(
    (c) => c.status === 'completed' && (c.doctorReviewStatus === 'pending' || !c.doctorReviewStatus)
  ).length;

  const pendingSyncCount = cases.filter((c) => !c.synced).length;

  return (
    <NetraContext.Provider
      value={{
        cases,
        patients,
        connectivity,
        isDoctor,
        dbLoaded,
        activePatientId,
        setActivePatientId,
        handleNewCaseCompleted,
        handleAddPatient,
        handleUpdateDoctorStatus,
        handleSyncCases,
        handleToggleConnectivity,
        pendingReviewCount,
        pendingSyncCount,
      }}
    >
      {children}
    </NetraContext.Provider>
  );
};

export const useNetraContext = () => {
  const context = useContext(NetraContext);
  if (context === undefined) {
    throw new Error('useNetraContext must be used within a NetraContextProvider');
  }
  return context;
};
