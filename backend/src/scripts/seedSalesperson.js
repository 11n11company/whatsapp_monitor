const { Pool } = require('pg');
const config = require('../config/env');

async function seed() {
  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  });

  try {
    await pool.query(`
      INSERT INTO salespersons (id, name, phone_number, is_active, connection_status)
      VALUES ($1, $2, $3, true, 'Not Connected')
      ON CONFLICT (id) DO UPDATE SET is_active = true;
    `, ['5358e311-eaf5-4708-871c-e27dcd8baba0', 'mohammed', '+859165987']);
    console.log('[Seed] Successfully ensured salesperson mohammed in PostgreSQL!');
  } catch (err) {
    console.error('[Seed Error]:', err.message);
  } finally {
    await pool.end();
  }
}

seed();

