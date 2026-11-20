const db = require('../config/db');

class WhatsAppSessionModel {
  /**
   * Find session record by salesperson UUID
   * @param {string} salespersonId
   * @returns {Promise<Object|null>}
   */
  static async findBySalespersonId(salespersonId) {
    const queryText = `
      SELECT 
        id, salesperson_id, status, provider, is_demo, 
        qr_code, qr_expires_at, last_connected_at, last_disconnected_at, 
        error_message, metadata, sync_status, sync_progress, created_at, updated_at
      FROM whatsapp_sessions
      WHERE salesperson_id = $1
      LIMIT 1;
    `;
    const result = await db.query(queryText, [salespersonId]);
    return result.rows[0] || null;
  }

  /**
   * Upsert a WhatsApp session record for a salesperson
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  static async upsertSession({
    salespersonId,
    status = 'Not Connected',
    provider = 'demo',
    isDemo = true,
    qrCode = null,
    qrExpiresAt = null,
    lastConnectedAt = null,
    lastDisconnectedAt = null,
    errorMessage = null,
    metadata = {},
    syncStatus = null,
    syncProgress = null,
  }) {
    const queryText = `
      INSERT INTO whatsapp_sessions (
        salesperson_id, status, provider, is_demo, qr_code, 
        qr_expires_at, last_connected_at, last_disconnected_at, 
        error_message, metadata, sync_status, sync_progress
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, 'Waiting for device pairing'), COALESCE($12, '{"messagesProcessed": 0, "customersDiscovered": 0, "startDate": null, "endDate": null, "lastSyncAt": null, "error": null}'::jsonb))
      ON CONFLICT (salesperson_id) DO UPDATE SET
        status = EXCLUDED.status,
        provider = EXCLUDED.provider,
        is_demo = EXCLUDED.is_demo,
        qr_code = EXCLUDED.qr_code,
        qr_expires_at = EXCLUDED.qr_expires_at,
        last_connected_at = COALESCE(EXCLUDED.last_connected_at, whatsapp_sessions.last_connected_at),
        last_disconnected_at = COALESCE(EXCLUDED.last_disconnected_at, whatsapp_sessions.last_disconnected_at),
        error_message = EXCLUDED.error_message,
        metadata = EXCLUDED.metadata,
        sync_status = COALESCE(EXCLUDED.sync_status, whatsapp_sessions.sync_status),
        sync_progress = COALESCE(EXCLUDED.sync_progress, whatsapp_sessions.sync_progress),
        updated_at = CURRENT_TIMESTAMP
      RETURNING 
        id, salesperson_id, status, provider, is_demo, 
        qr_code, qr_expires_at, last_connected_at, last_disconnected_at, 
        error_message, metadata, sync_status, sync_progress, created_at, updated_at;
    `;

    const params = [
      salespersonId,
      status,
      provider,
      isDemo,
      qrCode,
      qrExpiresAt,
      lastConnectedAt,
      lastDisconnectedAt,
      errorMessage,
      JSON.stringify(metadata || {}),
      syncStatus,
      syncProgress ? JSON.stringify(syncProgress) : null,
    ];

    const result = await db.query(queryText, params);
    return result.rows[0];
  }

  /**
   * Update connection status for a session
   * @param {string} salespersonId
   * @param {string} status
   * @param {string|null} [errorMessage]
   * @returns {Promise<Object|null>}
   */
  static async updateStatus(salespersonId, status, errorMessage = null) {
    const queryText = `
      UPDATE whatsapp_sessions
      SET 
        status = $1,
        error_message = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE salesperson_id = $3
      RETURNING id, salesperson_id, status, provider, is_demo, updated_at;
    `;
    const result = await db.query(queryText, [status, errorMessage, salespersonId]);
    return result.rows[0] || null;
  }

  /**
   * Update synchronization status and progress
   * @param {string} salespersonId
   * @param {string} syncStatus
   * @param {Object|null} [syncProgress]
   * @returns {Promise<Object|null>}
   */
  static async updateSyncStatus(salespersonId, syncStatus, syncProgress = null) {
    const queryText = `
      UPDATE whatsapp_sessions
      SET 
        sync_status = $1,
        sync_progress = COALESCE($2, sync_progress),
        updated_at = CURRENT_TIMESTAMP
      WHERE salesperson_id = $3
      RETURNING id, salesperson_id, status, sync_status, sync_progress, updated_at;
    `;
    const result = await db.query(queryText, [
      syncStatus,
      syncProgress ? JSON.stringify(syncProgress) : null,
      salespersonId,
    ]);
    return result.rows[0] || null;
  }

  /**
   * Find all active sessions that can be recovered on server startup
   * @returns {Promise<Array<Object>>}
   */
  static async findActiveSessions() {
    const queryText = `
      SELECT 
        ws.id, ws.salesperson_id, ws.status, ws.provider, ws.is_demo, 
        ws.qr_code, ws.qr_expires_at, ws.last_connected_at, ws.last_disconnected_at, 
        ws.error_message, ws.metadata, ws.sync_status, ws.sync_progress, ws.created_at, ws.updated_at,
        s.name AS salesperson_name, s.phone_number AS salesperson_phone, s.is_active AS salesperson_is_active
      FROM whatsapp_sessions ws
      JOIN salespersons s ON s.id = ws.salesperson_id
      WHERE ws.status = 'Connected' 
        AND s.is_active = TRUE 
        AND s.deleted_at IS NULL
      ORDER BY ws.last_connected_at DESC NULLS LAST;
    `;
    const result = await db.query(queryText);
    return result.rows;
  }

  /**
   * Mark session as disconnected
   * @param {string} salespersonId
   * @returns {Promise<Object|null>}
   */
  static async markDisconnected(salespersonId) {
    const queryText = `
      UPDATE whatsapp_sessions
      SET 
        status = 'Disconnected',
        qr_code = NULL,
        qr_expires_at = NULL,
        last_disconnected_at = CURRENT_TIMESTAMP,
        error_message = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE salesperson_id = $1
      RETURNING id, salesperson_id, status, provider, is_demo, last_disconnected_at;
    `;
    const result = await db.query(queryText, [salespersonId]);
    return result.rows[0] || null;
  }
}

module.exports = WhatsAppSessionModel;

