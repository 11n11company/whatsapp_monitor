const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config/env');

async function runMigration() {
  console.log('[Migration] Starting database migration for WhatsApp Monitor...');

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

  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`[Migration Error] Schema file not found at: ${schemaPath}`);
    process.exit(1);
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  let client;
  try {
    client = await pool.connect();
    console.log(`[Migration] Connected to PostgreSQL on ${config.db.host}:${config.db.port}/${config.db.database}`);

    console.log('[Migration] Executing schema.sql...');
    await client.query('BEGIN');
    await client.query(schemaSql);

    // Apply incremental migrations
    const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        console.log(`[Migration] Applying incremental migration: ${file}...`);
        const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(migrationSql);
      }
    }

    await client.query('COMMIT');

    console.log('[Migration] Migration completed successfully! Database schema and migrations up to date.');
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error('[Migration Error] Failed to run schema migration:', error.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

runMigration();

