import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, AlertCircle, Check } from 'lucide-react';
import { salespersonsAPI } from '../../services/api';

const ALLOWED_STATUSES = ['Not Connected', 'Waiting for QR Scan', 'Connected', 'Disconnected', 'Error'];

export default function SalespersonModal({ isOpen, onClose, onSuccess, editTarget = null }) {
  const isEditing = Boolean(editTarget);

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('Not Connected');
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    if (editTarget) {
      setName(editTarget.name || '');
      setPhoneNumber(editTarget.phone_number || '');
      setEmail(editTarget.email || '');
      setConnectionStatus(editTarget.connection_status || 'Not Connected');
      setIsActive(editTarget.is_active ?? true);
    } else {
      setName('');
      setPhoneNumber('');
      setEmail('');
      setConnectionStatus('Not Connected');
      setIsActive(true);
    }
    setError('');
    setValidationErrors({});
  }, [editTarget, isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const errors = {};
    if (!name.trim()) {
      errors.name = 'Full name is required.';
    } else if (name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters.';
    }

    if (!phoneNumber.trim()) {
      errors.phoneNumber = 'Phone number is required.';
    } else {
      const digits = phoneNumber.replace(/[^\d]/g, '');
      if (digits.length < 7 || digits.length > 15) {
        errors.phoneNumber = 'Phone number must contain 7 to 15 digits with country code.';
      }
    }

    if (email && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        errors.email = 'Please provide a valid email address.';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    try {
      setLoading(true);

      const payload = {
        name: name.trim(),
        phone_number: phoneNumber.trim(),
        email: email.trim() ? email.trim() : null,
        connection_status: connectionStatus,
      };

      if (isEditing) {
        payload.is_active = isActive;
        const res = await salespersonsAPI.update(editTarget.id, payload);
        if (res.success) {
          onSuccess(res.data, 'updated');
          onClose();
        }
      } else {
        const res = await salespersonsAPI.create(payload);
        if (res.success) {
          onSuccess(res.data, 'created');
          onClose();
        }
      }
    } catch (err) {
      const serverMsg =
        err.response?.data?.message || err.message || 'Operation failed. Please try again.';
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200/90 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="h-16 px-4 sm:px-6 bg-[#075E54] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-white/10 text-[#25D366] shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold tracking-tight truncate">
                {isEditing ? 'Edit Salesperson' : 'Add New Salesperson'}
              </h2>
              <p className="text-xs text-emerald-200 truncate">
                {isEditing ? 'Update team member information' : 'Register a new sales representative'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 rounded-lg text-emerald-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Salesperson Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (validationErrors.name) setValidationErrors({ ...validationErrors, name: null });
                }}
                placeholder="e.g. Sales Representative Name"
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm transition-all focus:outline-none min-h-[44px] ${
                  validationErrors.name
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                    : 'border-gray-300 focus:ring-2 focus:ring-[#075E54] focus:border-[#075E54]'
                }`}
                autoFocus
              />
            </div>
            {validationErrors.name && (
              <p className="text-xs text-rose-600 mt-1">{validationErrors.name}</p>
            )}
          </div>

          {/* WhatsApp Phone Number */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              WhatsApp Phone Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Phone className="w-4 h-4 text-[#128C7E]" />
              </div>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  if (validationErrors.phoneNumber) setValidationErrors({ ...validationErrors, phoneNumber: null });
                }}
                placeholder="e.g. +1 555 234 5678 or +91 98765 43210"
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm font-mono transition-all focus:outline-none min-h-[44px] ${
                  validationErrors.phoneNumber
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                    : 'border-gray-300 focus:ring-2 focus:ring-[#075E54] focus:border-[#075E54]'
                }`}
              />
            </div>
            {validationErrors.phoneNumber ? (
              <p className="text-xs text-rose-600 mt-1">{validationErrors.phoneNumber}</p>
            ) : (
              <p className="text-[11px] text-gray-500 mt-1">
                Enter full international format with country code (+). Duplicates are rejected.
              </p>
            )}
          </div>

          {/* Email Address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Email Address
              </label>
              <span className="text-[11px] text-gray-400">Optional</span>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (validationErrors.email) setValidationErrors({ ...validationErrors, email: null });
                }}
                placeholder="e.g. rep@company.com"
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm transition-all focus:outline-none min-h-[44px] ${
                  validationErrors.email
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                    : 'border-gray-300 focus:ring-2 focus:ring-[#075E54] focus:border-[#075E54]'
                }`}
              />
            </div>
            {validationErrors.email && (
              <p className="text-xs text-rose-600 mt-1">{validationErrors.email}</p>
            )}
          </div>

          {/* Active Status in edit mode */}
          {isEditing && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900 block">Monitoring Status</span>
                <span className="text-[11px] text-gray-500">
                  {isActive ? 'Active (Monitoring enabled)' : 'Inactive (Monitoring paused)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors min-h-[36px] cursor-pointer ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-gray-300'
                }`}
              >
                {isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors min-h-[44px] flex items-center justify-center cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-lg bg-[#075E54] hover:bg-[#128C7E] active:scale-98 text-white text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px] cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isEditing ? 'Save Changes' : 'Register Salesperson'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
