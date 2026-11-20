import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Phone,
  Mail,
  Calendar,
  Edit2,
  Trash2,
  Power,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Info,
} from 'lucide-react';
import { salespersonsAPI } from '../services/api';
import ConnectionStatusBadge from '../components/salespersons/ConnectionStatusBadge';
import SalespersonModal from '../components/salespersons/SalespersonModal';
import DeactivateConfirmModal from '../components/salespersons/DeactivateConfirmModal';
import DeleteSalespersonModal from '../components/salespersons/DeleteSalespersonModal';
import WhatsAppConnectModal from '../components/salespersons/WhatsAppConnectModal';

export default function SalespersonsPage() {
  const [salespersons, setSalespersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [connectTarget, setConnectTarget] = useState(null);

  // Notification Banner
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchSalespersons = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await salespersonsAPI.getAll();
      if (res.success && Array.isArray(res.data)) {
        setSalespersons(res.data);
      }
    } catch (err) {
      console.error('Failed to load salespersons:', err);
      showToast('Failed to retrieve salespersons. Retrying...', 'error');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSalespersons();
  }, []);

  // Filtered salespersons calculation
  const filteredSalespersons = useMemo(() => {
    return salespersons.filter((sp) => {
      const matchesSearch =
        !search.trim() ||
        sp.name.toLowerCase().includes(search.toLowerCase()) ||
        sp.phone_number.includes(search) ||
        (sp.email && sp.email.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus =
        statusFilter === 'all' || sp.connection_status === statusFilter;

      const matchesActive =
        activeFilter === 'all' ||
        (activeFilter === 'active' && sp.is_active) ||
        (activeFilter === 'inactive' && !sp.is_active);

      return matchesSearch && matchesStatus && matchesActive;
    });
  }, [salespersons, search, statusFilter, activeFilter]);

  // Handle Create / Edit Success
  const handleModalSuccess = (savedSalesperson, mode) => {
    if (mode === 'created') {
      setSalespersons((prev) => [savedSalesperson, ...prev]);
      showToast(`Salesperson "${savedSalesperson.name}" registered successfully.`);
    } else {
      setSalespersons((prev) =>
        prev.map((s) => (s.id === savedSalesperson.id ? savedSalesperson : s))
      );
      showToast(`Salesperson "${savedSalesperson.name}" updated successfully.`);
    }
  };

  // Open WhatsApp Connect Modal
  const handleOpenConnect = (salesperson) => {
    if (!salesperson.is_active) {
      showToast('Cannot connect an inactive salesperson. Please reactivate first.', 'error');
      return;
    }
    setConnectTarget(salesperson);
  };

  // Real-time status update from connect modal
  const handleStatusChange = (salespersonId, newStatus) => {
    setSalespersons((prev) =>
      prev.map((s) => (s.id === salespersonId ? { ...s, connection_status: newStatus } : s))
    );
  };

  // Open Edit Modal
  const handleEdit = (salesperson) => {
    setEditTarget(salesperson);
    setModalOpen(true);
  };

  // Open Add Modal
  const handleAddNew = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  // Toggle Active State
  const handleToggleActive = (salesperson) => {
    if (salesperson.is_active) {
      setDeactivateTarget(salesperson);
    } else {
      reactivateSalesperson(salesperson);
    }
  };

  const reactivateSalesperson = async (salesperson) => {
    try {
      const res = await salespersonsAPI.update(salesperson.id, { is_active: true });
      if (res.success) {
        setSalespersons((prev) =>
          prev.map((s) => (s.id === salesperson.id ? { ...s, is_active: true } : s))
        );
        showToast(`Salesperson "${salesperson.name}" reactivated.`);
      }
    } catch (err) {
      showToast('Failed to reactivate salesperson.', 'error');
    }
  };

  // Confirm Deactivation
  const handleConfirmDeactivation = async () => {
    if (!deactivateTarget) return;
    try {
      setDeactivating(true);
      const res = await salespersonsAPI.update(deactivateTarget.id, { is_active: false });
      if (res.success) {
        setSalespersons((prev) =>
          prev.map((s) =>
            s.id === deactivateTarget.id
              ? { ...s, is_active: false, connection_status: 'Disconnected' }
              : s
          )
        );
        showToast(`Salesperson "${deactivateTarget.name}" deactivated.`);
        setDeactivateTarget(null);
      }
    } catch (err) {
      showToast('Failed to deactivate salesperson.', 'error');
    } finally {
      setDeactivating(false);
    }
  };

  // Confirm Complete Removal & Data Purge
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await salespersonsAPI.delete(deleteTarget.id);
      if (res.success) {
        setSalespersons((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        showToast(
          `Salesperson "${deleteTarget.name}" and all associated WhatsApp data purged completely.`
        );
        setDeleteTarget(null);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to remove salesperson.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 shadow-md transition-all animate-slideDown ${
            toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-xs font-bold text-gray-500 hover:text-gray-800 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-gray-200/80 p-4 sm:p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              Salespersons
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#075E54]/10 text-[#075E54]">
              {salespersons.length} Reps
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Manage sales team accounts and monitor their WhatsApp Web device pairing.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
          <button
            onClick={() => fetchSalespersons(true)}
            disabled={refreshing}
            className="p-2.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            title="Refresh list from database"
            aria-label="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleAddNew}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#075E54] hover:bg-[#128C7E] active:scale-98 text-white text-xs font-semibold shadow-xs transition-all min-h-[44px] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Salesperson</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-gray-200/80 p-3.5 sm:p-4 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone (+), or email..."
            className="w-full pl-10 pr-12 py-2.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#075E54] focus:border-[#075E54] bg-gray-50/50 hover:bg-white transition-all min-h-[44px]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 hover:text-gray-600 min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Connection Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#075E54] min-h-[44px] cursor-pointer"
          >
            <option value="all">All Connection States</option>
            <option value="Not Connected">Not Connected</option>
            <option value="Waiting for QR Scan">Waiting for QR Scan</option>
            <option value="Connected">Connected</option>
            <option value="Disconnected">Disconnected</option>
            <option value="Error">Error</option>
          </select>

          {/* Active / Inactive Filter */}
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="px-3 py-2.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#075E54] min-h-[44px] cursor-pointer"
          >
            <option value="all">All Monitoring States</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Salespersons Content Container */}
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-xs sm:text-sm text-gray-900">Monitored Salespersons</h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {filteredSalespersons.length} of {salespersons.length}
            </span>
          </div>
          <span className="text-[11px] text-gray-400 font-mono hidden sm:inline">
            salespersons table
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="w-8 h-8 border-3 border-emerald-200 border-t-[#075E54] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-medium">Loading salespersons from database...</p>
          </div>
        ) : filteredSalespersons.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-[#075E54] flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-gray-900">No salespersons found</h4>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {search || statusFilter !== 'all' || activeFilter !== 'all'
                ? 'No salespersons match your filter criteria. Try adjusting your search query.'
                : 'Get started by registering your first salesperson to initiate monitoring.'}
            </p>
            {!search && statusFilter === 'all' && activeFilter === 'all' && (
              <button
                onClick={handleAddNew}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#075E54] text-white text-xs font-semibold hover:bg-[#128C7E] transition-all min-h-[44px] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add First Salesperson</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE VIEW (md: and above) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Salesperson</th>
                    <th className="px-5 py-3">WhatsApp Number</th>
                    <th className="px-5 py-3">Monitoring</th>
                    <th className="px-5 py-3">Connection Status</th>
                    <th className="px-5 py-3">Registered On</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSalespersons.map((sp) => (
                    <tr
                      key={sp.id}
                      className={`transition-colors ${
                        sp.is_active ? 'hover:bg-gray-50/70' : 'bg-gray-50/40 text-gray-400 hover:bg-gray-100/40'
                      }`}
                    >
                      {/* Name & Email */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                              sp.is_active
                                ? 'bg-[#075E54]/10 text-[#075E54]'
                                : 'bg-gray-200 text-gray-500'
                            }`}
                          >
                            {sp.name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')}
                          </div>
                          <div>
                            <div className={`font-semibold ${sp.is_active ? 'text-gray-900' : 'text-gray-500'}`}>
                              {sp.name}
                            </div>
                            {sp.email ? (
                              <div className="text-gray-400 text-[11px] flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3 text-gray-400" />
                                <span>{sp.email}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400 italic">No email</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone Number */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-gray-800">
                          <Phone className="w-3.5 h-3.5 text-[#128C7E]" />
                          <span>{sp.phone_number}</span>
                        </div>
                      </td>

                      {/* Active Monitoring State */}
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleToggleActive(sp)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                            sp.is_active
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                          }`}
                          title={sp.is_active ? 'Click to deactivate' : 'Click to activate'}
                        >
                          <Power className={`w-3 h-3 ${sp.is_active ? 'text-emerald-600' : 'text-gray-400'}`} />
                          <span>{sp.is_active ? 'Active' : 'Inactive'}</span>
                        </button>
                      </td>

                      {/* Connection Status Badge */}
                      <td className="px-5 py-4">
                        <ConnectionStatusBadge status={sp.connection_status} />
                      </td>

                      {/* Registration Date */}
                      <td className="px-5 py-4 text-gray-500">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>{new Date(sp.created_at).toLocaleDateString()}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {sp.is_active ? (
                            <button
                              onClick={() => handleOpenConnect(sp)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-[#075E54] hover:bg-emerald-100 hover:text-[#054c44] border border-emerald-200 text-xs font-semibold transition-colors cursor-pointer shadow-2xs min-h-[36px]"
                              title="Open WhatsApp QR Connection Screen"
                            >
                              <QrCode className="w-3.5 h-3.5 text-[#25D366]" />
                              <span>Connect</span>
                            </button>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-400 border border-gray-200 text-xs font-medium cursor-not-allowed"
                              title="Reactivate salesperson to connect"
                            >
                              <QrCode className="w-3.5 h-3.5 text-gray-300" />
                              <span>Inactive</span>
                            </span>
                          )}

                          <button
                            onClick={() => handleEdit(sp)}
                            className="p-2 rounded-lg text-gray-500 hover:text-[#075E54] hover:bg-emerald-50 transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                            title="Edit salesperson"
                            aria-label="Edit salesperson"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(sp)}
                            className={`p-2 rounded-lg transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center ${
                              sp.is_active
                                ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                                : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={sp.is_active ? 'Deactivate salesperson' : 'Reactivate salesperson'}
                            aria-label="Toggle active"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(sp)}
                            className="p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                            title="Delete salesperson & purge all data"
                            aria-label="Delete salesperson"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARD VIEW (< md: / 768px) */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredSalespersons.map((sp) => (
                <div
                  key={sp.id}
                  className={`p-4 space-y-3 transition-colors ${
                    sp.is_active ? 'bg-white' : 'bg-gray-50/60'
                  }`}
                >
                  {/* Card Header: Avatar, Name, Email, Active Toggle */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          sp.is_active
                            ? 'bg-[#075E54]/10 text-[#075E54]'
                            : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {sp.name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-gray-900 truncate">
                          {sp.name}
                        </h4>
                        {sp.email ? (
                          <div className="text-gray-400 text-xs flex items-center gap-1 mt-0.5 truncate">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate">{sp.email}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">No email</span>
                        )}
                      </div>
                    </div>

                    {/* Active State Pill */}
                    <button
                      onClick={() => handleToggleActive(sp)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer min-h-[36px] transition-colors shrink-0 ${
                        sp.is_active
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}
                    >
                      <Power className={`w-3 h-3 ${sp.is_active ? 'text-emerald-600' : 'text-gray-400'}`} />
                      <span>{sp.is_active ? 'Active' : 'Inactive'}</span>
                    </button>
                  </div>

                  {/* Card Telemetry Row: Phone & Connection Status */}
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-gray-50/80 border border-gray-100 text-xs">
                    <div className="flex items-center gap-1.5 font-mono font-semibold text-gray-800">
                      <Phone className="w-3.5 h-3.5 text-[#128C7E]" />
                      <span>{sp.phone_number}</span>
                    </div>

                    <ConnectionStatusBadge status={sp.connection_status} />
                  </div>

                  {/* Registered Date */}
                  <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>Registered: {new Date(sp.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Card Action Buttons: Full-width touch friendly */}
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-100">
                    {sp.is_active ? (
                      <button
                        onClick={() => handleOpenConnect(sp)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-[#075E54] hover:bg-emerald-100 border border-emerald-200 text-xs font-bold transition-colors min-h-[44px] cursor-pointer"
                      >
                        <QrCode className="w-4 h-4 text-[#25D366]" />
                        <span>Pair QR</span>
                      </button>
                    ) : (
                      <button
                        disabled
                        className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-gray-100 text-gray-400 text-xs font-medium cursor-not-allowed min-h-[44px]"
                      >
                        <QrCode className="w-4 h-4 text-gray-300" />
                        <span>Inactive</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleEdit(sp)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100 text-xs font-semibold min-h-[44px] cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => setDeleteTarget(sp)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 active:bg-rose-200 text-xs font-semibold min-h-[44px] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Help Tip */}
      <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200/80 flex items-center gap-2.5 text-xs text-gray-500">
        <Info className="w-4 h-4 text-[#075E54] shrink-0" />
        <span>To link a salesperson's WhatsApp account, tap <strong>Pair QR</strong> and scan the QR code using WhatsApp on their phone.</span>
      </div>

      {/* Add / Edit Modal */}
      <SalespersonModal
        isOpen={modalOpen}
        editTarget={editTarget}
        onClose={() => {
          setModalOpen(false);
          setEditTarget(null);
        }}
        onSuccess={handleModalSuccess}
      />

      {/* Deactivation Confirmation Modal */}
      <DeactivateConfirmModal
        isOpen={Boolean(deactivateTarget)}
        salesperson={deactivateTarget}
        loading={deactivating}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleConfirmDeactivation}
      />

      {/* Complete Removal & Data Purge Modal */}
      <DeleteSalespersonModal
        isOpen={Boolean(deleteTarget)}
        salesperson={deleteTarget}
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* WhatsApp QR Connection Modal */}
      <WhatsAppConnectModal
        isOpen={Boolean(connectTarget)}
        salesperson={connectTarget}
        onClose={() => setConnectTarget(null)}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
