'use client';

import React from 'react';
import { ScreeningPage } from '../../../components/netra/ScreeningPage';
import { useNetraContext } from '../../../lib/NetraContext';
import { NewPatientModal } from '../../../components/netra/NewPatientModal';

export default function ScreeningRoute() {
  const { 
    activePatientId, 
    handleNewCaseCompleted, 
    handleAddPatient, 
    patients 
  } = useNetraContext();

  const [isRegisterModalOpen, setIsRegisterModalOpen] = React.useState(false);

  return (
    <>
      <ScreeningPage
        initialPatientId={activePatientId}
        onCaseCompleted={handleNewCaseCompleted}
        onPatientAdded={handleAddPatient}
        patients={patients}
      />
      <NewPatientModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onAddPatient={handleAddPatient}
      />
    </>
  );
}
