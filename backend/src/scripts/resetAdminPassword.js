const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('../config/env');

/**
 * Reset or Update Administrator Credentials
 * 
 * Usage:
 *   node src/scripts/resetAdminPassword.js
 *   (uses ADMIN_USERNAME and ADMIN_PASSWORD from .env)
 * 
 * Or with custom arguments:
 *   node src/scripts/resetAdminPassword.js <new_username> <new_password>
 */
async function resetAdminPassword() {
  const args = process.argv.slice(2);
  const targetUsername = args[0] || config.adminSeed.username || 'admin';
  const targetPassword = args[1] || config.adminSeed.password || 'Admin@WhatsApp2025!';

  if (!targetPassword || targetPassword.length < 8) {
    console.error('[Error] Admin password must be at least 8 characters long.');
    process.exit(1);
  }

  console.log(`[Admin Setup] Setting up administrator credentials for username "${targetUsername}"...`);

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
    console.log(`[Admin Setup] Connected to PostgreSQL on ${config.db.host}:${config.db.port}/${config.db.database}`);

    console.log('[Admin Setup] Hashing password with bcrypt (salt rounds: 10)...');
    const passwordHash = await bcrypt.hash(targetPassword, 10);

    // Check if an admin already exists
    const existing = await client.query('SELECT id, username FROM admin_users LIMIT 1;');

    if (existing.rows.length > 0) {
      const adminId = existing.rows[0].id;
      const updateSql = `
        UPDATE admin_users
        SET username = $1, password_hash = $2, is_active = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING id, username, email, full_name, role, updated_at;
      `;
      const res = await client.query(updateSql, [targetUsername, passwordHash, adminId]);
      const updated = res.rows[0];

      console.log('====================================================');
      console.log('[Admin Setup Success] Administrator credentials updated:');
      console.log(`  ID:        ${updated.id}`);
      console.log(`  Username:  ${updated.username}`);
      console.log(`  Email:     ${updated.email}`);
      console.log(`  Role:      ${updated.role}`);
      console.log('====================================================');
      console.log('[Info] You can now log into the dashboard with your new credentials.');
    } else {
      const insertSql = `
        INSERT INTO admin_users (username, password_hash, email, full_name, role, is_active)
        VALUES ($1, $2, $3, $4, 'admin', true)
        RETURNING id, username, email, full_name, role, created_at;
      `;
      const res = await client.query(insertSql, [
        targetUsername,
        passwordHash,
        config.adminSeed.email || 'admin@whatsappmonitor.local',
        config.adminSeed.fullName || 'Super Admin',
      ]);
      const created = res.rows[0];

      console.log('====================================================');
      console.log('[Admin Setup Success] Administrator account created:');
      console.log(`  ID:        ${created.id}`);
      console.log(`  Username:  ${created.username}`);
      console.log(`  Email:     ${created.email}`);
      console.log(`  Role:      ${created.role}`);
      console.log('====================================================');
      console.log('[Info] You can now log into the dashboard with these credentials.');
    }
  } catch (err) {
    console.error('[Admin Setup Error] Failed to update administrator credentials:', err.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

resetAdminPassword();

