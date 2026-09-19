'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSession } from '../lib/auth';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Wraps the app and redirects unauthenticated users to /login.
 * Uses localStorage session — works fully offline.
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const session = getSession();

    if (pathname === '/login') {
      // If already authenticated, bounce them to the main app
      if (session) {
        router.replace('/');
      } else {
        // Not authenticated — login page should show freely, no spinner needed
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChecked(true);
      }
      return;
    }

    // Protected route
    if (!session) {
      router.replace('/login');
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChecked(true);
    }
  }, [pathname, router]);

  // Show blank screen while checking session (avoids flash of protected content)
  if (!checked && pathname !== '/login') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
};
