// Prioritize IPv4 DNS lookups to prevent ENETUNREACH in IPv4-only container environments (e.g. Railway)
const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const app = require('./app');
const config = require('./config/env');
const db = require('./config/db');
const ConnectionManager = require('./services/whatsapp/ConnectionManager');

async function startServer() {
  console.log('========================================================');
  console.log('  WHATSAPP MONITOR - API SERVICE (PHASE 1)');
  console.log('========================================================');
  console.log(`Environment: ${config.env}`);
  console.log(`Configured Port: ${config.port}`);

  // Validate production security configuration
  const securityIssues = config.validateProductionConfig();
  if (securityIssues.length > 0) {
    console.warn('========================================================');
    console.warn('  PRODUCTION SECURITY NOTICE:');
    securityIssues.forEach((issue) => console.warn(`  - [WARN] ${issue}`));
    console.warn('========================================================');
  }

  // Start HTTP server immediately so cloud platforms (Railway, Render, AWS) never 502
  const server = app.listen(config.port, () => {
    console.log(`[Server] WhatsApp Monitor Backend running on http://localhost:${config.port}`);
    console.log(`[Server] Health check available at: http://localhost:${config.port}/api/health`);
    console.log('========================================================\n');
  });

  // Test database connection, ensure schema migrations & seed, and recover sessions
  try {
    const dbRes = await db.testConnection();
    if (dbRes.connected) {
      // Ensure all tables and pending migrations are executed before session recovery
      const Migrator = require('./db/migrator');
      try {
        await Migrator.runMigrations();
        await Migrator.seedAdmin();
        const verification = await Migrator.verifySchema();
        console.log(`[Server] Schema verified: ${verification.existingTables.length} tables present, admin seeded (count: ${verification.adminCount}).`);
      } catch (migErr) {
        console.error('[Server] Schema migration error on boot:', migErr.message);
      }

      // Recover active WhatsApp sessions across server restarts
      await ConnectionManager.recoverSessions().catch((err) => {
        console.error('[ConnectionManager] Session recovery warning:', err.message);
      });
    } else {
      console.warn(`[Server] Database not connected on boot: ${dbRes.error || 'Check DATABASE_URL'}`);
      console.log('[Server] Health endpoint /api/health is live and reporting status.');
    }
  } catch (err) {
    console.error('[Server] Database initialization warning:', err.message);
  }

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    console.log(`\n[Server] Received ${signal}. Closing HTTP server gracefully...`);
    await ConnectionManager.shutdown().catch((e) => console.error('[Shutdown Error]', e.message));
    server.close(async () => {
      console.log('[Server] HTTP server closed.');
      if (db.pool) {
        try {
          await db.pool.end();
          console.log('[Server] Database connection pool drained.');
        } catch (e) {
          console.error('[Server Error] Error closing DB pool:', e.message);
        }
      }
      process.exit(0);
    });

    // Force shutdown after 10s if dangling connections persist
    setTimeout(() => {
      console.error('[Server Error] Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[Fatal Error] Failed to bootstrap server:', err);
  process.exit(1);
});

