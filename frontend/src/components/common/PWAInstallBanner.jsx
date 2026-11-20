import React, { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X, CheckCircle, Smartphone } from 'lucide-react';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 1. Check if running in standalone mode (already installed)
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://');
      setIsInstalled(Boolean(isStandalone));
    };

    checkInstalled();
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handler = (e) => setIsInstalled(e.matches);
    mediaQuery.addEventListener('change', handler);

    // 2. Capture beforeinstallprompt (Android Chrome, Desktop Chrome/Edge)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);
    if (isIos && isSafari) {
      setIsIosSafari(true);
    }

    // 4. Check if previously dismissed in this session
    if (sessionStorage.getItem('wam_pwa_banner_dismissed') === '1') {
      setDismissed(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      mediaQuery.removeEventListener('change', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isIosSafari) {
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('wam_pwa_banner_dismissed', '1');
  };

  // Do not display if already installed, dismissed, or browser doesn't support install
  if (isInstalled || dismissed || (!deferredPrompt && !isIosSafari)) {
    return null;
  }

  return (
    <>
      {/* Top Notification Install Banner */}
      <div className="bg-gradient-to-r from-[#075E54] to-[#128C7E] text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs z-20">
        <div className="flex items-center gap-2.5 truncate">
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-[#25D366]" />
          </div>
          <div className="truncate">
            <span className="font-bold tracking-tight">Install WhatsApp Monitor</span>
            <span className="hidden sm:inline text-emerald-100 ml-1.5 font-normal">
              — Add to home screen for fast mobile access and fullscreen monitoring
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[#075E54] font-bold text-xs shadow-xs hover:bg-emerald-50 active:scale-95 transition-all min-h-[36px] sm:min-h-[32px] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#075E54]" />
            <span>Install App</span>
          </button>

          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-white/10 text-emerald-100 hover:text-white transition-colors cursor-pointer"
            aria-label="Dismiss install prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iOS Safari Instructions Modal / Drawer */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl border border-gray-200 text-gray-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#075E54] text-white flex items-center justify-center font-bold text-xs">
                  <Smartphone className="w-4 h-4 text-[#25D366]" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Install on iPhone</h3>
                  <p className="text-[11px] text-gray-500">Safari Home Screen Installation</p>
                </div>
              </div>
              <button
                onClick={() => setShowIosGuide(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="text-xs text-gray-600 space-y-3 pl-1">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#075E54] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <span>
                  Tap the <strong className="text-gray-900 inline-flex items-center gap-1 mx-1"><Share className="w-3.5 h-3.5 text-[#075E54] inline" /> Share</strong> button in Safari toolbar.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#075E54] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <span>
                  Scroll down the share sheet and select <strong className="text-gray-900 inline-flex items-center gap-1 mx-1"><PlusSquare className="w-3.5 h-3.5 text-[#075E54] inline" /> Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#075E54] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <span>
                  Tap <strong className="text-gray-900">Add</strong> in the top right to complete installation.
                </span>
              </li>
            </ol>

            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2.5 rounded-lg bg-[#075E54] hover:bg-[#128C7E] text-white text-xs font-semibold min-h-[44px] transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

