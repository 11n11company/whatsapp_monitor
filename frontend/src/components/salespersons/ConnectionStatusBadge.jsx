import React from 'react';
import { Wifi, WifiOff, Clock, AlertTriangle, HelpCircle } from 'lucide-react';

export default function ConnectionStatusBadge({ status = 'Not Connected', showInfo = true }) {
  const configs = {
    'Not Connected': {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      border: 'border-gray-200',
      dot: 'bg-gray-400',
      icon: WifiOff,
    },
    'Pending': {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      dot: 'bg-amber-500 animate-pulse',
      icon: Clock,
    },
    'Connected': {
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      border: 'border-emerald-200',
      dot: 'bg-[#25D366]',
      icon: Wifi,
    },
    'Disconnected': {
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-200',
      dot: 'bg-rose-500',
      icon: WifiOff,
    },
    'Error': {
      bg: 'bg-red-50',
      text: 'text-red-800',
      border: 'border-red-200',
      dot: 'bg-red-600',
      icon: AlertTriangle,
    },
  };

  const current = configs[status] || configs['Not Connected'];
  const Icon = current.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${current.bg} ${current.text} ${current.border}`}
      title={`Connection Status: ${status}`}
    >
      <span className={`w-2 h-2 rounded-full ${current.dot}`} />
      <span>{status}</span>
    </span>
  );
}

