const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('../config/env');

async function runSeed() {
  console.log('[Seed] Seeding initial authorized admin user...');

  const pool = new Pool(
    config.db.url
      ? { connectionString: config.db.url, ssl: config.db.ssl }
      : {
          host: config.db.host,
          port: config.db.port,
          database: config.db.database,
          user: config.db.user,
          password: config.db.password,
          ssl: config.db.ssl,
        }
  );

  let client;
  try {
    client = await pool.connect();
    console.log(`[Seed] Connected to PostgreSQL on ${config.db.host}:${config.db.port}/${config.db.database}`);

    // Check if an admin already exists (Rule: Only one authorized admin account)
    const countRes = await client.query('SELECT COUNT(*) AS count FROM admin_users WHERE role = $1', ['admin']);
    const adminCount = parseInt(countRes.rows[0]?.count || '0', 10);

    if (adminCount > 0) {
      console.log(`[Seed Info] Admin account already exists (Count: ${adminCount}). Respecting single-admin rule; skipping insertion.`);
      return;
    }

    const { username, password, email, fullName } = config.adminSeed;
    console.log(`[Seed] Hashing password for admin "${username}" using bcrypt (salt rounds: 10)...`);
    const passwordHash = await bcrypt.hash(password, 10);

    const insertSql = `
      INSERT INTO admin_users (username, password_hash, email, full_name, role, is_active)
      VALUES ($1, $2, $3, $4, 'admin', true)
      RETURNING id, username, email, full_name, role, created_at;
    `;

    const res = await client.query(insertSql, [username, passwordHash, email, fullName]);
    const created = res.rows[0];

    console.log('[Seed Success] Created default single authorized admin user:');
    console.log(`  ID:        ${created.id}`);
    console.log(`  Username:  ${created.username}`);
    console.log(`  Email:     ${created.email}`);
    console.log(`  Role:      ${created.role}`);
    console.log('----------------------------------------------------');
    console.log('[Seed Info] Admin password set from ADMIN_PASSWORD environment variable (omitted from logs).');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('[Seed Error] Failed to seed admin user:', error.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

runSeed();

