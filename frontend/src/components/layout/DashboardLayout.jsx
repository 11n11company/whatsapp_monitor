import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import PWAInstallBanner from '../common/PWAInstallBanner';
import { Menu } from 'lucide-react';
import { healthAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');
  const { user } = useAuth();

  useEffect(() => {
    async function checkBackend() {
      try {
        const data = await healthAPI.check();
        if (data.status === 'ok') {
          setServerStatus('online');
        } else {
          setServerStatus('warning');
        }
      } catch {
        setServerStatus('offline');
      }
    }
    checkBackend();
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex flex-col antialiased selection:bg-emerald-200">
      {/* PWA Smart Install Banner */}
      <PWAInstallBanner />

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col flex-1 min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 px-3 sm:px-6 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* System Status Pill */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium border bg-gray-50 border-gray-200">
              <span
                className={`w-2 h-2 rounded-full ${
                  serverStatus === 'online'
                    ? 'bg-emerald-500 animate-pulse'
                    : serverStatus === 'offline'
                    ? 'bg-rose-500'
                    : 'bg-amber-500'
                }`}
              />
              <span className="text-gray-700 capitalize">
                {serverStatus === 'online' ? 'Online' : serverStatus}
              </span>
            </div>

            {/* Admin identity badge */}
            <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-gray-200">
              <div className="w-8 h-8 rounded-full bg-[#075E54] text-white flex items-center justify-center font-bold text-xs shrink-0">
                {user?.username?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div className="hidden md:block text-left">
                <span className="block text-xs font-semibold text-gray-900 leading-tight">
                  {user?.username || 'admin'}
                </span>
                <span className="text-[10px] text-emerald-700 font-medium">
                  Administrator
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content Container */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto min-w-0 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
