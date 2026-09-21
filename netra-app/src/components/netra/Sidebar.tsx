'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Camera, Users, Stethoscope, BarChart3, Settings, LogOut, Lock, Eye } from 'lucide-react';
import { getSession, logout, NetraSession } from '../../lib/auth';

interface SidebarProps {
  pendingReviewCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  pendingReviewCount,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<NetraSession | null>(null);

  useEffect(() => {
    setSession(getSession());
  }, []);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const isDoctor = session?.role === 'doctor';

  const navItems = [
    {
      id: '/screening',
      label: 'Dashboard',
      icon: BarChart3,
      badge: null,
      doctorOnly: false,
    },
    {
      id: '/patients',
      label: 'Patient Records',
      icon: Users,
      badge: null,
      doctorOnly: false,
    },
    {
      id: '/review',
      label: 'Screening',
      icon: Camera,
      badge: pendingReviewCount > 0 ? pendingReviewCount : null,
      badgeColor: 'bg-rose-500 text-white',
      doctorOnly: false,
    },
    {
      id: '/analytics',
      label: 'Reports',
      icon: Stethoscope,
      badge: null,
      doctorOnly: false,
    },
    {
      id: '/settings',
      label: 'Settings',
      icon: Settings,
      badge: null,
      doctorOnly: false,
    },
  ];

  return (
    <aside className="w-16 md:w-64 bg-[#0f172a] text-slate-300 flex flex-col justify-between select-none shadow-xl z-20">
      {/* Top Nav Rail Links */}
      <div>
        <div className="h-16 flex items-center justify-center md:justify-start md:px-6 bg-[#0B1221] border-b border-slate-800/50">
          <Eye className="w-6 h-6 text-blue-500 md:mr-3" />
          <span className="hidden md:block font-display font-semibold text-lg text-white tracking-wide">
            NETRAMNOVA
          </span>
        </div>
        <nav className="space-y-1.5 px-3 py-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.id;
            const isLocked = item.doctorOnly && !isDoctor;

            return (
              <Link
                key={item.id}
                href={isLocked ? '#' : item.id}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isLocked
                    ? 'opacity-40 cursor-not-allowed text-slate-500 pointer-events-none'
                    : isActive
                    ? 'bg-blue-600/90 text-white shadow-md font-semibold cursor-pointer translate-x-1'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 cursor-pointer hover:translate-x-1'
                }`}
                title={isLocked ? `Doctor access required` : item.label}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : isLocked ? 'text-slate-600' : 'text-slate-400'}`} />
                  <span className="hidden md:inline font-sans">{item.label}</span>
                </div>
                <div className="hidden md:flex items-center gap-1">
                  {isLocked && <Lock className="w-3 h-3 text-slate-500" />}
                  {item.badge !== null && !isLocked && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.badgeColor || 'bg-blue-900/60 text-blue-200 border border-blue-800'}`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom section: role badge + logout */}
      <div className="pb-4">
        {/* Role indicator */}
        {session && (
          <div className="px-5 py-4 border-t border-slate-800/50 hidden md:flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${isDoctor ? 'bg-blue-400' : 'bg-emerald-400'} shadow-[0_0_8px_rgba(96,165,250,0.6)]`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-sans font-semibold text-white truncate">{session.name}</div>
              <div className={`text-xs font-medium ${isDoctor ? 'text-blue-400' : 'text-emerald-400'}`}>
                {isDoctor ? 'Ophthalmologist' : 'Health Worker'}
              </div>
            </div>
          </div>
        )}

        {/* Logout */}
        <div className="px-3">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="hidden md:inline font-sans font-medium">Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
