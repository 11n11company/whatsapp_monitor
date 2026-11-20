import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageSquare,
  Lock,
  Search,
  User,
  Sparkles,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  ChevronUp,
  Info,
  Shield,
  Eye,
  PanelRightClose,
  PanelRightOpen,
  Wifi,
  Users,
  X,
  ChevronLeft,
} from 'lucide-react';
import { salespersonsAPI, customersAPI, conversationsAPI, whatsappAPI } from '../services/api';
import MessageBubble from '../components/chat/MessageBubble';
import MediaViewerModal from '../components/chat/MediaViewerModal';

export default function ConversationsPage() {
  const [searchParams] = useSearchParams();
  const initialConvId = searchParams.get('conversationId');
  const initialSpId = searchParams.get('salespersonId');

  // Salesperson & Customer selection state
  const [salespersons, setSalespersons] = useState([]);
  const [selectedSalespersonId, setSelectedSalespersonId] = useState(initialSpId || '');
  const [salespersonStatus, setSalespersonStatus] = useState('Not Connected');
  const [syncStatus, setSyncStatus] = useState('Waiting for device pairing');
  const [syncProgress, setSyncProgress] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [activeCustomerId, setActiveCustomerId] = useState(null);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [activeConversationId, setActiveConversationId] = useState(initialConvId || null);

  // Mobile layout state: 'list' | 'chat'
  const [mobileView, setMobileView] = useState(initialConvId ? 'chat' : 'list');
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);

  // Messages & Pagination state (Default 20 messages for fast rendering)
  const [messages, setMessages] = useState([]);
  const [loadingSalespersons, setLoadingSalespersons] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messagePagination, setMessagePagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [error, setError] = useState(null);

  // UI Panels state for Desktop
  const [showDetailsPane, setShowDetailsPane] = useState(true);
  const [activeMediaModal, setActiveMediaModal] = useState({
    isOpen: false,
    mediaId: null,
    fileName: '',
    mimeType: '',
  });

  const chatContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isNearBottomRef = useRef(true);

  // Synchronized refs for stable SSE event subscriptions without reconnect thrashing
  const selectedSalespersonIdRef = useRef(selectedSalespersonId);
  const activeConversationIdRef = useRef(activeConversationId);
  const activeCustomerIdRef = useRef(activeCustomerId);

  useEffect(() => {
    selectedSalespersonIdRef.current = selectedSalespersonId;
  }, [selectedSalespersonId]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    activeCustomerIdRef.current = activeCustomerId;
  }, [activeCustomerId]);

  // 1. Fetch salespersons on mount
  useEffect(() => {
    const fetchSalespersons = async () => {
      try {
        setLoadingSalespersons(true);
        const res = await salespersonsAPI.getAll();
        if (res.success && Array.isArray(res.data)) {
          setSalespersons(res.data);
          if (!selectedSalespersonId && res.data.length > 0) {
            setSelectedSalespersonId(res.data[0].id);
          }
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load salespersons list.');
      } finally {
        setLoadingSalespersons(false);
      }
    };

    fetchSalespersons();
  }, []);

  // 2. Fetch customers when salesperson changes
  useEffect(() => {
    if (!selectedSalespersonId) return;

    // Reset customer and message selection when salesperson changes
    setActiveCustomerId(null);
    setActiveCustomer(null);
    setActiveConversationId(null);
    setMessages([]);
    setMobileView('list');
    setMobileDetailsOpen(false);

    const fetchCustomers = async () => {
      try {
        setLoadingCustomers(true);
        setError(null);
        const res = await customersAPI.getBySalesperson(selectedSalespersonId, {
          search: customerSearch,
        });

        if (res.success && Array.isArray(res.data)) {
          setCustomers(res.data);

          // If initial conversationId was passed in URL, locate matching customer
          if (initialConvId) {
            const found = res.data.find((c) => c.conversation_id === initialConvId);
            if (found) {
              setActiveCustomerId(found.id);
              setActiveCustomer(found);
              setActiveConversationId(found.conversation_id);
              setMobileView('chat');
              return;
            }
          }

          // Otherwise on desktop select first customer if available
          if (res.data.length > 0 && res.data[0].conversation_id && window.innerWidth >= 1024) {
            setActiveCustomerId(res.data[0].id);
            setActiveCustomer(res.data[0]);
            setActiveConversationId(res.data[0].conversation_id);
          }
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch customer conversations.');
      } finally {
        setLoadingCustomers(false);
      }
    };

    const timer = setTimeout(fetchCustomers, 200);
    return () => clearTimeout(timer);
  }, [selectedSalespersonId, customerSearch]);

  // Fetch salesperson status & sync telemetry
  const fetchStatus = useCallback(() => {
    if (!selectedSalespersonId) return;
    whatsappAPI
      .getStatus(selectedSalespersonId)
      .then((res) => {
        if (res.success && res.data) {
          setSalespersonStatus(res.data.status);
          setSyncStatus(res.data.syncStatus || 'Waiting for device pairing');
          setSyncProgress(res.data.syncProgress || null);
        }
      })
      .catch(() => {});
  }, [selectedSalespersonId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // 3. Fetch conversation messages (Latest 20 messages first)
  const fetchMessages = useCallback(async () => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    try {
      setLoadingMessages(true);
      setError(null);
      const res = await conversationsAPI.getMessages(activeConversationId, {
        page: 1,
        limit: 20,
        salespersonId: selectedSalespersonId,
      });

      if (res.success && Array.isArray(res.data)) {
        setMessages(res.data);
        if (res.pagination) {
          setMessagePagination(res.pagination);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load messages.');
    } finally {
      setLoadingMessages(false);
    }
  }, [activeConversationId, selectedSalespersonId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Handle app resume from background (visibilitychange)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
        if (activeConversationIdRef.current) {
          fetchMessages();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchStatus, fetchMessages]);

  // 4. Scroll tracking with upward load-older trigger
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 120;

    // Upward scroll detection: fetch older messages when scrolled near top
    if (scrollTop < 30 && !loadingOlder && messagePagination.page < messagePagination.totalPages) {
      handleLoadOlder();
    }
  };

  // Scroll down smoothly on initial message load or when near bottom
  useEffect(() => {
    if (isNearBottomRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 5. Load older messages with scroll position retention (pagination)
  const handleLoadOlder = async () => {
    if (!activeConversationId || loadingOlder || messagePagination.page >= messagePagination.totalPages) {
      return;
    }

    const scrollContainer = chatContainerRef.current;
    const prevScrollHeight = scrollContainer ? scrollContainer.scrollHeight : 0;

    try {
      setLoadingOlder(true);
      const nextPage = messagePagination.page + 1;
      const res = await conversationsAPI.getMessages(activeConversationId, {
        page: nextPage,
        limit: messagePagination.limit,
        salespersonId: selectedSalespersonId,
      });

      if (res.success && Array.isArray(res.data)) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const uniqueOlder = res.data.filter((m) => !existingIds.has(m.id));
          return [...uniqueOlder, ...prev];
        });

        if (res.pagination) {
          setMessagePagination((prev) => ({ ...prev, page: nextPage }));
        }

        requestAnimationFrame(() => {
          if (scrollContainer) {
            const newScrollHeight = scrollContainer.scrollHeight;
            scrollContainer.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  };

  // 6. Real-time Live Updates via SSE (Server-Sent Events) with automatic reconnection
  useEffect(() => {
    let eventSource = null;
    let reconnectTimeout = null;
    let isMounted = true;
    let reconnectAttempts = 0;

    const setupSSE = async () => {
      try {
        let ticket = null;
        try {
          const ticketRes = await whatsappAPI.getStreamTicket();
          if (ticketRes.success && ticketRes.ticket) {
            ticket = ticketRes.ticket;
          }
        } catch {
          // Direct fallback
        }

        if (!isMounted) return;

        const sseUrl = whatsappAPI.getLiveStreamUrl(ticket);
        eventSource = new EventSource(sseUrl);

        eventSource.onopen = () => {
          reconnectAttempts = 0;
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'new_message') {
              const customer = data.data?.customer || data.customer || data.payload?.customer;
              const conversation = data.data?.conversation || data.conversation || data.payload?.conversation;
              const message = data.data?.message || data.message || data.payload?.message;
              const repId = data.salespersonId || customer?.salesperson_id;

              if (repId && repId === selectedSalespersonIdRef.current) {
                if (customer && conversation) {
                  setCustomers((prev) => {
                    const idx = prev.findIndex((c) => c.id === customer.id);
                    if (idx !== -1) {
                      const updated = [...prev];
                      updated[idx] = {
                        ...updated[idx],
                        ...customer,
                        last_message_at: conversation.last_message_at,
                        last_message_preview: conversation.last_message_preview,
                      };
                      const [item] = updated.splice(idx, 1);
                      return [item, ...updated];
                    } else {
                      return [
                        {
                          ...customer,
                          conversation_id: conversation.id,
                          last_message_at: conversation.last_message_at,
                          last_message_preview: conversation.last_message_preview,
                        },
                        ...prev,
                      ];
                    }
                  });
                }

                if (
                  activeConversationIdRef.current &&
                  conversation &&
                  conversation.id === activeConversationIdRef.current &&
                  message
                ) {
                  setMessages((prev) => {
                    if (
                      prev.some(
                        (m) =>
                          m.id === message.id ||
                          (message.whatsapp_message_id && m.whatsapp_message_id === message.whatsapp_message_id)
                      )
                    ) {
                      return prev;
                    }
                    return [...prev, message];
                  });
                }
              }
            }

            if (data.type === 'customer_updated') {
              const updatedCustomer = data.data || data.payload;
              const repId = data.salespersonId || updatedCustomer?.salesperson_id;

              if (repId && repId === selectedSalespersonIdRef.current && updatedCustomer) {
                setCustomers((prev) =>
                  prev.map((c) => (c.id === updatedCustomer.id ? { ...c, ...updatedCustomer } : c))
                );

                if (activeCustomerIdRef.current === updatedCustomer.id) {
                  setActiveCustomer((prev) => (prev ? { ...prev, ...updatedCustomer } : prev));
                }
              }
            }

            if (data.type === 'connection_status') {
              const repId = data.salespersonId;
              if (repId && repId === selectedSalespersonIdRef.current) {
                setSalespersonStatus(data.status);
                if (data.syncStatus) setSyncStatus(data.syncStatus);
              }
            }

            if (data.type === 'sync_progress') {
              const repId = data.salespersonId;
              if (repId && repId === selectedSalespersonIdRef.current) {
                setSyncStatus(data.status);
                if (data.progress) setSyncProgress(data.progress);
              }
            }
          } catch {
            // Ignore parse errors / heartbeat
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (isMounted) {
            reconnectAttempts++;
            const delay = Math.min(10000, 1500 * Math.pow(1.5, reconnectAttempts));
            reconnectTimeout = setTimeout(setupSSE, delay);
          }
        };
      } catch {
        if (isMounted) {
          reconnectTimeout = setTimeout(setupSSE, 3000);
        }
      }
    };

    setupSSE();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }, []);

  const selectedSalesperson = useMemo(
    () => salespersons.find((s) => s.id === selectedSalespersonId),
    [salespersons, selectedSalespersonId]
  );

  const chatMediaList = useMemo(
    () => messages.filter((m) => Boolean(m.media_id)),
    [messages]
  );

  // Helper for customer display name
  const getCustomerDisplayName = (c) => {
    if (!c) return 'Unknown Contact';
    const isGroup = c.contact_type === 'group' || c.whatsapp_id?.endsWith('@g.us');
    if (isGroup) {
      if (c.group_subject && !c.group_subject.includes('@')) return c.group_subject;
      if (c.display_name && !c.display_name.includes('@')) return c.display_name;
      return 'WhatsApp Group';
    }
    if (c.display_name && !c.display_name.includes('@') && c.display_name !== c.phone_number) {
      return c.display_name;
    }
    return c.phone_number || 'Unknown Contact';
  };

  // Details pane content component (shared between desktop right column and mobile drawer)
  const renderCustomerDetailsContent = (customer) => {
    if (!customer) {
      return (
        <div className="p-8 text-center text-gray-400 text-xs">
          Select a customer to view contact details and media.
        </div>
      );
    }

    const isGroup = customer.contact_type === 'group' || customer.whatsapp_id?.endsWith('@g.us');
    const isLid = customer.whatsapp_id?.endsWith('@lid');
    const primaryName = getCustomerDisplayName(customer);

    return (
      <div className="p-4 space-y-5 text-xs">
        {/* Profile Card */}
        <div className="flex flex-col items-center text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
          <div
            className={`w-16 h-16 rounded-full text-white flex items-center justify-center font-bold text-lg mb-2 shadow-xs ${
              isGroup ? 'bg-amber-600' : 'bg-[#075E54]'
            }`}
          >
            {isGroup ? <Users className="w-8 h-8" /> : primaryName.slice(0, 2).toUpperCase()}
          </div>
          <h3 className="font-bold text-sm text-gray-900 break-words max-w-full">
            {primaryName}
          </h3>
          <p className="text-gray-500 font-mono text-[11px] mt-0.5">
            {isGroup ? 'Group Conversation' : customer.phone_number || 'No phone recorded'}
          </p>
        </div>

        {/* Metadata List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-gray-500">Thread Type</span>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white border border-gray-200">
              {isGroup ? 'WhatsApp Group' : isLid ? 'LID Contact' : 'Direct Contact'}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-gray-500">WhatsApp Identifier</span>
            <span className="font-mono text-[10px] text-gray-800 font-semibold truncate max-w-[140px]" title={customer.whatsapp_id}>
              {customer.whatsapp_id}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-gray-500">First Contacted</span>
            <span className="text-gray-800 font-semibold">
              {customer.created_at ? new Date(customer.created_at).toLocaleDateString() : 'N/A'}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-gray-500">Logged Messages</span>
            <span className="font-mono text-gray-800 font-bold">
              {messagePagination.total}
            </span>
          </div>
        </div>

        {/* Monitored Salesperson Card */}
        <div className="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/50">
          <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block mb-1">
            Assigned Salesperson
          </span>
          <div className="font-bold text-xs text-gray-900">
            {selectedSalesperson?.name}
          </div>
          <div className="text-[11px] font-mono text-gray-600 mt-0.5">
            {selectedSalesperson?.phone_number}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
            <Wifi className="w-3 h-3 text-[#25D366]" />
            <span>Status: {selectedSalesperson?.connection_status || 'Active'}</span>
          </div>
        </div>

        {/* Media Attachments in Chat */}
        <div className="space-y-2">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">
            Shared Media ({chatMediaList.length})
          </span>
          {chatMediaList.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic">No media shared in this thread.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {chatMediaList.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setActiveMediaModal({
                      isOpen: true,
                      mediaId: m.media_id,
                      fileName: m.media_file_name || 'media',
                      mimeType: m.media_mime_type || 'application/octet-stream',
                    })
                  }
                  className="w-full text-left p-2 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-100 flex items-center justify-between gap-2 transition-colors cursor-pointer min-h-[38px]"
                >
                  <div className="flex items-center gap-2 truncate">
                    {m.message_type === 'image' && <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                    {m.message_type === 'video' && <VideoIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                    {m.message_type === 'audio' && <Music className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                    {m.message_type === 'document' && <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                    <span className="text-[11px] text-gray-700 font-medium truncate">
                      {m.media_file_name || `${m.message_type} file`}
                    </span>
                  </div>
                  <Eye className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Read-Only Notice */}
        <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-start gap-2 text-[10px] text-gray-500">
          <Shield className="w-4 h-4 text-[#075E54] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Read-Only Oversight:</strong> Real-time conversation monitoring without message composition.
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3.5 animate-fadeIn">
      {/* Top Controls Header */}
      <div className="bg-white rounded-xl border border-gray-200/80 p-3.5 sm:p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#075E54]/10 text-[#075E54] shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight truncate">
                Conversations
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                Read-Only
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 truncate hidden sm:block">
              Monitor customer communications and chat history across your sales team.
            </p>
          </div>
        </div>

        {/* Global Rep Selector */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-semibold text-gray-500 whitespace-nowrap shrink-0">
            Rep:
          </span>
          <select
            value={selectedSalespersonId}
            onChange={(e) => {
              const newSpId = e.target.value;
              if (newSpId === selectedSalespersonId) return;
              setSelectedSalespersonId(newSpId);
              setCustomers([]);
              setMessages([]);
              setActiveCustomerId(null);
              setActiveCustomer(null);
              setActiveConversationId(null);
              setCustomerSearch('');
              setMobileView('list');
              setMobileDetailsOpen(false);
            }}
            disabled={loadingSalespersons || salespersons.length === 0}
            className="w-full md:w-auto pl-3 pr-8 py-2 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#075E54]/30 focus:border-[#075E54] cursor-pointer min-h-[40px] sm:min-h-[36px]"
          >
            {salespersons.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name} ({sp.phone_number})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Operational Status & Background Sync Telemetry Bar */}
      {selectedSalesperson && (
        <div className="bg-emerald-50/60 rounded-xl border border-emerald-200/80 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 font-semibold text-gray-800">
              <span
                className={`w-2 h-2 rounded-full ${
                  salespersonStatus === 'Connected'
                    ? 'bg-[#25D366] animate-pulse'
                    : salespersonStatus === 'Waiting for QR Scan'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-gray-400'
                }`}
              />
              <span>{salespersonStatus}</span>
            </div>

            {salespersonStatus === 'Connected' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 bg-white px-2 py-0.5 rounded-full border border-emerald-300">
                <Wifi className="w-3 h-3 text-[#25D366]" />
                <span className="hidden sm:inline">Live Monitoring Active</span>
                <span className="sm:hidden">Live</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-gray-600 text-[11px] truncate">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="font-semibold text-gray-800 hidden sm:inline">3-Day Sync:</span>
            <span className="text-emerald-950 font-medium truncate">{syncStatus}</span>
            {syncProgress && (
              <span className="text-gray-500 hidden md:inline">
                ({syncProgress.messagesProcessed || 0} msgs • {syncProgress.customersDiscovered || 0} contacts)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs font-semibold text-rose-700 hover:underline min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* RESPONSIVE CONVERSATIONS WORKSPACE CONTAINER              */}
      {/* Mobile: Full-width switches between List and Chat         */}
      {/* Desktop (lg:): Three simultaneous side-by-side columns    */}
      {/* ========================================================= */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden flex flex-col lg:flex-row h-[calc(100dvh-220px)] min-h-[520px] max-h-[820px]">
        {/* ========================================================= */}
        {/* SECTION 1: CONVERSATION LIST (Mobile & Desktop)           */}
        {/* ========================================================= */}
        <div
          className={`w-full lg:w-80 lg:shrink-0 border-r border-gray-200 flex-col bg-white ${
            mobileView === 'list' ? 'flex flex-1' : 'hidden lg:flex'
          }`}
        >
          {/* Search bar */}
          <div className="p-3 border-b border-gray-100 bg-gray-50/70 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers or phone..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-200 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#075E54]/30 focus:border-[#075E54] min-h-[40px] sm:min-h-[36px]"
              />
            </div>
          </div>

          {/* Customer threads header */}
          <div className="px-4 py-2.5 bg-gray-50/40 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500 shrink-0">
            <span className="font-semibold text-gray-600">Customer Contacts</span>
            <span className="text-[11px] font-mono font-bold text-gray-400">
              {customers.length} chats
            </span>
          </div>

          {/* Customer list items */}
          <div className="divide-y divide-gray-100 overflow-y-auto flex-1">
            {loadingCustomers ? (
              <div className="p-10 flex flex-col items-center justify-center gap-2">
                <div className="w-6 h-6 border-2 border-emerald-200 border-t-[#075E54] rounded-full animate-spin" />
                <span className="text-xs text-gray-400">Loading customers...</span>
              </div>
            ) : customers.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs leading-relaxed">
                <User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                No customer interactions recorded yet for {selectedSalesperson?.name || 'this rep'}.
              </div>
            ) : (
              customers.map((c) => {
                const isSelected = activeCustomerId === c.id;
                const formattedTime = c.last_message_at
                  ? new Date(c.last_message_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '';

                const isGroup = c.contact_type === 'group' || c.whatsapp_id?.endsWith('@g.us');
                const isLid = c.whatsapp_id?.endsWith('@lid');
                const primaryName = getCustomerDisplayName(c);

                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveCustomerId(c.id);
                      setActiveCustomer(c);
                      setActiveConversationId(c.conversation_id);
                      setMobileView('chat'); // Automatically open chat full screen on mobile
                    }}
                    className={`w-full text-left p-3.5 transition-colors cursor-pointer block border-l-4 min-h-[58px] ${
                      isSelected
                        ? 'bg-emerald-50/80 border-[#075E54]'
                        : 'border-transparent hover:bg-gray-50 active:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            isGroup ? 'bg-amber-100 text-amber-800' : 'bg-[#075E54]/10 text-[#075E54]'
                          }`}
                        >
                          {isGroup ? <Users className="w-3.5 h-3.5" /> : primaryName.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-bold text-xs text-gray-900 truncate">
                          {primaryName}
                        </span>
                      </div>
                      {formattedTime && (
                        <span className="text-[10px] font-medium text-gray-400 shrink-0">
                          {formattedTime}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 font-mono mb-1">
                      <span className="truncate">
                        {isGroup ? 'Group Conversation' : c.phone_number || 'Direct Message'}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-semibold shrink-0 ${
                          isGroup
                            ? 'bg-amber-50 text-amber-700 border border-amber-200/50'
                            : isLid
                            ? 'bg-blue-50 text-blue-700 border border-blue-200/50'
                            : 'bg-gray-100 text-gray-600 border border-gray-200/50'
                        }`}
                      >
                        {isGroup ? 'Group' : isLid ? 'LID' : 'Direct'}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 truncate italic">
                      {c.last_message_preview ? `"${c.last_message_preview}"` : 'No messages'}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* SECTION 2: CHAT VIEWER (Mobile Full-Screen & Desktop Flex) */}
        {/* ========================================================= */}
        <div
          className={`flex-1 flex-col bg-[#EFEAE2] min-w-0 ${
            mobileView === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Chat Header */}
          <div className="h-16 px-3 sm:px-4 bg-[#F0F2F5] border-b border-gray-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 truncate min-w-0">
              {/* Mobile Back Button to return to conversation list */}
              <button
                type="button"
                onClick={() => setMobileView('list')}
                className="lg:hidden min-w-[44px] min-h-[44px] -ml-1 flex items-center justify-center rounded-lg text-gray-700 hover:bg-gray-200/70 active:bg-gray-300 transition-colors cursor-pointer"
                aria-label="Back to conversation list"
              >
                <ChevronLeft className="w-6 h-6 text-gray-700" />
              </button>

              {activeCustomer ? (
                (() => {
                  const isGroup = activeCustomer.contact_type === 'group' || activeCustomer.whatsapp_id?.endsWith('@g.us');
                  const isLid = activeCustomer.whatsapp_id?.endsWith('@lid');
                  const primaryName = getCustomerDisplayName(activeCustomer);

                  return (
                    <div className="flex items-center gap-2.5 truncate min-w-0">
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 ${
                          isGroup ? 'bg-amber-100 text-amber-800' : 'bg-[#075E54]/10 text-[#075E54]'
                        }`}
                      >
                        {isGroup ? <Users className="w-4 h-4 sm:w-5 sm:h-5" /> : primaryName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="truncate min-w-0">
                        <div className="flex items-center gap-1.5 truncate">
                          <h3 className="font-bold text-xs sm:text-sm text-gray-900 truncate">
                            {primaryName}
                          </h3>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-semibold shrink-0 ${
                              isGroup ? 'bg-amber-100 text-amber-800' : isLid ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {isGroup ? 'Group' : isLid ? 'LID' : 'Direct'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 truncate">
                          <span className="font-mono text-gray-600 truncate">
                            {isGroup ? activeCustomer.whatsapp_id : activeCustomer.phone_number || activeCustomer.whatsapp_id}
                          </span>
                          <span className="hidden sm:inline">•</span>
                          <span className="text-emerald-800 font-medium truncate hidden sm:inline">
                            Rep: {selectedSalesperson?.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-xs text-gray-500 italic">
                  Select a customer thread to inspect conversation.
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Live Updates
              </span>

              {/* Mobile Info Button (Opens Customer Details Drawer on Mobile) */}
              {activeCustomer && (
                <button
                  type="button"
                  onClick={() => setMobileDetailsOpen(true)}
                  className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
                  title="View Customer Details"
                  aria-label="View Customer Details"
                >
                  <Info className="w-4 h-4 text-[#075E54]" />
                </button>
              )}

              {/* Desktop Toggle Details Pane Button */}
              <button
                type="button"
                onClick={() => setShowDetailsPane(!showDetailsPane)}
                className="hidden lg:flex p-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer min-h-[36px] min-w-[36px] items-center justify-center"
                title={showDetailsPane ? 'Hide Details' : 'Show Details'}
                aria-label="Toggle details pane"
              >
                {showDetailsPane ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Chat Message Scrollable Viewport */}
          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3"
          >
            {/* Top Security & Encryption Notice */}
            <div className="text-center my-1">
              <span className="bg-white/90 text-gray-600 text-[10px] px-3 py-1 rounded-full shadow-2xs uppercase tracking-wider font-semibold border border-gray-200/80 inline-flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-[#075E54]" />
                Secure session • Read-only viewer
              </span>
            </div>

            {/* Load older messages button if available */}
            {messagePagination.page < messagePagination.totalPages && (
              <div className="text-center pt-1 pb-2">
                <button
                  type="button"
                  onClick={handleLoadOlder}
                  disabled={loadingOlder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-gray-700 text-xs font-semibold border border-gray-300 shadow-2xs hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer min-h-[36px]"
                >
                  <ChevronUp className={`w-3.5 h-3.5 ${loadingOlder ? 'animate-spin' : ''}`} />
                  <span>{loadingOlder ? 'Loading older...' : 'Load older messages'}</span>
                </button>
              </div>
            )}

            {loadingMessages ? (
              <div className="p-16 flex flex-col items-center justify-center gap-2">
                <div className="w-8 h-8 border-3 border-emerald-200 border-t-[#075E54] rounded-full animate-spin" />
                <span className="text-xs text-gray-500">Loading conversation history...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="p-12 sm:p-16 text-center text-gray-500 text-xs leading-relaxed max-w-sm mx-auto">
                <MessageSquare className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                No messages logged yet in this thread. Incoming and outgoing messages will appear here in real-time as they occur.
              </div>
            ) : (
              messages.map((msg, index) => {
                const currentDate = new Date(msg.message_timestamp).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                const prevDate =
                  index > 0
                    ? new Date(messages[index - 1].message_timestamp).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : null;
                const showDateSeparator = currentDate !== prevDate;

                return (
                  <React.Fragment key={msg.id}>
                    {showDateSeparator && (
                      <div className="text-center my-3">
                        <span className="bg-white/80 text-gray-600 text-[10px] font-semibold px-2.5 py-0.5 rounded-md shadow-2xs border border-gray-200">
                          {currentDate}
                        </span>
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      repName={selectedSalesperson?.name}
                      customerName={getCustomerDisplayName(activeCustomer)}
                      onOpenMedia={(mediaInfo) =>
                        setActiveMediaModal({
                          isOpen: true,
                          mediaId: mediaInfo.mediaId,
                          fileName: mediaInfo.fileName,
                          mimeType: mediaInfo.mimeType,
                        })
                      }
                    />
                  </React.Fragment>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Strict Read-Only Footer Banner */}
          <div className="p-2.5 sm:p-3 bg-[#F0F2F5] border-t border-gray-200 flex items-center justify-between text-xs text-gray-500 shrink-0">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#075E54] shrink-0" />
              <span className="font-semibold text-gray-700">
                Read-Only Mode:
              </span>
              <span className="text-gray-500 hidden sm:inline">
                Direct message composition, replying, and editing are disabled by design.
              </span>
              <span className="text-gray-500 sm:hidden text-[11px]">
                Monitoring only
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* SECTION 3: DESKTOP DETAILS COLUMN (lg: visible)           */}
        {/* ========================================================= */}
        {showDetailsPane && (
          <div className="hidden lg:flex w-72 lg:w-80 border-l border-gray-200 bg-white flex-col overflow-y-auto shrink-0 animate-fadeIn">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#075E54]" />
                <span>Contact Details</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowDetailsPane(false)}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
                aria-label="Close contact details"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>

            {renderCustomerDetailsContent(activeCustomer)}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MOBILE CUSTOMER DETAILS MODAL / SLIDE-OVER DRAWER          */}
      {/* ========================================================= */}
      {mobileDetailsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs lg:hidden animate-fadeIn">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 w-full sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-slideUp">
            {/* Modal Header */}
            <div className="h-14 px-4 bg-[#075E54] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#25D366]" />
                <h3 className="font-bold text-sm">Customer Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setMobileDetailsOpen(false)}
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-lg text-emerald-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 pb-4">
              {renderCustomerDetailsContent(activeCustomer)}
            </div>
          </div>
        </div>
      )}

      {/* Media Lightbox Viewer Modal */}
      <MediaViewerModal
        isOpen={activeMediaModal.isOpen}
        mediaId={activeMediaModal.mediaId}
        fileName={activeMediaModal.fileName}
        mimeType={activeMediaModal.mimeType}
        onClose={() =>
          setActiveMediaModal({
            isOpen: false,
            mediaId: null,
            fileName: '',
            mimeType: '',
          })
        }
      />
    </div>
  );
}
