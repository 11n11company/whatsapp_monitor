const fs = require('fs');
const path = require('path');
const pino = require('pino');
const baileys = require('@whiskeysockets/baileys');
const WhatsAppProvider = require('./WhatsAppProvider');
const { useEncryptedAuthState } = require('./encryptedAuthState');
const MessageHandler = require('./MessageHandler');
const WhatsAppSessionModel = require('../../models/whatsappSessionModel');
const SalespersonModel = require('../../models/salespersonModel');

const makeWASocket = baileys.default || baileys.makeWASocket;
const { DisconnectReason, Browsers, fetchLatestBaileysVersion } = baileys;

// Max automated reconnection attempts before marking session Disconnected
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * BaileysWhatsAppProvider
 * Production QR-based WhatsApp Web multi-device connection adapter.
 * Uses authenticated encryption at rest (AES-256-GCM) for all session credentials.
 */
class BaileysWhatsAppProvider extends WhatsAppProvider {
  constructor() {
    super('baileys');
    this.isDemo = false;
    this.storageRoot = path.resolve(__dirname, '../../../storage/sessions');

    // In-memory active socket sessions: Map<salespersonId, SessionContext>
    this.activeSessions = new Map();

    // Silent logger to avoid printing session credentials, private keys, or QR data
    this.logger = pino({ level: 'silent' });

    // Cache latest WhatsApp Web protocol version
    this.cachedVersion = null;
  }

  /**
   * Fetch and cache latest Baileys WhatsApp Web protocol version
   */
  async getLatestVersion() {
    if (this.cachedVersion) return this.cachedVersion;
    try {
      const versionPromise = fetchLatestBaileysVersion();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000));
      const { version } = await Promise.race([versionPromise, timeoutPromise]);
      this.cachedVersion = version;
      return version;
    } catch (err) {
      this.cachedVersion = [2, 3000, 1043857760];
      return this.cachedVersion;
    }
  }

  supportsQRRefresh() {
    return true;
  }

  /**
   * Get session storage directory for a specific salesperson
   * @param {string} salespersonId
   * @returns {string}
   */
  getSessionDir(salespersonId) {
    return path.join(this.storageRoot, salespersonId);
  }

  /**
   * Initiate a real WhatsApp connection workflow for a salesperson
   * @param {Object} salesperson
   */
  async initiateConnection(salesperson) {
    const { id: salespersonId, name: salespersonName, phone_number: salespersonPhone } = salesperson;

    // Check if an existing socket session is already open or connected
    const existing = this.activeSessions.get(salespersonId);
    if (existing && existing.status === 'Connected') {
      return {
        success: true,
        status: 'Connected',
        provider: 'baileys',
        isDemo: false,
        isRealConnection: true,
        qrCode: null,
        qrExpiresAt: null,
        syncStatus: existing.syncStatus || 'Connected',
        message: 'Session is already connected.',
      };
    }

    if (existing && existing.status === 'Waiting for QR Scan' && existing.qrCode) {
      const isExpired = existing.qrExpiresAt && Date.now() > new Date(existing.qrExpiresAt).getTime();
      if (!isExpired) {
        return {
          success: true,
          status: 'Waiting for QR Scan',
          provider: 'baileys',
          isDemo: false,
          isRealConnection: false,
          qrCode: existing.qrCode,
          qrExpiresAt: existing.qrExpiresAt,
          syncStatus: existing.syncStatus || 'Waiting for device pairing',
          message: 'Scan the QR code in WhatsApp (Linked Devices) to pair.',
        };
      }
    }

    // Clean up existing inactive/expired socket if present
    if (existing?.socket) {
      clearTimeout(existing.reconnectTimer);
      try {
        existing.socket.ev.removeAllListeners();
        existing.socket.end();
      } catch {
        // Silently close
      }
    }

    const sessionDir = this.getSessionDir(salespersonId);

    // Initialize AES-256-GCM encrypted multi-file auth state
    let authState = await useEncryptedAuthState(sessionDir);

    // If session credentials have any existing 'me' or incomplete keys but device is not connected,
    // clear session directory to initiate a clean QR pairing handshake.
    if (authState.state.creds?.me || !authState.state.creds?.noiseKey) {
      try {
        await authState.clearSession();
        authState = await useEncryptedAuthState(sessionDir);
      } catch (err) {
        console.warn(`[Baileys][${salespersonName}] Stale session cleanup notice:`, err.message);
      }
    }

    const sessionContext = {
      salespersonId,
      salespersonName,
      salespersonPhone,
      authState,
      socket: null,
      status: 'Initializing',
      syncStatus: 'Waiting for device pairing',
      syncProgress: {
        messagesProcessed: 0,
        customersDiscovered: 0,
        startDate: null,
        endDate: null,
        lastSyncAt: null,
        error: null,
      },
      provider: 'baileys',
      isDemo: false,
      isRealConnection: false,
      qrCode: null,
      qrExpiresAt: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      message: 'Initializing real WhatsApp Web connection...',
      onQRAvailable: null,
    };

    this.activeSessions.set(salespersonId, sessionContext);

    // Event-driven fast QR capture
    const qrWaitPromise = new Promise((resolve) => {
      sessionContext.onQRAvailable = (qr) => resolve(qr);
    });

    // Fast-path window: wait up to 1200ms for instant QR delivery; otherwise return Initializing without blocking
    const fastWindowPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1200));

    // Spawn the Baileys socket immediately
    await this.spawnSocket(sessionContext);

    // Race fast window against actual QR event
    await Promise.race([qrWaitPromise, fastWindowPromise]);

    return {
      success: true,
      status: sessionContext.status,
      provider: 'baileys',
      isDemo: false,
      isRealConnection: sessionContext.status === 'Connected',
      qrCode: sessionContext.qrCode,
      qrExpiresAt: sessionContext.qrExpiresAt,
      syncStatus: sessionContext.syncStatus,
      syncProgress: sessionContext.syncProgress,
      message: sessionContext.qrCode
        ? 'Pairing QR code generated successfully. Scan using WhatsApp Linked Devices.'
        : sessionContext.message,
    };
  }

  /**
   * Spawns the Baileys WASocket and wires event listeners
   * @param {Object} sessionContext
   */
  async spawnSocket(sessionContext) {
    const { salespersonId, salespersonName, salespersonPhone, authState } = sessionContext;

    try {
      const version = await this.getLatestVersion();
      const socket = makeWASocket({
        version,
        auth: authState.state,
        printQRInTerminal: false, // Security: Never print raw QR code in console logs
        logger: this.logger,     // Security: Suppress credential traces
        browser: Browsers.ubuntu('Desktop'),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: true,
        syncFullHistory: true, // Request full companion sync so phone sends message history
        shouldSyncHistoryMessage: () => true, // Accept all history sync payloads; backend applies the 72h cutoff
      });

      sessionContext.socket = socket;

      // Event: Save encrypted credentials when updated
      socket.ev.on('creds.update', async () => {
        try {
          await authState.saveCreds();
        } catch (err) {
          console.error(`[Baileys][${salespersonName}] Failed to save encrypted credentials:`, err.message);
        }
      });

      // Event: Connection lifecycle updates
      socket.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(sessionContext, update);
      });

      const handlerContext = { salespersonId, salespersonPhone, salespersonName, socket };

      // Event: History sync from mobile phone (Existing contacts, chats, messages, LID mappings)
      socket.ev.on('messaging-history.set', async (history) => {
        try {
          const msgCount = Array.isArray(history?.messages) ? history.messages.length : 0;
          const chatCount = Array.isArray(history?.chats) ? history.chats.length : 0;
          const contactCount = Array.isArray(history?.contacts) ? history.contacts.length : 0;
          console.log(
            `[Baileys][${salespersonName}] messaging-history.set event received: ${msgCount} messages, ${chatCount} chats, ${contactCount} contacts (syncType: ${history?.syncType})`
          );
          await MessageHandler.handleMessagingHistory(handlerContext, history);
        } catch (err) {
          console.error(`[Baileys][${salespersonName}] Error in messaging-history.set:`, err.message);
        }
      });

      // Event: Real-time Messages upsert (Live incoming & outgoing messages)
      socket.ev.on('messages.upsert', async (upsert) => {
        try {
          await MessageHandler.handleMessagesUpsert(handlerContext, upsert);
        } catch (err) {
          console.error(`[Baileys][${salespersonName}] Error in messages.upsert:`, err.message);
        }
      });

      // Event: Real-time Chats updates
      socket.ev.on('chats.upsert', async (chats) => {
        try {
          await MessageHandler.handleChatsUpsert(handlerContext, chats);
        } catch (err) {
          console.error(`[Baileys][${salespersonName}] Error in chats.upsert:`, err.message);
        }
      });

      socket.ev.on('chats.update', async (chats) => {
        try {
          await MessageHandler.handleChatsUpsert(handlerContext, chats);
        } catch (err) {
          console.error(`[Baileys][${salespersonName}] Error in chats.update:`, err.message);
        }
      });

      // Event: Real-time Contacts updates
      socket.ev.on('contacts.upsert', async (contacts) => {
        try {
          await MessageHandler.handleContactsUpsert(handlerContext, contacts);
        } catch (err) {
          console.error(`[Baileys][${salespersonName}] Error in contacts.upsert:`, err.message);
        }
      });

      socket.ev.on('contacts.update', async (contacts) => {
        try {
          await MessageHandler.handleContactsUpsert(handlerContext, contacts);
        } catch (err) {
          console.error(`[Baileys][${salespersonName}] Error in contacts.update:`, err.message);
        }
      });

      // Event: Group metadata creation and update
      socket.ev.on('groups.upsert', async (groups) => {
        try {
          await MessageHandler.handleGroupsUpdate(handlerContext, groups);
        } catch (err) {
          console.error(`[Baileys][${salespersonName}] Error in groups.upsert:`, err.message);
        }
      });

      socket.ev.on('groups.update', async (groups) => {
        try {
          await MessageHandler.handleGroupsUpdate(handlerContext, groups);
        } catch (err) {
          console.error(`[Baileys][${salespersonName}] Error in groups.update:`, err.message);
        }
      });

      // Event: WhatsApp LID-to-Phone mapping update
      socket.ev.on('lid-mapping.update', async (mapping) => {
        try {
          await MessageHandler.handleLidMappingUpdate(handlerContext, mapping);
        } catch (err) {
          console.error(`[Baileys][${salespersonName}] Error in lid-mapping.update:`, err.message);
        }
      });
    } catch (err) {
      console.error(`[Baileys][${salespersonName}] Socket spawn error:`, err.message);
      sessionContext.status = 'Error';
      sessionContext.message = `Failed to spawn connection socket: ${err.message}`;
      await this.syncDatabaseState(sessionContext);
    }
  }

  /**
   * Handles Baileys connection.update events
   * @param {Object} sessionContext
   * @param {Object} update
   */
  async handleConnectionUpdate(sessionContext, update) {
    const { connection, lastDisconnect, qr } = update;
    const { salespersonId, salespersonName } = sessionContext;
    const eventBus = MessageHandler.getEventBus();

    // 1. QR Code generated by WhatsApp
    if (qr) {
      sessionContext.status = 'Waiting for QR Scan';
      sessionContext.syncStatus = 'Waiting for device pairing';
      sessionContext.qrCode = qr;
      sessionContext.qrExpiresAt = new Date(Date.now() + 60 * 1000).toISOString();
      sessionContext.message = 'Scan the QR code in WhatsApp (Linked Devices) to pair.';
      await this.syncDatabaseState(sessionContext);

      // Instantly notify initiateConnection fast-path
      if (typeof sessionContext.onQRAvailable === 'function') {
        sessionContext.onQRAvailable(qr);
      }

      // Broadcast immediately via SSE
      eventBus.emit('connection:status', {
        type: 'connection_status',
        salespersonId,
        status: 'Waiting for QR Scan',
        syncStatus: 'Waiting for device pairing',
        qrCode: qr,
        qrExpiresAt: sessionContext.qrExpiresAt,
        message: sessionContext.message,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Connection established (Real WhatsApp Business device paired)
    if (connection === 'open') {
      console.log(`[Baileys] Successfully paired WhatsApp device for [${salespersonName}]`);
      sessionContext.status = 'Connected';
      sessionContext.syncStatus = 'Connected';
      sessionContext.isRealConnection = true;
      sessionContext.qrCode = null;
      sessionContext.qrExpiresAt = null;
      sessionContext.reconnectAttempts = 0;
      sessionContext.message = 'WhatsApp session active and monitored.';
      await this.syncDatabaseState(sessionContext, {
        lastConnectedAt: new Date().toISOString(),
      });

      eventBus.emit('connection:status', {
        type: 'connection_status',
        salespersonId,
        status: 'Connected',
        syncStatus: 'Connected',
        qrCode: null,
        qrExpiresAt: null,
        message: sessionContext.message,
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Connecting state
    if (connection === 'connecting') {
      if (sessionContext.status !== 'Waiting for QR Scan') {
        sessionContext.status = 'Connecting';
        sessionContext.message = 'Negotiating connection handshake with WhatsApp servers...';
        await this.syncDatabaseState(sessionContext);

        eventBus.emit('connection:status', {
          type: 'connection_status',
          salespersonId,
          status: 'Connecting',
          syncStatus: sessionContext.syncStatus,
          qrCode: sessionContext.qrCode,
          qrExpiresAt: sessionContext.qrExpiresAt,
          message: sessionContext.message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 4. Connection closed
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[Baileys][${salespersonName}] Connection closed. StatusCode: ${statusCode}. Reconnectable: ${shouldReconnect}`);

      if (statusCode === DisconnectReason.loggedOut) {
        // Logged out on device: purge session credentials
        sessionContext.status = 'Disconnected';
        sessionContext.syncStatus = 'Waiting for device pairing';
        sessionContext.isRealConnection = false;
        sessionContext.qrCode = null;
        sessionContext.qrExpiresAt = null;
        sessionContext.message = 'WhatsApp session was unlinked on the mobile device.';
        await sessionContext.authState.clearSession();
        await this.syncDatabaseState(sessionContext, {
          lastDisconnectedAt: new Date().toISOString(),
        });

        eventBus.emit('connection:status', {
          type: 'connection_status',
          salespersonId,
          status: 'Disconnected',
          syncStatus: 'Waiting for device pairing',
          qrCode: null,
          qrExpiresAt: null,
          message: sessionContext.message,
          timestamp: new Date().toISOString(),
        });
      } else if (shouldReconnect) {
        // If we already have a valid unexpired QR code waiting for scan, preserve Waiting for QR Scan status
        const hasValidQR = Boolean(
          sessionContext.qrCode &&
          sessionContext.qrExpiresAt &&
          Date.now() < new Date(sessionContext.qrExpiresAt).getTime()
        );

        if (sessionContext.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          sessionContext.reconnectAttempts += 1;
          const delay = Math.min(2000 * sessionContext.reconnectAttempts, 15000);

          if (!hasValidQR) {
            sessionContext.status = 'Connecting';
            sessionContext.message = `Connection interrupted. Reconnecting (attempt ${sessionContext.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`;
          }

          clearTimeout(sessionContext.reconnectTimer);
          sessionContext.reconnectTimer = setTimeout(async () => {
            console.log(`[Baileys][${salespersonName}] Reconnecting socket...`);
            // Clean up old socket before reconnecting
            if (sessionContext.socket) {
              try {
                sessionContext.socket.ev.removeAllListeners();
                sessionContext.socket.end();
              } catch {
                // Silently close
              }
            }
            await this.spawnSocket(sessionContext);
          }, delay);
        } else {
          if (hasValidQR) {
            sessionContext.status = 'QR Expired';
            sessionContext.message = 'QR code expired. Please refresh to pair.';
          } else {
            sessionContext.status = 'Error';
            sessionContext.message = 'Connection attempt timed out. Please click Refresh QR Code to retry.';
          }
          await this.syncDatabaseState(sessionContext);

          eventBus.emit('connection:status', {
            type: 'connection_status',
            salespersonId,
            status: sessionContext.status,
            syncStatus: sessionContext.syncStatus,
            qrCode: null,
            qrExpiresAt: null,
            message: sessionContext.message,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        sessionContext.status = 'Disconnected';
        sessionContext.message = 'Session closed.';
        await this.syncDatabaseState(sessionContext);

        eventBus.emit('connection:status', {
          type: 'connection_status',
          salespersonId,
          status: 'Disconnected',
          syncStatus: 'Waiting for device pairing',
          qrCode: null,
          qrExpiresAt: null,
          message: sessionContext.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Synchronizes active session context with PostgreSQL
   * @param {Object} sessionContext
   * @param {Object} [extra]
   */
  async syncDatabaseState(sessionContext, extra = {}) {
    const { salespersonId, status, provider, isDemo, qrCode, qrExpiresAt, message, syncStatus, syncProgress } = sessionContext;
    try {
      await WhatsAppSessionModel.upsertSession({
        salespersonId,
        status,
        provider,
        isDemo,
        qrCode,
        qrExpiresAt,
        errorMessage: status === 'Error' ? message : null,
        syncStatus: syncStatus || null,
        syncProgress: syncProgress || null,
        lastConnectedAt: extra.lastConnectedAt || null,
        lastDisconnectedAt: extra.lastDisconnectedAt || null,
      });

      await SalespersonModel.update(salespersonId, {
        connection_status: status,
      });
    } catch (err) {
      console.error(`[Baileys] DB state sync error for ${salespersonId}:`, err.message);
    }
  }

  /**
   * Get current connection status
   * @param {string} salespersonId
   */
  async getConnectionStatus(salespersonId) {
    const session = this.activeSessions.get(salespersonId);
    if (!session) {
      // Check database for persisted session state
      const dbSession = await WhatsAppSessionModel.findBySalespersonId(salespersonId);
      if (dbSession) {
        const isExpired = dbSession.qr_expires_at && Date.now() > new Date(dbSession.qr_expires_at).getTime();
        const effectiveStatus = isExpired && dbSession.status === 'Waiting for QR Scan' ? 'QR Expired' : dbSession.status;
        return {
          status: effectiveStatus,
          provider: 'baileys',
          isDemo: false,
          isRealConnection: dbSession.status === 'Connected',
          qrCode: isExpired ? null : dbSession.qr_code,
          qrExpiresAt: dbSession.qr_expires_at,
          syncStatus: dbSession.sync_status || 'Waiting for device pairing',
          syncProgress: dbSession.sync_progress || null,
          message: dbSession.error_message || 'Persisted session state loaded.',
        };
      }
      return {
        status: 'Not Connected',
        provider: 'baileys',
        isDemo: false,
        isRealConnection: false,
        qrCode: null,
        qrExpiresAt: null,
        syncStatus: 'Waiting for device pairing',
        syncProgress: null,
        message: 'No active WhatsApp session found for this salesperson.',
      };
    }

    // Check QR expiration
    if (session.status === 'Waiting for QR Scan' && session.qrExpiresAt) {
      if (Date.now() > new Date(session.qrExpiresAt).getTime()) {
        session.status = 'QR Expired';
        session.qrCode = null;
        session.message = 'Pairing QR code has expired. Please refresh.';
      }
    }

    return {
      status: session.status,
      provider: 'baileys',
      isDemo: false,
      isRealConnection: session.isRealConnection,
      qrCode: session.qrCode,
      qrExpiresAt: session.qrExpiresAt,
      syncStatus: session.syncStatus || 'Waiting for device pairing',
      syncProgress: session.syncProgress || null,
      message: session.message,
    };
  }

  /**
   * Retrieve current QR code
   * @param {string} salespersonId
   */
  async getQRCode(salespersonId) {
    const statusData = await this.getConnectionStatus(salespersonId);
    return {
      qrCode: statusData.qrCode,
      qrExpiresAt: statusData.qrExpiresAt,
      status: statusData.status,
      isExpired: statusData.status === 'QR Expired',
      isDemo: false,
      provider: 'baileys',
      message: statusData.message,
    };
  }

  /**
   * Refresh/Regenerate QR code
   * @param {string} salespersonId
   */
  async refreshQRCode(salespersonId) {
    const session = this.activeSessions.get(salespersonId);
    const salesperson = await SalespersonModel.findById(salespersonId);

    if (!salesperson) {
      throw new Error('Salesperson not found.');
    }

    // End active socket and re-initiate
    if (session?.socket) {
      try {
        session.socket.ev.removeAllListeners();
        session.socket.end();
      } catch {
        // Silently close
      }
    }

    return this.initiateConnection(salesperson);
  }

  /**
   * Disconnect and unbind session
   * @param {string} salespersonId
   */
  async disconnect(salespersonId) {
    const session = this.activeSessions.get(salespersonId);
    if (session) {
      clearTimeout(session.reconnectTimer);
      if (session.socket) {
        try {
          session.socket.ev.removeAllListeners();
          session.socket.end(new Error('Admin initiated disconnect'));
        } catch {
          // Silently close
        }
      }
      this.activeSessions.delete(salespersonId);
    }

    await WhatsAppSessionModel.markDisconnected(salespersonId);
    await SalespersonModel.update(salespersonId, {
      connection_status: 'Disconnected',
    });

    return {
      success: true,
      status: 'Disconnected',
      provider: 'baileys',
      isDemo: false,
      message: 'WhatsApp session disconnected by administrator.',
    };
  }

  /**
   * Recovers an existing salesperson session using stored encrypted credentials
   * @param {Object} salesperson
   * @returns {Promise<boolean>}
   */
  async recoverSession(salesperson) {
    const { id: salespersonId, name: salespersonName, phone_number: salespersonPhone } = salesperson;

    // Check if socket already exists and is active in memory to avoid duplicate sockets
    if (this.activeSessions.has(salespersonId)) {
      const existing = this.activeSessions.get(salespersonId);
      if (existing?.socket) {
        console.log(`[Baileys][${salespersonName}] Session already active in memory, skipping duplicate socket.`);
        return true;
      }
    }

    const sessionDir = this.getSessionDir(salespersonId);
    const credsFile = path.join(sessionDir, 'creds.enc');
    const legacyCredsFile = path.join(sessionDir, 'creds.json.enc');

    // If no encrypted credentials exist on disk, we cannot recover; mark Disconnected
    if (!fs.existsSync(credsFile) && !fs.existsSync(legacyCredsFile)) {
      console.log(`[Baileys][${salespersonName}] No credentials found on disk for recovery. Marking Disconnected.`);
      await this.syncDatabaseState({
        salespersonId,
        status: 'Disconnected',
        provider: 'baileys',
        isDemo: false,
        qrCode: null,
        qrExpiresAt: null,
        message: 'No credentials found for recovery. Please initiate a new connection.',
      });
      return false;
    }

    try {
      // Initialize AES-256-GCM encrypted auth state
      const authState = await useEncryptedAuthState(sessionDir);

      // Only attempt socket recovery if credentials represent a paired device
      if (!authState.state.creds?.me) {
        console.log(`[Baileys][${salespersonName}] Unpaired credentials found on disk. Marking Not Connected.`);
        await this.syncDatabaseState({
          salespersonId,
          status: 'Not Connected',
          provider: 'baileys',
          isDemo: false,
          qrCode: null,
          qrExpiresAt: null,
          message: 'Device not yet paired. Please initiate connection.',
        });
        return false;
      }

      const sessionContext = {
        salespersonId,
        salespersonName,
        salespersonPhone,
        authState,
        socket: null,
        status: 'Connecting',
        syncStatus: 'Connected',
        provider: 'baileys',
        isDemo: false,
        isRealConnection: false,
        qrCode: null,
        qrExpiresAt: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        message: 'Recovering WhatsApp session after backend restart...',
      };

      this.activeSessions.set(salespersonId, sessionContext);
      await this.spawnSocket(sessionContext);
      return true;
    } catch (err) {
      console.error(`[Baileys][${salespersonName}] Corrupt/invalid credentials during recovery:`, err.message);
      // Safe handling of corrupt credentials: do not crash server!
      await this.syncDatabaseState({
        salespersonId,
        status: 'Error',
        provider: 'baileys',
        isDemo: false,
        qrCode: null,
        qrExpiresAt: null,
        message: `Session recovery failed: ${err.message}`,
      });
      return false;
    }
  }

  /**
   * Recovers all active sessions found in PostgreSQL
   * @returns {Promise<{ recovered: number, total: number }>}
   */
  async recoverAllSessions() {
    const activeSessions = await WhatsAppSessionModel.findActiveSessions();
    if (!activeSessions || activeSessions.length === 0) {
      return { recovered: 0, total: 0 };
    }

    let recovered = 0;
    for (const session of activeSessions) {
      const salesperson = {
        id: session.salesperson_id,
        name: session.salesperson_name,
        phone_number: session.salesperson_phone,
        is_active: session.salesperson_is_active,
      };

      const success = await this.recoverSession(salesperson);
      if (success) recovered++;
    }

    return { recovered, total: activeSessions.length };
  }

  /**
   * Completely purge session socket and all session credentials on disk
   * @param {string} salespersonId
   */
  async purgeSession(salespersonId) {
    const session = this.activeSessions.get(salespersonId);
    if (session) {
      clearTimeout(session.reconnectTimer);
      if (session.socket) {
        try {
          session.socket.ev.removeAllListeners();
          session.socket.end();
        } catch {
          // Silently close
        }
      }
      this.activeSessions.delete(salespersonId);
    }

    const sessionDir = this.getSessionDir(salespersonId);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`[Baileys] Successfully purged session directory for salesperson: ${salespersonId}`);
      } catch (err) {
        console.error(`[Baileys] Failed to purge session directory for ${salespersonId}:`, err.message);
      }
    }
  }

  /**
   * Graceful shutdown of all active sockets
   */
  async shutdownAll() {
    console.log(`[Baileys] Shutting down ${this.activeSessions.size} active WhatsApp sockets...`);
    for (const [id, session] of this.activeSessions.entries()) {
      clearTimeout(session.reconnectTimer);
      if (session.socket) {
        try {
          session.socket.ev.removeAllListeners();
          session.socket.end();
        } catch {
          // Ignore
        }
      }
    }
    this.activeSessions.clear();
  }
}

module.exports = BaileysWhatsAppProvider;

