const db = require('../config/db');

class SalespersonModel {
  /**
   * List all salespersons with optional filtering and search
   * @param {Object} options
   * @param {string} [options.search] Search term matching name, phone, or email
   * @param {string} [options.connectionStatus] Connection status filter
   * @param {boolean} [options.isActive] Active status filter
   * @returns {Promise<Array<Object>>}
   */
  static async findAll({ search, connectionStatus, isActive } = {}) {
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (search && search.trim() !== '') {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(`(LOWER(name) LIKE $${idx} OR phone_number LIKE $${idx} OR LOWER(COALESCE(email, '')) LIKE $${idx})`);
    }

    if (connectionStatus && connectionStatus !== 'all') {
      params.push(connectionStatus);
      conditions.push(`connection_status = $${params.length}`);
    }

    if (typeof isActive === 'boolean') {
      params.push(isActive);
      conditions.push(`is_active = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const queryText = `
      SELECT id, name, phone_number, email, is_active, connection_status, created_at, updated_at
      FROM salespersons
      ${whereClause}
      ORDER BY created_at DESC;
    `;

    const result = await db.query(queryText, params);
    return result.rows;
  }

  /**
   * Find a single salesperson by UUID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const queryText = `
      SELECT id, name, phone_number, email, is_active, connection_status, created_at, updated_at
      FROM salespersons
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1;
    `;
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find a salesperson by normalized phone number (used to prevent duplicate numbers)
   * @param {string} phoneNumber
   * @param {string} [excludeId] Exclude specific salesperson ID (e.g. during edit)
   * @returns {Promise<Object|null>}
   */
  static async findByPhoneNumber(phoneNumber, excludeId = null) {
    let queryText = `
      SELECT id, name, phone_number, email, is_active, connection_status
      FROM salespersons
      WHERE phone_number = $1 AND deleted_at IS NULL
    `;
    const params = [phoneNumber];

    if (excludeId) {
      queryText += ` AND id != $2`;
      params.push(excludeId);
    }

    queryText += ` LIMIT 1;`;

    const result = await db.query(queryText, params);
    return result.rows[0] || null;
  }

  /**
   * Create a new salesperson record
   * @param {Object} data
   * @param {string} data.name
   * @param {string} data.phoneNumber
   * @param {string} [data.email]
   * @param {string} [data.connectionStatus]
   * @returns {Promise<Object>}
   */
  static async create({ name, phoneNumber, phone_number, email = null, connectionStatus, connection_status }) {
    const finalPhone = phoneNumber || phone_number;
    const finalStatus = connectionStatus || connection_status || 'Not Connected';
    const queryText = `
      INSERT INTO salespersons (name, phone_number, email, is_active, connection_status)
      VALUES ($1, $2, $3, true, $4)
      RETURNING id, name, phone_number, email, is_active, connection_status, created_at, updated_at;
    `;
    const result = await db.query(queryText, [name, finalPhone, email, finalStatus]);
    return result.rows[0];
  }

  /**
   * Update an existing salesperson record
   * @param {string} id
   * @param {Object} fields
   * @returns {Promise<Object|null>}
   */
  static async update(id, fields) {
    const allowed = ['name', 'phone_number', 'email', 'is_active', 'connection_status'];
    const setClauses = [];
    const params = [];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        params.push(fields[key]);
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    const queryText = `
      UPDATE salespersons
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length} AND deleted_at IS NULL
      RETURNING id, name, phone_number, email, is_active, connection_status, created_at, updated_at;
    `;

    const result = await db.query(queryText, params);
    return result.rows[0] || null;
  }

  /**
   * Soft-delete a salesperson (sets deleted_at, is_active = false, connection_status = 'Disconnected')
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async softDelete(id) {
    const queryText = `
      UPDATE salespersons
      SET deleted_at = CURRENT_TIMESTAMP, is_active = false, connection_status = 'Disconnected', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, name, phone_number, is_active, connection_status, deleted_at;
    `;
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }

  /**
   * Completely and permanently delete a salesperson and cascade all chats/data
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async hardDelete(id) {
    const queryText = `
      DELETE FROM salespersons
      WHERE id = $1
      RETURNING id, name, phone_number;
    `;
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }

  /**
   * Aggregate statistics for dashboard & metrics
   * @returns {Promise<Object>}
   */
  static async getStats() {
    const queryText = `
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_active = true) AS active,
        COUNT(*) FILTER (WHERE connection_status = 'Connected' AND is_active = true) AS connected
      FROM salespersons
      WHERE deleted_at IS NULL;
    `;
    const result = await db.query(queryText);
    const row = result.rows[0] || {};
    return {
      total: parseInt(row.total || '0', 10),
      active: parseInt(row.active || '0', 10),
      connected: parseInt(row.connected || '0', 10),
    };
  }
}

module.exports = SalespersonModel;

