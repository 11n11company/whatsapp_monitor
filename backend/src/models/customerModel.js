const db = require('../config/db');

/**
 * Validates and sanitizes a potential display name.
 * Strictly prevents raw WhatsApp JIDs or bare phone numbers from being saved as display names.
 * @param {string|null} rawName
 * @param {string|null} phoneNumber
 * @param {string} whatsappId
 * @returns {string|null}
 */
function sanitizeDisplayName(rawName, phoneNumber = null, whatsappId = '') {
  if (!rawName || typeof rawName !== 'string') return null;
  const trimmed = rawName.trim();
  if (!trimmed) return null;

  // Reject raw JIDs
  if (
    trimmed.includes('@s.whatsapp.net') ||
    trimmed.includes('@g.us') ||
    trimmed.includes('@lid') ||
    trimmed.includes('@c.us') ||
    trimmed.includes('@broadcast') ||
    trimmed.startsWith('status@')
  ) {
    return null;
  }

  // Reject exact match with whatsappId or phoneNumber
  if (trimmed === whatsappId || (phoneNumber && trimmed === phoneNumber)) {
    return null;
  }

  // Reject pure phone number strings (e.g. +917736916485 or 917736916485)
  const digitsOnly = trimmed.replace(/[\s\+\-\(\)]/g, '');
  if (/^\d{7,16}$/.test(digitsOnly) && (trimmed.startsWith('+') || /^\d+$/.test(trimmed))) {
    return null;
  }

  return trimmed;
}

class CustomerModel {
  static sanitizeDisplayName(rawName, phoneNumber = null, whatsappId = '') {
    return sanitizeDisplayName(rawName, phoneNumber, whatsappId);
  }

  /**
   * Upsert a customer record for a salesperson with group & LID support
   * @param {Object} data
   * @param {string} data.salespersonId
   * @param {string} data.whatsappId
   * @param {string} [data.phoneNumber]
   * @param {string} [data.displayName]
   * @param {'individual'|'group'} [data.contactType='individual']
   * @param {string} [data.groupSubject]
   * @param {string} [data.lidJid]
   * @param {string} [data.profilePictureUrl]
   * @returns {Promise<Object>}
   */
  static async upsert({
    salespersonId,
    whatsappId,
    phoneNumber = null,
    displayName = null,
    contactType = 'individual',
    groupSubject = null,
    lidJid = null,
    profilePictureUrl = null,
  }) {
    const isGroup = whatsappId.endsWith('@g.us') || contactType === 'group';
    const resolvedContactType = isGroup ? 'group' : 'individual';
    const cleanPhone = isGroup ? null : (phoneNumber || null);

    // Sanitize display name so raw JIDs and bare phone numbers are never stored
    let cleanDisplayName = sanitizeDisplayName(displayName, cleanPhone, whatsappId);
    let cleanGroupSubject = groupSubject ? groupSubject.trim() : null;

    if (isGroup) {
      if (cleanGroupSubject && !cleanDisplayName) {
        cleanDisplayName = cleanGroupSubject;
      } else if (cleanDisplayName && !cleanGroupSubject) {
        cleanGroupSubject = cleanDisplayName;
      }
    }

    const queryText = `
      INSERT INTO customers (
        salesperson_id, whatsapp_id, phone_number, display_name,
        contact_type, group_subject, lid_jid, profile_picture_url,
        last_contact_update
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (salesperson_id, whatsapp_id) DO UPDATE SET
        display_name = CASE
          -- If existing record already has a real name and new name is null/empty, keep existing
          WHEN $4 IS NULL OR TRIM($4) = '' THEN customers.display_name
          -- If new name is a raw JID or phone number, reject it and keep existing
          WHEN $4 LIKE '%@%' OR $4 = customers.phone_number THEN customers.display_name
          -- Otherwise adopt the newer clean name
          ELSE $4
        END,
        group_subject = COALESCE($6, customers.group_subject),
        phone_number = CASE
          WHEN customers.contact_type = 'group' THEN NULL
          ELSE COALESCE($3, customers.phone_number)
        END,
        contact_type = COALESCE($5, customers.contact_type),
        lid_jid = COALESCE($7, customers.lid_jid),
        profile_picture_url = COALESCE($8, customers.profile_picture_url),
        last_contact_update = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING 
        id, salesperson_id, whatsapp_id, phone_number, display_name,
        contact_type, group_subject, lid_jid, profile_picture_url,
        last_contact_update, created_at, updated_at;
    `;

    const params = [
      salespersonId,
      whatsappId,
      cleanPhone,
      cleanDisplayName,
      resolvedContactType,
      cleanGroupSubject,
      lidJid || null,
      profilePictureUrl || null,
    ];

    const result = await db.query(queryText, params);
    return result.rows[0];
  }

  /**
   * Update group subject and display name when group metadata changes
   * @param {string} salespersonId
   * @param {string} whatsappId
   * @param {string} groupSubject
   */
  static async updateGroupSubject(salespersonId, whatsappId, groupSubject) {
    if (!groupSubject || !whatsappId || !whatsappId.endsWith('@g.us')) return null;
    const cleanSubject = groupSubject.trim();
    if (!cleanSubject) return null;

    const queryText = `
      UPDATE customers
      SET group_subject = $1,
          display_name = $1,
          contact_type = 'group',
          last_contact_update = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE salesperson_id = $2 AND whatsapp_id = $3
      RETURNING id, salesperson_id, whatsapp_id, phone_number, display_name, contact_type, group_subject;
    `;
    const result = await db.query(queryText, [cleanSubject, salespersonId, whatsappId]);
    return result.rows[0] || null;
  }

  /**
   * Update customer display name by phone number if current name is missing or invalid
   * @param {string} salespersonId
   * @param {string} phoneNumber
   * @param {string} displayName
   */
  static async updateDisplayNameByPhone(salespersonId, phoneNumber, displayName) {
    const cleanName = sanitizeDisplayName(displayName, phoneNumber);
    if (!cleanName || !phoneNumber) return null;

    const queryText = `
      UPDATE customers
      SET display_name = $1,
          last_contact_update = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE salesperson_id = $2 
        AND phone_number = $3
        AND (
          display_name IS NULL 
          OR display_name = '' 
          OR display_name = phone_number 
          OR display_name LIKE '%@%'
        )
      RETURNING id, salesperson_id, whatsapp_id, phone_number, display_name;
    `;
    const result = await db.query(queryText, [cleanName, salespersonId, phoneNumber]);
    return result.rows[0] || null;
  }

  /**
   * Store or update a WhatsApp LID to Phone JID mapping
   * @param {string} salespersonId
   * @param {string} lidJid
   * @param {string} phoneJid
   */
  static async storeLidMapping(salespersonId, lidJid, phoneJid) {
    if (!salespersonId || !lidJid || !phoneJid) return;
    try {
      const queryText = `
        INSERT INTO lid_mappings (salesperson_id, lid_jid, phone_jid, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (salesperson_id, lid_jid) DO UPDATE SET
          phone_jid = EXCLUDED.phone_jid,
          updated_at = CURRENT_TIMESTAMP;
      `;
      await db.query(queryText, [salespersonId, lidJid, phoneJid]);
    } catch (err) {
      console.warn('[CustomerModel] storeLidMapping notice:', err.message);
    }
  }

  /**
   * Look up a phone JID for a given LID
   * @param {string} salespersonId
   * @param {string} lidJid
   * @returns {Promise<string|null>}
   */
  static async findPhoneJidByLid(salespersonId, lidJid) {
    if (!salespersonId || !lidJid) return null;
    try {
      const queryText = `
        SELECT phone_jid FROM lid_mappings
        WHERE salesperson_id = $1 AND lid_jid = $2
        LIMIT 1;
      `;
      const result = await db.query(queryText, [salespersonId, lidJid]);
      return result.rows[0]?.phone_jid || null;
    } catch {
      return null;
    }
  }

  /**
   * Find a customer by salesperson ID and WhatsApp identifier (remoteJid or LID)
   * @param {string} salespersonId
   * @param {string} whatsappId
   * @returns {Promise<Object|null>}
   */
  static async findBySalespersonAndWhatsAppId(salespersonId, whatsappId) {
    const queryText = `
      SELECT id, salesperson_id, whatsapp_id, phone_number, display_name,
             contact_type, group_subject, lid_jid, profile_picture_url,
             last_contact_update, created_at, updated_at
      FROM customers
      WHERE salesperson_id = $1 AND (whatsapp_id = $2 OR lid_jid = $2)
      LIMIT 1;
    `;
    const result = await db.query(queryText, [salespersonId, whatsappId]);
    return result.rows[0] || null;
  }

  /**
   * Find a customer by UUID with salesperson metadata
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const queryText = `
      SELECT c.id, c.salesperson_id, c.whatsapp_id, c.phone_number, c.display_name,
             c.contact_type, c.group_subject, c.lid_jid, c.profile_picture_url,
             c.last_contact_update, c.created_at, c.updated_at,
             s.name AS salesperson_name, s.phone_number AS salesperson_phone
      FROM customers c
      JOIN salespersons s ON s.id = c.salesperson_id
      WHERE c.id = $1
      LIMIT 1;
    `;
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }

  /**
   * List paginated customers for a specific salesperson with search support
   * @param {string} salespersonId
   * @param {Object} options
   * @param {string} [options.search]
   * @param {number} [options.limit=20]
   * @param {number} [options.offset=0]
   * @returns {Promise<Array<Object>>}
   */
  static async findBySalespersonId(salespersonId, { search, limit = 20, offset = 0 } = {}) {
    const conditions = ['c.salesperson_id = $1'];
    const params = [salespersonId];

    if (search && search.trim() !== '') {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(LOWER(COALESCE(c.display_name, '')) LIKE $${idx} OR LOWER(COALESCE(c.group_subject, '')) LIKE $${idx} OR c.phone_number LIKE $${idx} OR c.whatsapp_id LIKE $${idx})`
      );
    }

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const queryText = `
      SELECT c.id, c.salesperson_id, c.whatsapp_id, c.phone_number, c.display_name,
             c.contact_type, c.group_subject, c.lid_jid, c.profile_picture_url,
             c.last_contact_update, c.created_at, c.updated_at,
             conv.id AS conversation_id, conv.last_message_at, conv.last_message_preview
      FROM customers c
      LEFT JOIN conversations conv ON conv.customer_id = c.id AND conv.salesperson_id = c.salesperson_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY conv.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `;

    const result = await db.query(queryText, params);
    return result.rows;
  }

  /**
   * Count total customers for a salesperson with optional search
   * @param {string} salespersonId
   * @param {Object} options
   * @param {string} [options.search]
   * @returns {Promise<number>}
   */
  static async countBySalespersonId(salespersonId, { search } = {}) {
    const conditions = ['salesperson_id = $1'];
    const params = [salespersonId];

    if (search && search.trim() !== '') {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(LOWER(COALESCE(display_name, '')) LIKE $${idx} OR LOWER(COALESCE(group_subject, '')) LIKE $${idx} OR phone_number LIKE $${idx} OR whatsapp_id LIKE $${idx})`
      );
    }

    const queryText = `
      SELECT COUNT(*) AS total
      FROM customers
      WHERE ${conditions.join(' AND ')};
    `;

    const result = await db.query(queryText, params);
    return parseInt(result.rows[0]?.total || '0', 10);
  }
}

module.exports = CustomerModel;
