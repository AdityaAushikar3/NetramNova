'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavigationTab } from './types';
import { Camera, Users, Stethoscope, BarChart3, Settings, Database, LogOut, Lock } from 'lucide-react';
import { getSession, logout, NetraSession } from '../../lib/auth';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  pendingReviewCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  pendingReviewCount,
}) => {
  const router = useRouter();
  const [session, setSession] = useState<NetraSession | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(getSession());
  }, []);

  const isDoctor = session?.role === 'doctor';

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const navItems = [
    {
      id: 'screening' as NavigationTab,
      label: 'New Screening',
      icon: Camera,
      badge: null,
      doctorOnly: false,
    },
    {
      id: 'patients' as NavigationTab,
      label: 'Patients',
      icon: Users,
      badge: null,
      doctorOnly: false,
    },
    {
      id: 'review' as NavigationTab,
      label: 'Doctor Review Queue',
      icon: Stethoscope,
      badge: pendingReviewCount > 0 ? pendingReviewCount : null,
      badgeColor: 'bg-amber-600 text-white',
      doctorOnly: true,
    },
    {
      id: 'analytics' as NavigationTab,
      label: 'PHC Analytics',
      icon: BarChart3,
      badge: null,
      doctorOnly: false,
    },
    {
      id: 'settings' as NavigationTab,
      label: 'Sync & Settings',
      icon: Settings,
      badge: null,
      doctorOnly: false,
    },
  ];

  return (
    <aside className="w-16 md:w-60 bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col justify-between select-none">
      {/* Top Nav Rail Links */}
      <div className="py-4">
        <div className="hidden md:block px-4 mb-3 text-xs font-mono tracking-wider text-slate-500 uppercase">
          Clinical Navigation
        </div>
        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isLocked = item.doctorOnly && !isDoctor;

            return (
              <button
                key={item.id}
                onClick={() => !isLocked && onSelectTab(item.id)}
                disabled={isLocked}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-colors ${
                  isLocked
                    ? 'opacity-40 cursor-not-allowed text-slate-500'
                    : isActive
                    ? 'bg-emerald-600 text-white shadow-sm font-semibold cursor-pointer'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 cursor-pointer'
                }`}
                title={isLocked ? `Doctor access required` : item.label}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : isLocked ? 'text-slate-600' : 'text-slate-400'}`} />
                  <span className="hidden md:inline font-sans">{item.label}</span>
                </div>
                <div className="hidden md:flex items-center gap-1">
                  {isLocked && <Lock className="w-3 h-3 text-slate-600" />}
                  {!isLocked && item.badge !== null && (
                    <span
                      className={`inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold rounded-full font-mono ${
                        item.badgeColor || 'bg-slate-700 text-slate-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom section: role badge + DB info + logout */}
      <div className="border-t border-slate-800">
        {/* Role indicator */}
        {session && (
          <div className="px-3 py-2.5 border-b border-slate-800 hidden md:flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isDoctor ? 'bg-blue-400' : 'bg-emerald-400'} animate-pulse`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-sans font-semibold text-slate-200 truncate">{session.name}</div>
              <div className={`text-xs font-mono ${isDoctor ? 'text-blue-400' : 'text-emerald-400'}`}>
                {isDoctor ? 'Doctor' : 'Health Worker'}
              </div>
            </div>
          </div>
        )}

        {/* DB Info */}
        <div className="p-3 hidden md:block text-xs font-mono text-slate-400 bg-slate-950/40">
          <div className="flex items-center gap-2 mb-1 text-slate-300 font-sans font-medium">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Local DB Engine</span>
          </div>
          <div className="text-xs text-slate-500 space-y-0.5">
            <div>JSON Persistent Active</div>
            <div>Foracchia + CLAHE v1.2</div>
            <div>ICDR 2019 Protocol</div>
          </div>
        </div>

        {/* Logout */}
        <div className="p-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline font-sans">Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
