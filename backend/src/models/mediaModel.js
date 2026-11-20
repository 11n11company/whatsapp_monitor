const db = require('../config/db');

class MediaModel {
  /**
   * Register a private media attachment
   * @param {Object} data
   * @param {string} data.fileName
   * @param {string} data.filePath
   * @param {string} data.mimeType
   * @param {number} [data.fileSizeBytes=0]
   * @param {string} [data.checksum]
   * @returns {Promise<Object>}
   */
  static async create({ fileName, filePath, mimeType, fileSizeBytes = 0, checksum = null }) {
    const queryText = `
      INSERT INTO media_attachments (file_name, file_path, mime_type, file_size_bytes, checksum)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, file_name, file_path, mime_type, file_size_bytes, checksum, created_at;
    `;

    const result = await db.query(queryText, [fileName, filePath, mimeType, fileSizeBytes, checksum]);
    return result.rows[0];
  }

  /**
   * Find a media attachment by SHA-256 checksum (deduplication)
   * @param {string} checksum
   * @returns {Promise<Object|null>}
   */
  static async findByChecksum(checksum) {
    if (!checksum) return null;
    const queryText = `
      SELECT id, file_name, file_path, mime_type, file_size_bytes, checksum, created_at
      FROM media_attachments
      WHERE checksum = $1
      LIMIT 1;
    `;
    const result = await db.query(queryText, [checksum]);
    return result.rows[0] || null;
  }

  /**
   * Find a media attachment by UUID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const queryText = `
      SELECT id, file_name, file_path, mime_type, file_size_bytes, checksum, created_at
      FROM media_attachments
      WHERE id = $1
      LIMIT 1;
    `;
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }
}

module.exports = MediaModel;

