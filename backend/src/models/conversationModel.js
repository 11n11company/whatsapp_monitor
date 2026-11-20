const db = require('../config/db');

class ConversationModel {
  /**
   * Find or create conversation for a salesperson and customer pairing
   * @param {string} salespersonId
   * @param {string} customerId
   * @returns {Promise<Object>}
   */
  static async findOrCreate(salespersonId, customerId) {
    const queryText = `
      INSERT INTO conversations (salesperson_id, customer_id)
      VALUES ($1, $2)
      ON CONFLICT (salesperson_id, customer_id) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, salesperson_id, customer_id, last_message_at, last_message_preview, created_at, updated_at;
    `;

    const result = await db.query(queryText, [salespersonId, customerId]);
    return result.rows[0];
  }

  /**
   * Find conversation by UUID with customer and salesperson metadata
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const queryText = `
      SELECT conv.id, conv.salesperson_id, conv.customer_id, conv.last_message_at, conv.last_message_preview, conv.created_at, conv.updated_at,
             c.display_name AS customer_name, c.phone_number AS customer_phone, c.whatsapp_id,
             c.contact_type, c.group_subject, c.lid_jid,
             s.name AS salesperson_name, s.phone_number AS salesperson_phone
      FROM conversations conv
      JOIN customers c ON c.id = conv.customer_id
      JOIN salespersons s ON s.id = conv.salesperson_id
      WHERE conv.id = $1
      LIMIT 1;
    `;
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find conversations for a specific customer
   * @param {string} customerId
   * @returns {Promise<Array<Object>>}
   */
  static async findByCustomerId(customerId) {
    const queryText = `
      SELECT conv.id, conv.salesperson_id, conv.customer_id, conv.last_message_at, conv.last_message_preview, conv.created_at, conv.updated_at,
             s.name AS salesperson_name, s.phone_number AS salesperson_phone
      FROM conversations conv
      JOIN salespersons s ON s.id = conv.salesperson_id
      WHERE conv.customer_id = $1
      ORDER BY conv.last_message_at DESC NULLS LAST;
    `;
    const result = await db.query(queryText, [customerId]);
    return result.rows;
  }

  /**
   * Update the latest message timestamp and preview text for a conversation
   * @param {string} id
   * @param {Object} data
   * @param {string|Date} data.lastMessageAt
   * @param {string} data.lastMessagePreview
   * @returns {Promise<Object>}
   */
  static async updateLastMessage(id, { lastMessageAt, lastMessagePreview }) {
    const queryText = `
      UPDATE conversations
      SET last_message_at = $1,
          last_message_preview = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND (last_message_at IS NULL OR last_message_at <= $1)
      RETURNING id, salesperson_id, customer_id, last_message_at, last_message_preview, updated_at;
    `;

    const result = await db.query(queryText, [lastMessageAt, lastMessagePreview, id]);
    return result.rows[0] || null;
  }
}

module.exports = ConversationModel;

