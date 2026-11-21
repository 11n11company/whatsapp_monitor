const express = require('express');
const db = require('../config/db');
const config = require('../config/env');
const ConnectionManager = require('../services/whatsapp/ConnectionManager');
const Migrator = require('../db/migrator');

const router = express.Router();

router.get('/health', async (req, res) => {
  const dbStatus = db.getStatus();
  const provider = ConnectionManager.getProvider();

  let schemaStatus = { verified: false, tablesCount: 0 };
  if (dbStatus.connected) {
    try {
      let verification = await Migrator.verifySchema();
      if (!verification.verified) {
        // Auto-remedy missing schema on live health check
        console.log('[Health Check] Tables missing. Triggering automated schema migration...');
        await Migrator.runMigrations();
        await Migrator.seedAdmin();
        verification = await Migrator.verifySchema();
      }
      schemaStatus = {
        verified: verification.verified,
        tablesCount: verification.existingTables.length,
        adminSeeded: verification.adminCount > 0,
      };
    } catch (err) {
      schemaStatus = { verified: false, error: err.message };
    }
  }

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
      schema: schemaStatus,
      ...(dbStatus.error && { error: dbStatus.error }),
    },
    version: '1.0.0',
  };

  res.status(200).json(healthData);
});

// Explicit migration trigger endpoint
router.post('/health/migrate', async (req, res) => {
  const dbStatus = db.getStatus();
  if (!dbStatus.connected) {
    return res.status(503).json({ success: false, message: 'Database not connected', error: dbStatus.error });
  }

  try {
    const migrationRes = await Migrator.runMigrations();
    const seedRes = await Migrator.seedAdmin();
    const verification = await Migrator.verifySchema();

    res.status(200).json({
      success: true,
      message: 'Schema migrations and admin seeding completed successfully.',
      migrationsApplied: migrationRes.applied,
      adminSeeded: seedRes.seeded,
      adminCount: seedRes.count,
      verification,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Migration failed', error: err.message });
  }
});

module.exports = router;
