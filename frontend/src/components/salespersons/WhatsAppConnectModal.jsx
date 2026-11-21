import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  QrCode,
  RefreshCw,
  PowerOff,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  Smartphone,
  Wifi,
  WifiOff,
  Info,
} from 'lucide-react';
import QRCode from 'qrcode';
import { whatsappAPI } from '../../services/api';
import ConnectionStatusBadge from './ConnectionStatusBadge';

export default function WhatsAppConnectModal({
  isOpen,
  salesperson,
  onClose,
  onStatusChange,
}) {
  if (!isOpen || !salesperson) return null;

  const [status, setStatus] = useState('Initializing');
  const [syncStatus, setSyncStatus] = useState('Waiting for device pairing');
  const [syncProgress, setSyncProgress] = useState(null);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [qrImageDataUrl, setQrImageDataUrl] = useState(null);
  const [qrExpiresAt, setQrExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [providerName, setProviderName] = useState('baileys');
  const [supportsRefresh, setSupportsRefresh] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const pollIntervalRef = useRef(null);

  // Initialize connection upon opening modal
  const startConnection = async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus('Initializing');

      const res = await whatsappAPI.connect(salesperson.id);
      if (res.success && res.data) {
        setStatus(res.data.status || 'Connecting');
        if (res.data.syncStatus) setSyncStatus(res.data.syncStatus);
        if (res.data.syncProgress) setSyncProgress(res.data.syncProgress);
        if (res.data.qrCode) {
          setQrCodeData(res.data.qrCode);
          setQrExpiresAt(res.data.qrExpiresAt);
        }
        setIsDemo(res.data.isDemo ?? false);
        setProviderName(res.data.provider || 'baileys');
        if (onStatusChange) onStatusChange(salesperson.id, res.data.status);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to initialize WhatsApp connection.';
      setError(msg);
      setStatus('Error');
    } finally {
      setLoading(false);
    }
  };

  // Poll connection status
  const checkStatus = async () => {
    try {
      const res = await whatsappAPI.getStatus(salesperson.id);
      if (res.success && res.data) {
        setStatus(res.data.status);
        if (res.data.syncStatus) setSyncStatus(res.data.syncStatus);
        if (res.data.syncProgress) setSyncProgress(res.data.syncProgress);
        setIsDemo(res.data.isDemo ?? false);
        setProviderName(res.data.provider || 'baileys');
        setSupportsRefresh(res.data.supportsQRRefresh ?? true);

        if (res.data.qrCode) {
          setQrCodeData(res.data.qrCode);
          setQrExpiresAt(res.data.qrExpiresAt);
        } else if (res.data.status === 'Connected' || res.data.status === 'Disconnected') {
          setQrCodeData(null);
          setQrExpiresAt(null);
        }

        if (onStatusChange) onStatusChange(salesperson.id, res.data.status);
      }
    } catch (err) {
      console.warn('Status poll notice:', err.message);
    }
  };

  // Convert QR text payload to rendered Image Data URL
  useEffect(() => {
    if (!qrCodeData) {
      setQrImageDataUrl(null);
      return;
    }

    QRCode.toDataURL(qrCodeData, {
      width: 256,
      margin: 2,
      color: {
        dark: '#075E54', // WhatsApp Deep Green
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrImageDataUrl(url))
      .catch((err) => {
        console.error('Failed to generate QR code canvas:', err);
      });
  }, [qrCodeData]);

  // Expiration countdown timer
  useEffect(() => {
    if (!qrExpiresAt) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const diffMs = new Date(qrExpiresAt).getTime() - Date.now();
      const seconds = Math.max(0, Math.floor(diffMs / 1000));
      setTimeLeft(seconds);

      if (seconds <= 0 && status === 'Waiting for QR Scan') {
        setStatus('QR Expired');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [qrExpiresAt, status]);

  // Lifecycle initialization, SSE live subscription & fast status poll
  useEffect(() => {
    startConnection();

    // Fast status poll every 1.2s to pick up QR immediately
    pollIntervalRef.current = setInterval(checkStatus, 1200);

    // Live status subscription via SSE
    let eventSource = null;
    try {
      const sseUrl = whatsappAPI.getLiveStreamUrl();
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.salespersonId === salesperson.id) {
            if (data.type === 'connection_status') {
              setStatus(data.status);
              if (data.syncStatus) setSyncStatus(data.syncStatus);
              if (data.status === 'Connected') {
                setQrCodeData(null);
                setQrExpiresAt(null);
              }
              if (onStatusChange) onStatusChange(salesperson.id, data.status);
            }
            if (data.type === 'sync_progress') {
              setSyncStatus(data.status);
              if (data.progress) setSyncProgress(data.progress);
            }
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (eventSource) eventSource.close();
    };
  }, [salesperson.id]);

  // Handle QR Refresh
  const handleRefreshQR = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await whatsappAPI.refreshQR(salesperson.id);
      if (res.success && res.data) {
        setStatus(res.data.status);
        if (res.data.qrCode) {
          setQrCodeData(res.data.qrCode);
          setQrExpiresAt(res.data.qrExpiresAt);
        }
        if (onStatusChange) onStatusChange(salesperson.id, res.data.status);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to refresh QR code.');
    } finally {
      setRefreshing(false);
    }
  };

  // Handle Disconnect
  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      setError(null);
      const res = await whatsappAPI.disconnect(salesperson.id);
      if (res.success) {
        setStatus('Disconnected');
        setQrCodeData(null);
        setQrExpiresAt(null);
        setSyncStatus('Disconnected');
        setSyncProgress(null);
        if (onStatusChange) onStatusChange(salesperson.id, 'Disconnected');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to disconnect session.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200/90 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="h-16 px-4 sm:px-6 bg-[#075E54] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-white/10 text-[#25D366] shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight truncate">
                  WhatsApp Device Pairing
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500 text-white hidden sm:flex items-center gap-1 shrink-0">
                  <Wifi className="w-2.5 h-2.5" />
                  WhatsApp Web
                </span>
              </div>
              <p className="text-xs text-emerald-200 truncate">
                {salesperson.name} • {salesperson.phone_number}
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

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6">
          {/* Error alert */}
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* Grid Layout: Left QR Area, Right Instructions & Telemetry */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-center">
            {/* Left Column: QR Code Display Area */}
            <div className="flex flex-col items-center justify-center p-4 sm:p-6 bg-gray-50 rounded-2xl border border-gray-200 text-center relative w-full">
              {/* QR Container */}
              <div className="relative w-full max-w-[240px] sm:max-w-[260px] aspect-square bg-white rounded-xl shadow-inner border border-gray-200 flex items-center justify-center p-3 overflow-hidden">
                {status === 'Connected' ? (
                  <div className="flex flex-col items-center p-4 text-emerald-700">
                    <CheckCircle2 className="w-14 h-14 text-[#25D366] mb-2" />
                    <p className="text-sm font-bold text-gray-900">Device Connected</p>
                    <p className="text-xs text-gray-500 mt-1">
                      WhatsApp monitoring session is active.
                    </p>
                  </div>
                ) : status === 'QR Expired' ? (
                  <div className="flex flex-col items-center p-4">
                    <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-2">
                      <Clock className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-gray-900">QR Code Expired</p>
                    <p className="text-[11px] text-gray-500 mt-1 mb-3">
                      Pairing codes expire after 60 seconds for security.
                    </p>
                    <button
                      onClick={handleRefreshQR}
                      disabled={refreshing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#075E54] text-white text-xs font-semibold hover:bg-[#128C7E] transition-all min-h-[44px] cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                      <span>Refresh QR Code</span>
                    </button>
                  </div>
                ) : status === 'Disconnected' ? (
                  <div className="flex flex-col items-center p-4 text-gray-500">
                    <WifiOff className="w-12 h-12 text-gray-400 mb-2" />
                    <p className="text-xs font-bold text-gray-900">Session Disconnected</p>
                    <p className="text-[11px] text-gray-500 mt-1 mb-3">
                      Device is not linked to monitor.
                    </p>
                    <button
                      onClick={startConnection}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg bg-[#075E54] text-white text-xs font-semibold hover:bg-[#128C7E] transition-all min-h-[44px] cursor-pointer"
                    >
                      Reconnect
                    </button>
                  </div>
                ) : qrImageDataUrl ? (
                  <div className="relative flex flex-col items-center justify-center w-full h-full">
                    <img
                      src={qrImageDataUrl}
                      alt="WhatsApp Device Pairing QR Code"
                      className="w-full h-full object-contain p-1"
                    />
                    <span className="absolute bottom-1 bg-[#075E54]/90 text-white text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded shadow-sm flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse"></span>
                      Scan via WhatsApp
                    </span>
                  </div>
                ) : loading || status === 'Initializing' || status === 'Connecting' || status === 'Waiting for QR Scan' ? (
                  <div className="flex flex-col items-center gap-3 p-4">
                    <div className="w-10 h-10 border-3 border-emerald-200 border-t-[#075E54] rounded-full animate-spin" />
                    <p className="text-xs font-semibold text-gray-700">Connecting to WhatsApp Web...</p>
                    <span className="text-[10px] text-gray-500 text-center max-w-[200px]">
                      Establishing secure session and generating pairing QR code
                    </span>
                  </div>
                ) : status === 'Error' ? (
                  <div className="flex flex-col items-center p-4 text-rose-600">
                    <AlertCircle className="w-12 h-12 mb-2 text-rose-500" />
                    <p className="text-xs font-bold text-gray-900">Connection Error</p>
                    <p className="text-[11px] text-gray-500 mt-1 mb-3 text-center">
                      Unable to establish WhatsApp Web socket handshake.
                    </p>
                    <button
                      onClick={startConnection}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg bg-[#075E54] text-white text-xs font-semibold hover:bg-[#128C7E] transition-all min-h-[44px] cursor-pointer"
                    >
                      Retry Connection
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center p-4 text-gray-400">
                    <QrCode className="w-12 h-12 mb-2 text-gray-300" />
                    <p className="text-xs font-medium text-gray-600">Awaiting QR Generation</p>
                    <button
                      onClick={handleRefreshQR}
                      disabled={refreshing}
                      className="mt-2 px-3 py-2 text-xs text-[#075E54] hover:underline cursor-pointer min-h-[44px]"
                    >
                      Click to Request QR
                    </button>
                  </div>
                )}
              </div>

              {/* Countdown badge */}
              {status === 'Waiting for QR Scan' && timeLeft !== null && (
                <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-xs">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Expires in: {timeLeft}s</span>
                </div>
              )}
            </div>

            {/* Right Column: Steps & Instructions */}
            <div className="space-y-4">
              {/* Status Header Box */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-gray-50 border border-gray-200/80 space-y-3">
                <div>
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                    Connection State
                  </span>
                  <div className="flex items-center justify-between">
                    <ConnectionStatusBadge status={status} />
                    <span className="text-xs text-gray-500 font-medium">
                      Service: WhatsApp Web
                    </span>
                  </div>
                </div>

                {/* Sync Progress Telemetry */}
                {(status === 'Connected' || (syncStatus && syncStatus !== 'Waiting for device pairing')) && (
                  <div className="pt-2 border-t border-gray-200/60 text-xs space-y-1">
                    <div className="flex items-center justify-between text-gray-700">
                      <span className="font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>History Sync (Last 3 Days)</span>
                      </span>
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {syncStatus}
                      </span>
                    </div>
                    {syncProgress && (
                      <div className="text-[11px] text-gray-500 flex items-center justify-between pt-0.5">
                        <span>Messages: {syncProgress.messagesProcessed || 0}</span>
                        <span>Contacts: {syncProgress.customersDiscovered || 0}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Instructions List */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#075E54]" />
                  <span>Device Linking Instructions</span>
                </h4>

                <ol className="text-xs text-gray-600 space-y-2 pl-1">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#075E54] text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      Open <strong>WhatsApp</strong> or <strong>WhatsApp Business</strong> on salesperson's phone.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#075E54] text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Tap <strong>Settings</strong> (iOS) or <strong>Menu (⋮)</strong> (Android) → <strong>Linked Devices</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#075E54] text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      Tap <strong>Link a Device</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#075E54] text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      4
                    </span>
                    <span>
                      Point phone's camera at the QR code displayed on this screen.
                    </span>
                  </li>
                </ol>
              </div>

              {/* Refresh / Actions */}
              <div className="pt-2 flex items-center gap-2">
                {supportsRefresh && (
                  <button
                    type="button"
                    onClick={handleRefreshQR}
                    disabled={refreshing || loading}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 min-h-[44px] cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>Refresh QR Code</span>
                  </button>
                )}

                {status !== 'Disconnected' && status !== 'Not Connected' && (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 active:bg-rose-200 transition-colors disabled:opacity-50 min-h-[44px] cursor-pointer"
                  >
                    <PowerOff className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-gray-500 shrink-0">
          <div className="flex items-center gap-1.5 text-center sm:text-left">
            <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>Secure connection • Read-only chat monitoring</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 active:bg-gray-400 transition-colors cursor-pointer min-h-[44px]"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
