const express = require('express');
const {
  connect,
  getStatus,
  getSyncStatus,
  getQRCode,
  refreshQRCode,
  disconnect,
} = require('../controllers/whatsappController');
const MessageHandler = require('../services/whatsapp/MessageHandler');
const {
  authenticateToken,
  createStreamTicket,
  verifyStreamTicket,
} = require('../middleware/authMiddleware');
const { validateUUIDParam } = require('../middleware/validateSalesperson');

const router = express.Router();

// Track active SSE client connections for memory management and leak prevention
const activeSSEClients = new Set();
const MAX_CONCURRENT_SSE_CLIENTS = 15;

/**
 * POST /api/whatsapp/live-stream/ticket
 * Generates a short-lived (2 min) scoped ticket for establishing an SSE live stream
 */
router.post('/live-stream/ticket', authenticateToken, (req, res) => {
  const ticket = createStreamTicket(req.user);
  return res.status(200).json({
    success: true,
    ticket,
    expiresInSeconds: 120, // 2 minutes
  });
});

/**
 * GET /api/whatsapp/live-stream
 * Real-time live update stream (Server-Sent Events) with heartbeat & auto-reconnect
 */
router.get('/live-stream', verifyStreamTicket, (req, res) => {
  // Prevent unbounded connection hoarding
  if (activeSSEClients.size >= MAX_CONCURRENT_SSE_CLIENTS) {
    return res.status(429).json({
      success: false,
      code: 'TOO_MANY_STREAMS',
      message: 'Too many concurrent live-stream connections. Please close unused tabs.',
    });
  }

  // Set SSE response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Inform EventSource client to auto-reconnect after 3000ms upon network drop
  res.write('retry: 3000\n\n');

  // Send initial connected handshake event
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  const clientId = `sse_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  activeSSEClients.add(clientId);

  const eventBus = MessageHandler.getEventBus();

  const onMessagePersisted = (persistedData) => {
    try {
      // Diagnostic Structured Log
      console.log(`[SSE Broadcast][${clientId}] Pushing new_message event for rep ${persistedData.salespersonId || persistedData.message?.salesperson_id}`);
      const payload = persistedData.type ? persistedData : { type: 'new_message', payload: persistedData };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Stream write error caught safely
    }
  };

  const onCustomerUpdated = (customerData) => {
    try {
      console.log(`[SSE Broadcast][${clientId}] Pushing customer_updated event for rep ${customerData.salespersonId}`);
      res.write(`data: ${JSON.stringify(customerData)}\n\n`);
    } catch {
      // Stream write error caught safely
    }
  };

  const onConnectionStatus = (statusData) => {
    try {
      console.log(`[SSE Broadcast][${clientId}] Pushing connection_status event for rep ${statusData.salespersonId}: ${statusData.status}`);
      res.write(`data: ${JSON.stringify(statusData)}\n\n`);
    } catch {
      // Stream write error caught safely
    }
  };

  const onSyncProgress = (progressData) => {
    try {
      console.log(`[SSE Broadcast][${clientId}] Pushing sync_progress event for rep ${progressData.salespersonId}: ${progressData.status}`);
      res.write(`data: ${JSON.stringify(progressData)}\n\n`);
    } catch {
      // Stream write error caught safely
    }
  };

  eventBus.on('message:persisted', onMessagePersisted);
  eventBus.on('customer:updated', onCustomerUpdated);
  eventBus.on('connection:status', onConnectionStatus);
  eventBus.on('sync:progress', onSyncProgress);

  // Keep connection open through intermediate proxies with periodic heartbeat comment
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    activeSSEClients.delete(clientId);
    eventBus.removeListener('message:persisted', onMessagePersisted);
    eventBus.removeListener('customer:updated', onCustomerUpdated);
    eventBus.removeListener('connection:status', onConnectionStatus);
    eventBus.removeListener('sync:progress', onSyncProgress);
  };

  req.on('close', cleanup);
  req.on('end', cleanup);
  res.on('error', cleanup);
});

// Enforce admin authentication on connection lifecycle endpoints
router.use(authenticateToken);

// WhatsApp connection lifecycle endpoints
router.post('/connect/:salespersonId', validateUUIDParam, connect);
router.get('/status/:salespersonId', validateUUIDParam, getStatus);
router.get('/sync-status/:salespersonId', validateUUIDParam, getSyncStatus);
router.get('/qr/:salespersonId', validateUUIDParam, getQRCode);
router.post('/refresh-qr/:salespersonId', validateUUIDParam, refreshQRCode);
router.post('/disconnect/:salespersonId', validateUUIDParam, disconnect);

module.exports = router;
