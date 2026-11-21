const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file (support both root and backend directory)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Safe URL parsing for DATABASE_URL with percent-decoded credentials
function parseDatabaseUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'postgres',
      user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      sslRequired:
        parsed.searchParams.get('sslmode') === 'require' ||
        rawUrl.includes('supabase') ||
        rawUrl.includes('pooler'),
    };
  } catch {
    return null;
  }
}

const parsedDbUrl = parseDatabaseUrl(process.env.DATABASE_URL);

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_whatsapp_monitor_phase1',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  db: {
    host: parsedDbUrl?.host || process.env.DB_HOST || 'localhost',
    port: parsedDbUrl?.port || parseInt(process.env.DB_PORT || '5432', 10),
    database: parsedDbUrl?.database || process.env.DB_NAME || 'whatsapp_monitor',
    user: parsedDbUrl?.user || process.env.DB_USER || 'postgres',
    password: parsedDbUrl?.password || process.env.DB_PASSWORD || 'postgres',
    ssl:
      process.env.DB_SSL === 'true' ||
      parsedDbUrl?.sslRequired ||
      (process.env.DATABASE_URL &&
        (process.env.DATABASE_URL.includes('supabase') ||
          process.env.DATABASE_URL.includes('sslmode=require'))) ||
      (process.env.DB_HOST &&
        (process.env.DB_HOST.includes('supabase') || process.env.DB_HOST.includes('pooler')))
        ? { rejectUnauthorized: false }
        : false,
    url: process.env.DATABASE_URL || null,
  },
  adminSeed: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'Admin@WhatsApp2025!',
    email: process.env.ADMIN_EMAIL || 'admin@whatsappmonitor.local',
    fullName: process.env.ADMIN_FULL_NAME || 'Super Admin',
  },
  sessionEncryptionKey: process.env.SESSION_ENCRYPTION_KEY || 'whatsapp_monitor_aes_256_gcm_session_key_secret_2025',
  whatsappProvider: process.env.WHATSAPP_PROVIDER || 'baileys',
  historySyncDays: parseInt(process.env.HISTORY_SYNC_DAYS || '3', 10),
  validateProductionConfig: () => {
    const issues = [];
    if (config.env === 'production') {
      const insecureJwtSecrets = [
        'dev_jwt_secret_whatsapp_monitor_phase1',
        'whatsapp_monitor_jwt_secret_dev_key_phase1_testing_only_2025',
      ];
      if (insecureJwtSecrets.includes(config.jwt.secret) || config.jwt.secret.length < 32) {
        issues.push('JWT_SECRET must be set to a secure random string of at least 32 characters in production.');
      }

      const insecureSessionKeys = [
        'whatsapp_monitor_aes_256_gcm_session_key_secret_2025',
      ];
      if (insecureSessionKeys.includes(config.sessionEncryptionKey) || config.sessionEncryptionKey.length < 32) {
        issues.push('SESSION_ENCRYPTION_KEY must be set to a unique, secure 32+ character key in production.');
      }

      if (config.adminSeed.password === 'Admin@WhatsApp2025!') {
        issues.push('ADMIN_PASSWORD must be changed from default before production use.');
      }
    }
    return issues;
  },
};

module.exports = config;

