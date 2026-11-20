const db = require('../config/db');

class MessageModel {
  /**
   * Insert a new message record with idempotent conflict handling
   * @param {Object} data
   * @param {string} data.conversationId
   * @param {string} data.salespersonId
   * @param {string} data.customerId
   * @param {string} data.whatsappMessageId
   * @param {'incoming'|'outgoing'} data.direction
   * @param {string} [data.messageType='text']
   * @param {string} [data.messageText]
   * @param {string} [data.mediaId]
   * @param {string} [data.participantJid]
   * @param {string} [data.participantName]
   * @param {string|Date} data.messageTimestamp
   * @returns {Promise<Object|null>} Returns inserted message or null if duplicate
   */
  static async create({
    conversationId,
    salespersonId,
    customerId,
    whatsappMessageId,
    direction,
    messageType = 'text',
    messageText = '',
    mediaId = null,
    participantJid = null,
    participantName = null,
    messageTimestamp,
  }) {
    const queryText = `
      INSERT INTO messages (
        conversation_id,
        salesperson_id,
        customer_id,
        whatsapp_message_id,
        direction,
        message_type,
        message_text,
        media_id,
        participant_jid,
        participant_name,
        message_timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (salesperson_id, whatsapp_message_id) DO NOTHING
      RETURNING 
        id, conversation_id, salesperson_id, customer_id, whatsapp_message_id,
        direction, message_type, message_text, media_id, participant_jid, participant_name,
        message_timestamp, created_at;
    `;

    const params = [
      conversationId,
      salespersonId,
      customerId,
      whatsappMessageId,
      direction,
      messageType,
      messageText || null,
      mediaId || null,
      participantJid || null,
      participantName || null,
      messageTimestamp,
    ];

    const result = await db.query(queryText, params);
    return result.rows[0] || null;
  }

  /**
   * Find message by salesperson ID and WhatsApp message ID
   * @param {string} salespersonId
   * @param {string} whatsappMessageId
   * @returns {Promise<Object|null>}
   */
  static async findBySalespersonAndWhatsAppMessageId(salespersonId, whatsappMessageId) {
    const queryText = `
      SELECT id, conversation_id, salesperson_id, customer_id, whatsapp_message_id,
             direction, message_type, message_text, media_id, participant_jid, participant_name,
             message_timestamp, created_at
      FROM messages
      WHERE salesperson_id = $1 AND whatsapp_message_id = $2
      LIMIT 1;
    `;
    const result = await db.query(queryText, [salespersonId, whatsappMessageId]);
    return result.rows[0] || null;
  }

  /**
   * List paginated messages for a conversation.
   * Retrieves the most recent messages for the conversation and orders them chronologically.
   * @param {string} conversationId
   * @param {Object} options
   * @param {number} [options.limit=20]
   * @param {number} [options.offset=0]
   * @returns {Promise<Array<Object>>}
   */
  static async findByConversationId(conversationId, { limit = 20, offset = 0 } = {}) {
    const queryText = `
      SELECT * FROM (
        SELECT m.id, m.conversation_id, m.salesperson_id, m.customer_id, m.whatsapp_message_id,
               m.direction, m.message_type, m.message_text, m.media_id, m.participant_jid, m.participant_name,
               m.message_timestamp, m.created_at,
               med.file_name AS media_file_name, med.mime_type AS media_mime_type, med.file_size_bytes AS media_file_size
        FROM messages m
        LEFT JOIN media_attachments med ON med.id = m.media_id
        WHERE m.conversation_id = $1
        ORDER BY m.message_timestamp DESC, m.created_at DESC
        LIMIT $2 OFFSET $3
      ) sub
      ORDER BY sub.message_timestamp ASC, sub.created_at ASC;
    `;
    const result = await db.query(queryText, [conversationId, limit, offset]);
    return result.rows;
  }

  /**
   * Count total messages in a conversation
   * @param {string} conversationId
   * @returns {Promise<number>}
   */
  static async countByConversationId(conversationId) {
    const queryText = `
      SELECT COUNT(*) AS total
      FROM messages
      WHERE conversation_id = $1;
    `;
    const result = await db.query(queryText, [conversationId]);
    return parseInt(result.rows[0]?.total || '0', 10);
  }
}

module.exports = MessageModel;
