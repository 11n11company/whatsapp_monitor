const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const config = require('../config/env');

const REQUIRED_TABLES = [
  'admin_users',
  'salespersons',
  'whatsapp_sessions',
  'customers',
  'conversations',
  'messages',
  'media_attachments',
  'lid_mappings',
];

function findSchemaFile() {
  const candidates = [
    path.resolve(__dirname, 'schema.sql'),
    path.resolve(__dirname, '../../../database/schema.sql'),
    path.resolve(__dirname, '../../database/schema.sql'),
    path.resolve(process.cwd(), 'database/schema.sql'),
    path.resolve(process.cwd(), '../database/schema.sql'),
    path.resolve(process.cwd(), 'src/db/schema.sql'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findMigrationsDir() {
  const candidates = [
    path.resolve(__dirname, 'migrations'),
    path.resolve(__dirname, '../../../database/migrations'),
    path.resolve(__dirname, '../../database/migrations'),
    path.resolve(process.cwd(), 'database/migrations'),
    path.resolve(process.cwd(), '../database/migrations'),
    path.resolve(process.cwd(), 'src/db/migrations'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

class Migrator {
  /**
   * Ensure schema_migrations tracking table exists
   */
  static async initMigrationsTable(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * Get list of already applied migration versions
   */
  static async getAppliedMigrations(client) {
    await this.initMigrationsTable(client);
    const res = await client.query('SELECT version FROM schema_migrations ORDER BY applied_at ASC;');
    return res.rows.map((r) => r.version);
  }

  /**
   * Record a migration version as applied
   */
  static async recordMigration(client, version) {
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING;',
      [version]
    );
  }

  /**
   * Get list of public tables currently in the database
   */
  static async getExistingTables(client) {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    return res.rows.map((r) => r.table_name);
  }

  /**
   * Execute full schema migrations and pending increments
   */
  static async runMigrations() {
    console.log('[Migrator] Checking database schema and pending migrations...');

    const client = await db.pool.connect();
    const appliedList = [];

    try {
      await this.initMigrationsTable(client);
      const existingTables = await this.getExistingTables(client);

      const schemaPath = findSchemaFile();
      const migrationsDir = findMigrationsDir();

      // Check if core tables exist. If admin_users does not exist, run schema.sql
      const hasCoreTables = existingTables.includes('admin_users') && existingTables.includes('whatsapp_sessions');

      if (!hasCoreTables) {
        console.log('[Migrator] Core tables missing. Applying baseline schema...');
        if (!schemaPath || !fs.existsSync(schemaPath)) {
          throw new Error('Baseline schema.sql file could not be found in any candidate directory.');
        }

        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query('BEGIN');
        await client.query(schemaSql);

        // Mark baseline migrations as applied
        const baselineVersions = [
          '001_initial_schema',
          '002_create_salespersons.sql',
          '003_create_whatsapp_sessions.sql',
          '004_create_customers_conversations_messages.sql',
          '005_update_salespersons_status_constraint.sql',
          '006_phase12_fast_qr_and_sync.sql',
          'phase11_identity_and_groups.sql',
        ];

        for (const ver of baselineVersions) {
          await this.recordMigration(client, ver);
          appliedList.push(ver);
        }

        await client.query('COMMIT');
        console.log('[Migrator] Baseline schema created successfully.');
      }

      // Check and apply any incremental migration files from migrations directory
      if (migrationsDir && fs.existsSync(migrationsDir)) {
        const migrationFiles = fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.sql'))
          .sort();

        const currentApplied = await this.getAppliedMigrations(client);

        for (const file of migrationFiles) {
          if (!currentApplied.includes(file)) {
            console.log(`[Migrator] Applying incremental migration: ${file}...`);
            const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await client.query('BEGIN');
            await client.query(migrationSql);
            await this.recordMigration(client, file);
            await client.query('COMMIT');
            appliedList.push(file);
            console.log(`[Migrator] Applied migration: ${file}`);
          }
        }
      }

      console.log('[Migrator] Database schema is fully up to date.');
      return { success: true, applied: appliedList };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[Migrator Error] Failed to execute migrations:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Safely seed default admin user if none exists
   */
  static async seedAdmin() {
    console.log('[Migrator] Checking admin user bootstrap...');
    const client = await db.pool.connect();

    try {
      const countRes = await client.query('SELECT COUNT(*) AS count FROM admin_users WHERE role = $1', ['admin']);
      const adminCount = parseInt(countRes.rows[0]?.count || '0', 10);

      if (adminCount > 0) {
        console.log(`[Migrator] Admin account exists (Count: ${adminCount}). Preserving existing credentials.`);
        return { seeded: false, count: adminCount };
      }

      const { username, password, email, fullName } = config.adminSeed;
      console.log(`[Migrator] Seeding authorized admin user "${username}"...`);
      const passwordHash = await bcrypt.hash(password, 10);

      const insertSql = `
        INSERT INTO admin_users (username, password_hash, email, full_name, role, is_active)
        VALUES ($1, $2, $3, $4, 'admin', true)
        ON CONFLICT (username) DO NOTHING
        RETURNING id, username, email, full_name, role, created_at;
      `;

      const res = await client.query(insertSql, [username, passwordHash, email, fullName]);
      if (res.rows.length > 0) {
        console.log(`[Migrator] Successfully seeded authorized admin user: ${res.rows[0].username} (ID: ${res.rows[0].id})`);
      }
      return { seeded: true, count: 1 };
    } catch (err) {
      console.error('[Migrator Error] Failed to seed admin user:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Verify all required application tables exist and can be queried
   */
  static async verifySchema() {
    const client = await db.pool.connect();
    try {
      const existingTables = await this.getExistingTables(client);
      const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.includes(t));

      let adminCount = 0;
      let sessionCount = 0;

      if (existingTables.includes('admin_users')) {
        const adminCountRes = await client.query('SELECT COUNT(*) AS count FROM admin_users;');
        adminCount = parseInt(adminCountRes.rows[0]?.count || '0', 10);
      }

      if (existingTables.includes('whatsapp_sessions')) {
        const sessionCountRes = await client.query('SELECT COUNT(*) AS count FROM whatsapp_sessions;');
        sessionCount = parseInt(sessionCountRes.rows[0]?.count || '0', 10);
      }

      return {
        verified: missingTables.length === 0 && adminCount > 0,
        requiredTables: REQUIRED_TABLES,
        existingTables,
        missingTables,
        adminCount,
        sessionCount,
      };
    } finally {
      client.release();
    }
  }
}

module.exports = Migrator;
