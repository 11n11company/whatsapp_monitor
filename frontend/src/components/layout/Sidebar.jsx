import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Users,
  MessageSquare,
  Settings,
  LogOut,
  X,
  PhoneCall,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (onClose) onClose();
    await logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Salespersons', to: '/salespersons', icon: Users },
    { name: 'Conversations', to: '/conversations', icon: MessageSquare },
    { name: 'Settings', to: '/settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 sm:w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        } pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]`}
      >
        {/* Brand header */}
        <div className="h-16 px-4 sm:px-5 flex items-center justify-between border-b border-gray-100 bg-[#075E54] text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white">
              <PhoneCall className="w-5 h-5 text-[#25D366]" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-wide leading-tight">WhatsApp</h1>
              <p className="text-[11px] text-emerald-200 tracking-wider uppercase font-medium">Enterprise Monitor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-emerald-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close sidebar navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={() => onClose && onClose()}
                className={({ isActive }) =>
                  `flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-medium min-h-[44px] transition-colors ${
                    isActive
                      ? 'bg-[#075E54] text-white shadow-xs font-semibold'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#25D366]' : 'text-gray-400'}`} />
                    <span>{item.name}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer with Logout */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/70 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold min-h-[44px] text-rose-600 hover:bg-rose-50 hover:text-rose-700 active:bg-rose-100 transition-colors cursor-pointer"
          >
            <LogOut className="w-5 h-5 text-rose-500 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
