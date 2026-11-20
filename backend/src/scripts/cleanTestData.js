const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config/env');

async function cleanTestData() {
  console.log('====================================================');
  console.log('  WHATSAPP MONITOR - TEST DATA PURGE UTILITY        ');
  console.log('====================================================');

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
    console.log(`[Database] Connected to PostgreSQL on ${config.db.host}:${config.db.port}/${config.db.database}`);

    console.log('[Database] Truncating test tables (salespersons, whatsapp_sessions, customers, conversations, messages, media_attachments)...');
    
    // Truncate all non-admin operational tables with CASCADE
    await client.query(`
      TRUNCATE TABLE 
        messages, 
        media_attachments, 
        conversations, 
        customers, 
        whatsapp_sessions, 
        salespersons 
      CASCADE;
    `);

    console.log('[Database] All operational test tables truncated successfully.');

    // Verify admin user still exists
    const adminRes = await client.query('SELECT id, username, email FROM admin_users LIMIT 1;');
    if (adminRes.rows.length === 0) {
      console.log('[Database Notice] admin_users table was empty; seeding default admin...');
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(config.adminSeed.password, 10);
      await client.query(`
        INSERT INTO admin_users (username, password_hash, email, full_name, role, is_active)
        VALUES ($1, $2, $3, $4, 'admin', true);
      `, [config.adminSeed.username, hash, config.adminSeed.email, config.adminSeed.fullName]);
      console.log(`[Database] Seeded authorized admin "${config.adminSeed.username}".`);
    } else {
      console.log(`[Database] Preserved authorized admin user "${adminRes.rows[0].username}".`);
    }

  } catch (err) {
    console.error('[Database Error] Failed to truncate tables:', err.message);
  } finally {
    if (client) client.release();
    await pool.end();
  }

  // Clean storage filesystem
  console.log('\n[Filesystem] Purging test storage directories...');
  const storageRoot = path.resolve(__dirname, '../../storage');
  const mediaDir = path.join(storageRoot, 'media');
  const sessionsDir = path.join(storageRoot, 'sessions');

  let mediaFilesRemoved = 0;
  if (fs.existsSync(mediaDir)) {
    const files = fs.readdirSync(mediaDir);
    for (const file of files) {
      const fullPath = path.join(mediaDir, file);
      try {
        fs.unlinkSync(fullPath);
        mediaFilesRemoved++;
      } catch (err) {
        console.error(`Failed to remove media file ${file}:`, err.message);
      }
    }
  } else {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  let sessionFoldersRemoved = 0;
  if (fs.existsSync(sessionsDir)) {
    const folders = fs.readdirSync(sessionsDir);
    for (const folder of folders) {
      const fullPath = path.join(sessionsDir, folder);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        sessionFoldersRemoved++;
      } catch (err) {
        console.error(`Failed to remove session folder ${folder}:`, err.message);
      }
    }
  } else {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  console.log(`[Filesystem] Removed ${mediaFilesRemoved} media file(s) from storage/media/.`);
  console.log(`[Filesystem] Removed ${sessionFoldersRemoved} session folder(s) from storage/sessions/.`);
  console.log('====================================================');
  console.log('  PURGE COMPLETE: All test data has been removed.   ');
  console.log('====================================================');
}

cleanTestData().catch((err) => {
  console.error('[Purge Error]', err);
  process.exit(1);
});

