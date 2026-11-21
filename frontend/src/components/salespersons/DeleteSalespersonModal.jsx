import React from 'react';
import { Trash2, X, AlertOctagon } from 'lucide-react';

export default function DeleteSalespersonModal({
  isOpen,
  salesperson,
  onClose,
  onConfirm,
  loading = false,
}) {
  if (!isOpen || !salesperson) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
        {/* Danger Header */}
        <div className="p-4 sm:p-5 bg-rose-500/10 border-b border-rose-200/60 flex items-center gap-3.5 shrink-0">
          <div className="p-2.5 rounded-full bg-rose-100 text-rose-700 shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900 leading-tight">
              Delete Salesperson
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          <p className="text-sm text-gray-700 leading-relaxed">
            Are you sure you want to completely remove{' '}
            <span className="font-bold text-gray-900">{salesperson.name}</span> (
            <code className="text-xs font-mono font-semibold text-rose-800 bg-rose-50 px-1 py-0.5 rounded">
              {salesperson.phone_number}
            </code>
            )?
          </p>

          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1.5">
            <div className="font-semibold text-rose-800 flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Complete Data Wipe Notice</span>
            </div>
            <p>
              • All WhatsApp pairing sessions and credentials will be disconnected and deleted.
            </p>
            <p>
              • All customer contacts, conversation threads, and message history will be permanently deleted from the database.
            </p>
            <p>
              • Any downloaded media attachments will be permanently removed.
            </p>
            <p className="font-semibold pt-1 text-rose-700">
              This action is permanent and cannot be undone.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-3.5 sm:p-4 bg-gray-50/80 border-t border-gray-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-white transition-colors cursor-pointer min-h-[44px] flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(salesperson)}
            disabled={loading}
            className="px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Removing & Purging...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete & Purge All Data</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
