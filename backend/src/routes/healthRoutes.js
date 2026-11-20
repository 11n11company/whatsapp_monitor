const express = require('express');
const db = require('../config/db');
const config = require('../config/env');
const ConnectionManager = require('../services/whatsapp/ConnectionManager');

const router = express.Router();

router.get('/health', async (req, res) => {
  const dbStatus = db.getStatus();
  const provider = ConnectionManager.getProvider();

  const healthData = {
    status: 'ok',
    service: 'whatsapp-monitor-backend',
    phase: 'Phase 5 - Customer Management and WhatsApp Message Storage',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.env,
    whatsappProvider: {
      active: provider.name,
      isDemo: provider.isDemo,
      realWhatsAppConfigured: provider.name === 'baileys',
      encryption: 'AES-256-GCM authenticated encryption at rest',
      supportsQRRefresh: provider.supportsQRRefresh(),
      outgoingMessagingEnabled: false, // Strict read-only guarantee
    },
    database: {
      type: 'PostgreSQL',
      connected: dbStatus.connected,
      host: dbStatus.host,
      database: dbStatus.database,
      status: dbStatus.connected ? 'healthy' : 'disconnected (fallback ready)',
      ...(dbStatus.error && { error: dbStatus.error }),
    },
    version: '1.0.0',
  };

  res.status(200).json(healthData);
});

module.exports = router;

