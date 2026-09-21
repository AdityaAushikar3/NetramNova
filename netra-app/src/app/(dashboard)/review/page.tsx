'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DoctorReviewPage } from '../../../components/netra/DoctorReviewPage';
import { useNetraContext } from '../../../lib/NetraContext';

export default function ReviewRoute() {
  const { cases, handleUpdateDoctorStatus, isDoctor } = useNetraContext();
  const router = useRouter();

  useEffect(() => {
    if (!isDoctor) {
      router.replace('/screening');
    }
  }, [isDoctor, router]);

  if (!isDoctor) return null;

  return (
    <DoctorReviewPage
      cases={cases}
      onUpdateCaseStatus={handleUpdateDoctorStatus}
    />
  );
}
