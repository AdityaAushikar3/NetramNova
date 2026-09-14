'use client';

import React from 'react';
import { NavigationTab } from './types';
import { Camera, Users, Stethoscope, BarChart3, Settings, ShieldCheck, Database } from 'lucide-react';

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
  const navItems = [
    {
      id: 'screening' as NavigationTab,
      label: 'New Screening',
      icon: Camera,
      badge: null,
    },
    {
      id: 'patients' as NavigationTab,
      label: 'Patients',
      icon: Users,
      badge: null,
    },
    {
      id: 'review' as NavigationTab,
      label: 'Doctor Review Queue',
      icon: Stethoscope,
      badge: pendingReviewCount > 0 ? pendingReviewCount : null,
      badgeColor: 'bg-amber-600 text-white',
    },
    {
      id: 'analytics' as NavigationTab,
      label: 'PHC Analytics',
      icon: BarChart3,
      badge: null,
    },
    {
      id: 'settings' as NavigationTab,
      label: 'Settings',
      icon: Settings,
      badge: null,
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
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                }`}
                title={item.label}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="hidden md:inline font-sans">{item.label}</span>
                </div>
                {item.badge !== null && (
                  <span
                    className={`hidden md:inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold rounded-full font-mono ${
                      item.badgeColor || 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Diagnostics / System Info */}
      <div className="p-3 border-t border-slate-800 hidden md:block text-xs font-mono text-slate-400 bg-slate-950/40">
        <div className="flex items-center gap-2 mb-1 text-slate-300 font-sans font-medium">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>Local DB Engine</span>
        </div>
        <div className="text-xs text-slate-500 space-y-0.5">
          <div>SQLite Encrypted Active</div>
          <div>Foracchia + CLAHE v1.2</div>
          <div>ICDR 2019 Protocol</div>
        </div>
      </div>
    </aside>
  );
};
