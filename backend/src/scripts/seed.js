const Migrator = require('../db/migrator');
const db = require('../config/db');

async function main() {
  console.log('[Seed] Checking authorized admin user bootstrap...');
  try {
    const conn = await db.testConnection();
    if (!conn.connected) {
      console.error('[Seed Error] Database connection failed:', conn.error);
      process.exit(1);
    }

    const res = await Migrator.seedAdmin();
    if (res.seeded) {
      console.log('[Seed Success] Created default single authorized admin user.');
    } else {
      console.log(`[Seed Info] Admin account already exists (Count: ${res.count}). Skipping insertion.`);
    }

    process.exit(0);
  } catch (err) {
    console.error('[Seed Fatal Error]:', err.message);
    process.exit(1);
  }
}

main();
