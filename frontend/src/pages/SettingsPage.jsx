import React from 'react';
import { Shield, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200/80 p-4 sm:p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Settings</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Admin Exclusive
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Administrator profile and account settings.
          </p>
        </div>
      </div>

      {/* Admin Profile Section */}
      <div className="bg-white rounded-xl border border-gray-200/80 p-4 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-[#075E54]">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Administrator Account</h3>
            <p className="text-xs text-gray-500">Current authenticated administrator credentials</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
          <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200/60">
            <span className="text-gray-400 block mb-1">Username</span>
            <span className="font-semibold text-gray-900 font-mono text-sm">{user?.username || 'admin'}</span>
          </div>

          <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200/60">
            <span className="text-gray-400 block mb-1">Email Address</span>
            <span className="font-semibold text-gray-900 text-sm truncate block">{user?.email || 'admin@whatsappmonitor.local'}</span>
          </div>

          <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200/60">
            <span className="text-gray-400 block mb-1">Assigned Role</span>
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 uppercase tracking-wider text-[11px]">
              <Shield className="w-3.5 h-3.5" />
              {user?.role || 'admin'}
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200/60">
            <span className="text-gray-400 block mb-1">Session Status</span>
            <span className="font-semibold text-gray-700">
              {user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Active Authenticated Session'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
