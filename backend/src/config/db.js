// Prioritize IPv4 DNS lookups to avoid ENETUNREACH in IPv4-only container environments (e.g. Railway)
const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const { Pool } = require('pg');
const config = require('./env');
const bcrypt = require('bcryptjs');

let pool = null;
let isConnected = false;
let dbError = null;
let lastReconnectAttempt = 0;

// Helper to sanitize error messages so credentials/connection strings are never exposed
function sanitizeError(msg) {
  if (!msg) return null;
  return String(msg)
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1*****$2')
    .replace(/password=[^\s;]+/gi, 'password=*****');
}

// Build PostgreSQL connection pool configuration
const poolConfig = {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

// Fallback to connectionString if provided and host wasn't parsed
if (config.db.url && (!poolConfig.host || poolConfig.host === 'localhost')) {
  poolConfig.connectionString = config.db.url;
}

pool = new Pool(poolConfig);

// Catch unexpected idle client errors without crashing the process
pool.on('error', (err) => {
  const sanitized = sanitizeError(err.message);
  console.error('[DB Pool Error] Unexpected idle client error:', sanitized);
  isConnected = false;
  dbError = sanitized;
});

// In-memory fallback storage used ONLY when PostgreSQL is unreachable (e.g. offline dev/evaluation)
const crypto = require('crypto');

const mockStore = {
  adminUsers: [],
  salespersons: [],
  whatsappSessions: [],
  customers: [],
  conversations: [],
  messages: [],
  mediaAttachments: [],
  lidMappings: [],
  initialized: false,
};

async function initMockStore() {
  if (mockStore.initialized) return;
  const hash = await bcrypt.hash(config.adminSeed.password, 10);
  mockStore.adminUsers.push({
    id: 1,
    username: config.adminSeed.username,
    password_hash: hash,
    email: config.adminSeed.email,
    full_name: config.adminSeed.fullName,
    role: 'admin',
    is_active: true,
    last_login: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  mockStore.initialized = true;
}

// Test connection on startup or health probe
async function testConnection() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW() AS now, current_database() AS db');
    client.release();
    isConnected = true;
    dbError = null;
    console.log(`[DB] Connected successfully to PostgreSQL database "${res.rows[0].db}"`);
    return { connected: true, timestamp: res.rows[0].now, database: res.rows[0].db };
  } catch (err) {
    isConnected = false;
    dbError = sanitizeError(err.message);
    const isProduction = config.env === 'production' || process.env.DB_REQUIRE_REAL === 'true';
    if (isProduction) {
      console.error(`[DATABASE ERROR] PostgreSQL connection failed in production mode: ${dbError}`);
      console.error('[DATABASE NOTICE] In-memory fallback is strictly disabled in production. Running in safe disconnected mode.');
      return { connected: false, error: dbError, fallback: false };
    }
    console.warn(`[DB WARNING] PostgreSQL connection failed: ${dbError}`);
    console.warn('[DB WARNING] Operating with in-memory resilient fallback for development.');
    await initMockStore();
    return { connected: false, error: dbError, fallback: true };
  }
}

// Standard parameterized query wrapper
async function query(text, params = []) {
  if (!isConnected && pool) {
    const now = Date.now();
    // Throttled on-demand reconnect attempt every 5 seconds
    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      try {
        const client = await pool.connect();
        const testRes = await client.query('SELECT 1');
        client.release();
        if (testRes) {
          isConnected = true;
          dbError = null;
          console.log('[DB] PostgreSQL reconnected successfully on demand');
        }
      } catch (reconnectErr) {
        dbError = sanitizeError(reconnectErr.message);
      }
    }
  }

  if (isConnected) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      return res;
    } catch (err) {
      console.error('[DB Query Error]:', sanitizeError(err.message));
      throw err;
    }
  }

  // Resilient fallback logic when PostgreSQL is offline (development only)
  const isProduction = config.env === 'production' || process.env.DB_REQUIRE_REAL === 'true';
  if (isProduction) {
    throw new Error(`Database unavailable in production mode. Fallback storage is strictly prohibited. Error: ${dbError || 'Not connected'}`);
  }
  await initMockStore();
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');

  // ==========================================
  // ADMIN USERS QUERIES (Phase 1)
  // ==========================================
  if (normalized.includes('admin_users')) {
    // Find user by ID: WHERE id = $1
    if (normalized.includes('where id = $1')) {
      const id = Number(params[0]);
      const user = mockStore.adminUsers.find(u => u.id === id);
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // Find user by username: WHERE lower(username) = lower($1)
    if (normalized.includes('where lower(username)') || normalized.includes('where username =')) {
      const username = String(params[0] || '').toLowerCase();
      const user = mockStore.adminUsers.find(u => u.username.toLowerCase() === username);
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // Update last_login
    if (normalized.includes('update admin_users') && normalized.includes('last_login')) {
      const id = Number(params[0]);
      const user = mockStore.adminUsers.find(u => u.id === id);
      if (user) {
        user.last_login = new Date().toISOString();
        user.updated_at = new Date().toISOString();
      }
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // Count admins
    if (normalized.includes('count(*)')) {
      return { rows: [{ count: mockStore.adminUsers.length.toString() }], rowCount: 1 };
    }

    // Insert admin
    if (normalized.includes('insert into admin_users')) {
      const [username, password_hash, email, full_name] = params;
      const newId = mockStore.adminUsers.length + 1;
      const newUser = {
        id: newId,
        username,
        password_hash,
        email,
        full_name,
        role: 'admin',
        is_active: true,
        last_login: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockStore.adminUsers.push(newUser);
      return { rows: [newUser], rowCount: 1 };
    }
  }

  // ==========================================
  // SALESPERSONS QUERIES (Phase 2)
  // ==========================================

  // Salespersons: Aggregate stats
  if (normalized.includes('from salespersons') && normalized.includes('count(*) filter')) {
    const nonDeleted = mockStore.salespersons.filter(s => s.deleted_at === null);
    const active = nonDeleted.filter(s => s.is_active === true);
    const connected = active.filter(s => s.connection_status === 'Connected');
    return {
      rows: [{
        total: nonDeleted.length.toString(),
        active: active.length.toString(),
        connected: connected.length.toString(),
      }],
      rowCount: 1,
    };
  }

  // Salespersons: Insert new record
  if (normalized.includes('insert into salespersons')) {
    const [name, phone_number, email, connection_status] = params;
    const newRecord = {
      id: crypto.randomUUID(),
      name,
      phone_number,
      email: email || null,
      is_active: true,
      connection_status: connection_status || 'Not Connected',
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockStore.salespersons.unshift(newRecord);
    return { rows: [{ ...newRecord }], rowCount: 1 };
  }

  // Salespersons: Find by phone_number (duplicate check)
  if (normalized.includes('from salespersons') && normalized.includes('phone_number = $1')) {
    const phone = params[0];
    const excludeId = params[1] || null;
    const found = mockStore.salespersons.find(s =>
      s.deleted_at === null &&
      s.phone_number === phone &&
      (!excludeId || s.id !== excludeId)
    );
    return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
  }

  // Salespersons: Soft delete
  if (normalized.includes('set deleted_at = current_timestamp') || normalized.includes('set deleted_at =')) {
    const id = params[0];
    const idx = mockStore.salespersons.findIndex(s => s.id === id && s.deleted_at === null);
    if (idx !== -1) {
      const now = new Date().toISOString();
      mockStore.salespersons[idx].deleted_at = now;
      mockStore.salespersons[idx].is_active = false;
      mockStore.salespersons[idx].connection_status = 'Disconnected';
      mockStore.salespersons[idx].updated_at = now;
      return { rows: [{ ...mockStore.salespersons[idx] }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Salespersons: Hard delete & cascade
  if (normalized.includes('delete from salespersons') && normalized.includes('where id = $1')) {
    const id = params[0];
    const idx = mockStore.salespersons.findIndex(s => s.id === id);
    let removed = null;
    if (idx !== -1) {
      removed = mockStore.salespersons.splice(idx, 1)[0];
    }
    mockStore.whatsappSessions = mockStore.whatsappSessions.filter(w => w.salesperson_id !== id);
    mockStore.customers = mockStore.customers.filter(c => c.salesperson_id !== id);
    mockStore.conversations = mockStore.conversations.filter(c => c.salesperson_id !== id);
    mockStore.messages = mockStore.messages.filter(m => m.salesperson_id !== id);
    return { rows: removed ? [{ ...removed }] : [], rowCount: removed ? 1 : 0 };
  }

  // Salespersons: Find by ID
  if (normalized.includes('from salespersons') && normalized.includes('where id = $1')) {
    const id = params[0];
    const found = mockStore.salespersons.find(s => s.id === id && s.deleted_at === null);
    return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
  }

  // Salespersons: Generic update
  if (normalized.includes('update salespersons')) {
    const id = params[params.length - 1];
    const idx = mockStore.salespersons.findIndex(s => s.id === id && s.deleted_at === null);
    if (idx !== -1) {
      // Parse assigned set clauses from query
      // e.g. name = $1, phone_number = $2, ...
      const setPart = normalized.substring(normalized.indexOf('set') + 3, normalized.indexOf('where')).trim();
      const fields = setPart.split(',').map(s => s.trim().split('=')[0].trim());
      fields.forEach((field, fIdx) => {
        if (field && field !== 'updated_at' && params[fIdx] !== undefined) {
          mockStore.salespersons[idx][field] = params[fIdx];
        }
      });
      mockStore.salespersons[idx].updated_at = new Date().toISOString();
      return { rows: [{ ...mockStore.salespersons[idx] }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Salespersons: Find all with search & filters
  if (normalized.includes('from salespersons') && normalized.includes('deleted_at is null')) {
    let list = mockStore.salespersons.filter(s => s.deleted_at === null);

    // Check if search parameter was included
    if (normalized.includes('lower(name) like')) {
      const searchVal = String(params[0] || '').replace(/%/g, '').toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(searchVal) ||
        s.phone_number.includes(searchVal) ||
        (s.email && s.email.toLowerCase().includes(searchVal))
      );
    }

    if (normalized.includes('connection_status =')) {
      const statusIdx = params.findIndex(p => ['Not Connected', 'Pending', 'Connected', 'Disconnected', 'Error'].includes(p));
      if (statusIdx !== -1) {
        list = list.filter(s => s.connection_status === params[statusIdx]);
      }
    }

    if (normalized.includes('is_active =')) {
      const activeIdx = params.findIndex(p => typeof p === 'boolean');
      if (activeIdx !== -1) {
        list = list.filter(s => s.is_active === params[activeIdx]);
      }
    }

    return { rows: list.map(s => ({ ...s })), rowCount: list.length };
  }

  // ==========================================
  // WHATSAPP SESSIONS QUERIES (Phase 3)
  // ==========================================

  // Sessions: Find by salesperson_id
  if (normalized.includes('from whatsapp_sessions') && normalized.includes('salesperson_id = $1')) {
    const spId = params[0];
    const session = mockStore.whatsappSessions.find(s => s.salesperson_id === spId);
    return { rows: session ? [{ ...session }] : [], rowCount: session ? 1 : 0 };
  }

  // Sessions: Find active sessions for recovery
  if (normalized.includes('from whatsapp_sessions ws') && normalized.includes('join salespersons s')) {
    const list = [];
    for (const ws of mockStore.whatsappSessions) {
      if (['Connected', 'Connecting'].includes(ws.status)) {
        const sp = mockStore.salespersons.find(s => s.id === ws.salesperson_id && s.is_active && !s.deleted_at);
        if (sp) {
          list.push({
            ...ws,
            salesperson_name: sp.name,
            salesperson_phone: sp.phone_number,
            salesperson_is_active: sp.is_active,
          });
        }
      }
    }
    return { rows: list, rowCount: list.length };
  }

  // Sessions: Upsert session
  if (normalized.includes('insert into whatsapp_sessions')) {
    const [
      salespersonId,
      status,
      provider,
      isDemo,
      qrCode,
      qrExpiresAt,
      lastConnectedAt,
      lastDisconnectedAt,
      errorMessage,
      metadataStr,
      syncStatus,
      syncProgressStr,
    ] = params;

    let metadata = {};
    try {
      metadata = typeof metadataStr === 'string' ? JSON.parse(metadataStr) : (metadataStr || {});
    } catch {
      metadata = {};
    }

    let syncProgress = null;
    try {
      syncProgress = typeof syncProgressStr === 'string' ? JSON.parse(syncProgressStr) : syncProgressStr;
    } catch {
      syncProgress = null;
    }

    const now = new Date().toISOString();
    const existingIdx = mockStore.whatsappSessions.findIndex(s => s.salesperson_id === salespersonId);

    if (existingIdx !== -1) {
      const existing = mockStore.whatsappSessions[existingIdx];
      const updated = {
        ...existing,
        status: status || existing.status,
        provider: provider || existing.provider,
        is_demo: isDemo !== undefined ? Boolean(isDemo) : existing.is_demo,
        qr_code: qrCode !== undefined ? qrCode : existing.qr_code,
        qr_expires_at: qrExpiresAt !== undefined ? qrExpiresAt : existing.qr_expires_at,
        last_connected_at: lastConnectedAt || existing.last_connected_at,
        last_disconnected_at: lastDisconnectedAt || existing.last_disconnected_at,
        error_message: errorMessage !== undefined ? errorMessage : existing.error_message,
        metadata: metadata || existing.metadata,
        sync_status: syncStatus || existing.sync_status || 'Waiting for device pairing',
        sync_progress: syncProgress || existing.sync_progress || { messagesProcessed: 0, customersDiscovered: 0, startDate: null, endDate: null, lastSyncAt: null, error: null },
        updated_at: now,
      };
      mockStore.whatsappSessions[existingIdx] = updated;
      return { rows: [{ ...updated }], rowCount: 1 };
    } else {
      const newSession = {
        id: crypto.randomUUID(),
        salesperson_id: salespersonId,
        status: status || 'Not Connected',
        provider: provider || 'demo',
        is_demo: isDemo !== undefined ? Boolean(isDemo) : true,
        qr_code: qrCode || null,
        qr_expires_at: qrExpiresAt || null,
        last_connected_at: lastConnectedAt || null,
        last_disconnected_at: lastDisconnectedAt || null,
        error_message: errorMessage || null,
        metadata,
        sync_status: syncStatus || 'Waiting for device pairing',
        sync_progress: syncProgress || { messagesProcessed: 0, customersDiscovered: 0, startDate: null, endDate: null, lastSyncAt: null, error: null },
        created_at: now,
        updated_at: now,
      };
      mockStore.whatsappSessions.push(newSession);
      return { rows: [{ ...newSession }], rowCount: 1 };
    }
  }

  // Sessions: Update sync_status and sync_progress
  if (normalized.includes('update whatsapp_sessions') && normalized.includes('sync_status = $1')) {
    const [syncStatus, syncProgressStr, salespersonId] = params;
    const session = mockStore.whatsappSessions.find(s => s.salesperson_id === salespersonId);
    if (session) {
      session.sync_status = syncStatus;
      if (syncProgressStr) {
        try {
          session.sync_progress = typeof syncProgressStr === 'string' ? JSON.parse(syncProgressStr) : syncProgressStr;
        } catch {
          // ignore
        }
      }
      session.updated_at = new Date().toISOString();
      return { rows: [{ ...session }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Sessions: Update status
  if (normalized.includes('update whatsapp_sessions') && normalized.includes('status = $1')) {
    const [status, errorMessage, salespersonId] = params;
    const session = mockStore.whatsappSessions.find(s => s.salesperson_id === salespersonId);
    if (session) {
      session.status = status;
      session.error_message = errorMessage;
      session.updated_at = new Date().toISOString();
      return { rows: [{ ...session }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Sessions: Mark disconnected
  if (normalized.includes('update whatsapp_sessions') && normalized.includes("status = 'disconnected'")) {
    const salespersonId = params[0];
    const session = mockStore.whatsappSessions.find(s => s.salesperson_id === salespersonId);
    if (session) {
      const now = new Date().toISOString();
      session.status = 'Disconnected';
      session.qr_code = null;
      session.qr_expires_at = null;
      session.last_disconnected_at = now;
      session.error_message = null;
      session.updated_at = now;
      return { rows: [{ ...session }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // ==========================================
  // CUSTOMERS QUERIES (Phase 5)
  // ==========================================

  // Customers: Upsert customer
  if (normalized.includes('insert into customers')) {
    const [salespersonId, whatsappId, phoneNumber, displayName, contactType, groupSubject, lidJid, profilePictureUrl] = params;
    const now = new Date().toISOString();
    const existing = mockStore.customers.find(
      c => c.salesperson_id === salespersonId && c.whatsapp_id === whatsappId
    );

    if (existing) {
      if (displayName && displayName.trim() !== '' && !displayName.includes('@') && displayName !== existing.phone_number) {
        existing.display_name = displayName;
      }
      if (groupSubject) {
        existing.group_subject = groupSubject;
      }
      if (contactType) {
        existing.contact_type = contactType;
      }
      if (lidJid) {
        existing.lid_jid = lidJid;
      }
      if (phoneNumber && existing.contact_type !== 'group') {
        existing.phone_number = phoneNumber;
      }
      if (profilePictureUrl) {
        existing.profile_picture_url = profilePictureUrl;
      }
      existing.last_contact_update = now;
      existing.updated_at = now;
      return { rows: [{ ...existing }], rowCount: 1 };
    } else {
      const isGroup = (whatsappId && whatsappId.endsWith('@g.us')) || contactType === 'group';
      const newCustomer = {
        id: crypto.randomUUID(),
        salesperson_id: salespersonId,
        whatsapp_id: whatsappId,
        phone_number: isGroup ? null : (phoneNumber || null),
        display_name: displayName || null,
        contact_type: isGroup ? 'group' : (contactType || 'individual'),
        group_subject: groupSubject || null,
        lid_jid: lidJid || null,
        profile_picture_url: profilePictureUrl || null,
        last_contact_update: now,
        created_at: now,
        updated_at: now,
      };
      mockStore.customers.push(newCustomer);
      return { rows: [{ ...newCustomer }], rowCount: 1 };
    }
  }

  // Customers: Update group subject
  if (normalized.includes('update customers') && normalized.includes('set group_subject = $1')) {
    const [groupSubject, salespersonId, whatsappId] = params;
    const found = mockStore.customers.find(c => c.salesperson_id === salespersonId && c.whatsapp_id === whatsappId);
    if (found) {
      found.group_subject = groupSubject;
      found.display_name = groupSubject;
      found.contact_type = 'group';
      found.last_contact_update = new Date().toISOString();
      found.updated_at = new Date().toISOString();
      return { rows: [{ ...found }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Customers: Update display name by phone
  if (normalized.includes('update customers') && normalized.includes('set display_name = $1')) {
    const [displayName, salespersonId, phoneNumber] = params;
    const found = mockStore.customers.find(c => c.salesperson_id === salespersonId && c.phone_number === phoneNumber);
    if (found) {
      found.display_name = displayName;
      found.last_contact_update = new Date().toISOString();
      found.updated_at = new Date().toISOString();
      return { rows: [{ ...found }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // LID Mappings: Insert or update
  if (normalized.includes('insert into lid_mappings')) {
    const [salespersonId, lidJid, phoneJid] = params;
    const now = new Date().toISOString();
    const existing = mockStore.lidMappings.find(m => m.salesperson_id === salespersonId && m.lid_jid === lidJid);
    if (existing) {
      existing.phone_jid = phoneJid;
      existing.updated_at = now;
    } else {
      mockStore.lidMappings.push({
        salesperson_id: salespersonId,
        lid_jid: lidJid,
        phone_jid: phoneJid,
        created_at: now,
        updated_at: now,
      });
    }
    return { rows: [], rowCount: 1 };
  }

  // LID Mappings: Find by LID
  if (normalized.includes('from lid_mappings') && normalized.includes('where salesperson_id = $1 and lid_jid = $2')) {
    const [salespersonId, lidJid] = params;
    const found = mockStore.lidMappings.find(m => m.salesperson_id === salespersonId && m.lid_jid === lidJid);
    return { rows: found ? [{ phone_jid: found.phone_jid }] : [], rowCount: found ? 1 : 0 };
  }

  // Customers: Count by salesperson_id or global count
  if (normalized.includes('select count(*) as total from customers') || (normalized.includes('from customers') && normalized.includes('count(*) as total'))) {
    if (!params || params.length === 0) {
      return { rows: [{ total: mockStore.customers.length.toString() }], rowCount: 1 };
    }
    const spId = params[0];
    let list = mockStore.customers.filter(c => c.salesperson_id === spId);
    if (params.length > 1 && typeof params[1] === 'string' && params[1].startsWith('%')) {
      const term = params[1].replace(/%/g, '').toLowerCase();
      list = list.filter(c =>
        (c.display_name && c.display_name.toLowerCase().includes(term)) ||
        (c.phone_number && c.phone_number.includes(term)) ||
        (c.whatsapp_id && c.whatsapp_id.toLowerCase().includes(term))
      );
    }
    return { rows: [{ total: list.length.toString() }], rowCount: 1 };
  }

  // Customers: Find by salesperson and whatsappId
  if (normalized.includes('from customers') && normalized.includes('salesperson_id = $1 and whatsapp_id = $2')) {
    const [spId, waId] = params;
    const found = mockStore.customers.find(
      c => c.salesperson_id === spId && c.whatsapp_id === waId
    );
    return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
  }

  // Customers: Find by ID with joined salesperson
  if (normalized.includes('from customers c') && normalized.includes('where c.id = $1')) {
    const id = params[0];
    const customer = mockStore.customers.find(c => c.id === id);
    if (customer) {
      const sp = mockStore.salespersons.find(s => s.id === customer.salesperson_id);
      return {
        rows: [{
          ...customer,
          salesperson_name: sp ? sp.name : null,
          salesperson_phone: sp ? sp.phone_number : null,
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }

  // Customers: List for salesperson with search & joined conversation
  if (normalized.includes('from customers c') && normalized.includes('c.salesperson_id = $1')) {
    const spId = params[0];
    let list = mockStore.customers.filter(c => c.salesperson_id === spId);

    // Check search filter
    if (normalized.includes('like $2')) {
      const term = String(params[1] || '').replace(/%/g, '').toLowerCase();
      list = list.filter(c =>
        (c.display_name && c.display_name.toLowerCase().includes(term)) ||
        (c.phone_number && c.phone_number.includes(term)) ||
        (c.whatsapp_id && c.whatsapp_id.toLowerCase().includes(term))
      );
    }

    // Attach conversation data & sort by last_message_at DESC
    const withConv = list.map(c => {
      const conv = mockStore.conversations.find(
        cv => cv.salesperson_id === c.salesperson_id && cv.customer_id === c.id
      );
      return {
        ...c,
        conversation_id: conv ? conv.id : null,
        last_message_at: conv ? conv.last_message_at : null,
        last_message_preview: conv ? conv.last_message_preview : null,
      };
    });

    withConv.sort((a, b) => {
      const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Pagination limit & offset
    const limit = Number(params[params.length - 2]) || 20;
    const offset = Number(params[params.length - 1]) || 0;
    const paginated = withConv.slice(offset, offset + limit);

    return { rows: paginated, rowCount: paginated.length };
  }

  // Messages: Recent activity join query
  if (normalized.includes('from messages m') && normalized.includes('join salespersons s') && normalized.includes('join customers c')) {
    const sorted = [...mockStore.messages].sort((a, b) => new Date(b.message_timestamp) - new Date(a.message_timestamp));
    const rows = sorted.slice(0, 10).map(m => {
      const sp = mockStore.salespersons.find(s => s.id === m.salesperson_id);
      const cust = mockStore.customers.find(c => c.id === m.customer_id);
      return {
        id: m.id,
        direction: m.direction,
        message_type: m.message_type,
        message_text: m.message_text,
        message_timestamp: m.message_timestamp,
        created_at: m.created_at,
        salesperson_id: m.salesperson_id,
        salesperson_name: sp ? sp.name : 'Salesperson',
        salesperson_phone: sp ? sp.phone_number : '',
        customer_id: m.customer_id,
        customer_name: cust ? cust.display_name : '',
        customer_phone: cust ? cust.phone_number : '',
      };
    });
    return { rows, rowCount: rows.length };
  }

  // ==========================================
  // CONVERSATIONS QUERIES (Phase 5)
  // ==========================================

  // Conversations: Upsert (findOrCreate)
  if (normalized.includes('insert into conversations')) {
    const [salespersonId, customerId] = params;
    const now = new Date().toISOString();
    const existing = mockStore.conversations.find(
      cv => cv.salesperson_id === salespersonId && cv.customer_id === customerId
    );

    if (existing) {
      existing.updated_at = now;
      return { rows: [{ ...existing }], rowCount: 1 };
    } else {
      const newConv = {
        id: crypto.randomUUID(),
        salesperson_id: salespersonId,
        customer_id: customerId,
        last_message_at: null,
        last_message_preview: null,
        created_at: now,
        updated_at: now,
      };
      mockStore.conversations.push(newConv);
      return { rows: [{ ...newConv }], rowCount: 1 };
    }
  }

  // Conversations: Find by ID with joined customer & salesperson
  if (normalized.includes('from conversations conv') && normalized.includes('where conv.id = $1')) {
    const id = params[0];
    const conv = mockStore.conversations.find(cv => cv.id === id);
    if (conv) {
      const cust = mockStore.customers.find(c => c.id === conv.customer_id);
      const sp = mockStore.salespersons.find(s => s.id === conv.salesperson_id);
      return {
        rows: [{
          ...conv,
          customer_name: cust ? cust.display_name : null,
          customer_phone: cust ? cust.phone_number : null,
          whatsapp_id: cust ? cust.whatsapp_id : null,
          salesperson_name: sp ? sp.name : null,
          salesperson_phone: sp ? sp.phone_number : null,
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }

  // Conversations: Find by customer_id
  if (normalized.includes('from conversations conv') && normalized.includes('where conv.customer_id = $1')) {
    const custId = params[0];
    const convs = mockStore.conversations.filter(cv => cv.customer_id === custId);
    const mapped = convs.map(conv => {
      const sp = mockStore.salespersons.find(s => s.id === conv.salesperson_id);
      return {
        ...conv,
        salesperson_name: sp ? sp.name : null,
        salesperson_phone: sp ? sp.phone_number : null,
      };
    });
    return { rows: mapped, rowCount: mapped.length };
  }

  // Conversations: Update last message
  if (normalized.includes('update conversations') && normalized.includes('set last_message_at = $1')) {
    const [lastMessageAt, lastMessagePreview, id] = params;
    const conv = mockStore.conversations.find(cv => cv.id === id);
    if (conv) {
      conv.last_message_at = lastMessageAt;
      conv.last_message_preview = lastMessagePreview;
      conv.updated_at = new Date().toISOString();
      return { rows: [{ ...conv }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Conversations: Global count
  if (normalized.includes('select count(*) as total from conversations') || (normalized.includes('from conversations') && normalized.includes('count(*) as total'))) {
    return { rows: [{ total: mockStore.conversations.length.toString() }], rowCount: 1 };
  }

  // ==========================================
  // MESSAGES QUERIES (Phase 5)
  // ==========================================

  // Messages: Insert message (with ON CONFLICT DO NOTHING)
  if (normalized.includes('insert into messages')) {
    const [
      conversationId,
      salespersonId,
      customerId,
      whatsappMessageId,
      direction,
      messageType,
      messageText,
      mediaId,
      participantJid,
      participantName,
      messageTimestamp,
    ] = params;

    // Check conflict by (salesperson_id, whatsapp_message_id)
    const existing = mockStore.messages.find(
      m => m.salesperson_id === salespersonId && m.whatsapp_message_id === whatsappMessageId
    );

    if (existing) {
      // DO NOTHING
      return { rows: [], rowCount: 0 };
    }

    const now = new Date().toISOString();
    const newMsg = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      salesperson_id: salespersonId,
      customer_id: customerId,
      whatsapp_message_id: whatsappMessageId,
      direction,
      message_type: messageType || 'text',
      message_text: messageText || null,
      media_id: mediaId || null,
      participant_jid: participantJid || null,
      participant_name: participantName || null,
      message_timestamp: typeof messageTimestamp === 'string' ? messageTimestamp : new Date(messageTimestamp).toISOString(),
      created_at: now,
    };
    mockStore.messages.push(newMsg);
    return { rows: [{ ...newMsg }], rowCount: 1 };
  }

  // Messages: Count by conversation_id
  if (normalized.includes('select count(*) as total from messages where conversation_id = $1')) {
    const convId = params[0];
    const count = mockStore.messages.filter(m => m.conversation_id === convId).length;
    return { rows: [{ total: count.toString() }], rowCount: 1 };
  }

  // Messages: Find by salesperson_id and whatsapp_message_id
  if (normalized.includes('from messages') && normalized.includes('salesperson_id = $1 and whatsapp_message_id = $2')) {
    const [spId, waMsgId] = params;
    const found = mockStore.messages.find(
      m => m.salesperson_id === spId && m.whatsapp_message_id === waMsgId
    );
    return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
  }

  // Messages: List by conversation_id with chronological ordering & pagination
  if (normalized.includes('from messages m') && normalized.includes('where m.conversation_id = $1')) {
    const convId = params[0];
    const limit = Number(params[1]) || 20;
    const offset = Number(params[2]) || 0;

    const list = mockStore.messages.filter(m => m.conversation_id === convId);
    // Sort descending by timestamp to select the newest messages for the page
    list.sort((a, b) => new Date(b.message_timestamp).getTime() - new Date(a.message_timestamp).getTime());

    const pageSlice = list.slice(offset, offset + limit);
    // Restore chronological order (oldest to newest)
    pageSlice.sort((a, b) => new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime());

    const paginated = pageSlice.map(m => {
      const med = m.media_id ? mockStore.mediaAttachments.find(ma => ma.id === m.media_id) : null;
      return {
        ...m,
        media_file_name: med ? med.file_name : null,
        media_mime_type: med ? med.mime_type : null,
        media_file_size: med ? med.file_size_bytes : null,
      };
    });

    return { rows: paginated, rowCount: paginated.length };
  }

  // Messages: Recent activity join query
  if (normalized.includes('from messages m') && normalized.includes('join salespersons s') && normalized.includes('join customers c')) {
    const sorted = [...mockStore.messages].sort((a, b) => new Date(b.message_timestamp) - new Date(a.message_timestamp));
    const rows = sorted.slice(0, 10).map(m => {
      const sp = mockStore.salespersons.find(s => s.id === m.salesperson_id);
      const cust = mockStore.customers.find(c => c.id === m.customer_id);
      return {
        id: m.id,
        direction: m.direction,
        message_type: m.message_type,
        message_text: m.message_text,
        message_timestamp: m.message_timestamp,
        created_at: m.created_at,
        salesperson_id: m.salesperson_id,
        salesperson_name: sp ? sp.name : 'Salesperson',
        salesperson_phone: sp ? sp.phone_number : '',
        customer_id: m.customer_id,
        customer_name: cust ? cust.display_name : '',
        customer_phone: cust ? cust.phone_number : '',
      };
    });
    return { rows, rowCount: rows.length };
  }

  // ==========================================
  // MEDIA ATTACHMENTS QUERIES (Phase 5)
  // ==========================================

  // Media: Insert attachment
  if (normalized.includes('insert into media_attachments')) {
    const [fileName, filePath, mimeType, fileSizeBytes, checksum] = params;
    const newMedia = {
      id: crypto.randomUUID(),
      file_name: fileName,
      file_path: filePath,
      mime_type: mimeType,
      file_size_bytes: fileSizeBytes || 0,
      checksum: checksum || null,
      created_at: new Date().toISOString(),
    };
    mockStore.mediaAttachments.push(newMedia);
    return { rows: [{ ...newMedia }], rowCount: 1 };
  }

  // Media: Find by checksum
  if (normalized.includes('from media_attachments') && normalized.includes('where checksum = $1')) {
    const checksum = params[0];
    const found = mockStore.mediaAttachments.find(ma => ma.checksum === checksum);
    return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
  }

  // Media: Find by ID
  if (normalized.includes('from media_attachments') && normalized.includes('where id = $1')) {
    const id = params[0];
    const found = mockStore.mediaAttachments.find(ma => ma.id === id);
    return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
  }

  return { rows: [], rowCount: 0 };
}

module.exports = {
  pool,
  query,
  testConnection,
  getStatus: () => ({
    connected: isConnected,
    database: config.db.database,
    host: config.db.host,
    port: config.db.port,
    error: sanitizeError(dbError),
  }),
};
