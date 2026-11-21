const Migrator = require('../db/migrator');
const db = require('../config/db');

async function main() {
  console.log('[Migration] Starting database migration for WhatsApp Monitor...');
  try {
    const conn = await db.testConnection();
    if (!conn.connected) {
      console.error('[Migration Error] Database connection failed:', conn.error);
      process.exit(1);
    }

    const res = await Migrator.runMigrations();
    console.log('[Migration Success] All pending migrations executed successfully:', res.applied);

    const verification = await Migrator.verifySchema().catch(() => null);
    if (verification) {
      console.log(`[Migration Verified] Tables verified: ${verification.existingTables.length} found, ${verification.missingTables.length} missing.`);
    }

    process.exit(0);
  } catch (err) {
    console.error('[Migration Fatal Error]:', err.message);
    process.exit(1);
  }
}

main();
