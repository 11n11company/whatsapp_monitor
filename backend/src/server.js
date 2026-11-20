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

  // Test database connection
  await db.testConnection();

  // Validate production security configuration
  const securityIssues = config.validateProductionConfig();
  if (securityIssues.length > 0) {
    console.warn('========================================================');
    console.warn('  PRODUCTION SECURITY NOTICE:');
    securityIssues.forEach((issue) => console.warn(`  - [WARN] ${issue}`));
    console.warn('========================================================');
  }

  // Recover active WhatsApp sessions across server restarts
  await ConnectionManager.recoverSessions().catch((err) => {
    console.error('[ConnectionManager] Session recovery warning:', err.message);
  });

  const server = app.listen(config.port, () => {
    console.log(`[Server] WhatsApp Monitor Backend running on http://localhost:${config.port}`);
    console.log(`[Server] Health check available at: http://localhost:${config.port}/api/health`);
    console.log('========================================================\n');
  });

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

