const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MediaModel = require('../../models/mediaModel');

const MEDIA_STORAGE_DIR = path.resolve(__dirname, '../../../storage/media');
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB max file size

// Ensure private media storage directory exists
if (!fs.existsSync(MEDIA_STORAGE_DIR)) {
  fs.mkdirSync(MEDIA_STORAGE_DIR, { recursive: true });
}

// Comprehensive allowlist of verified WhatsApp media MIME types
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  // Videos
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
  'video/mpeg',
  // Audio & Voice Notes
  'audio/ogg',
  'audio/opus',
  'audio/ogg; codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/wav',
  'audio/amr',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/octet-stream', // Generic fallback binary
]);

class MediaService {
  /**
   * Get the private disk path for a media file with strict path-traversal prevention
   * @param {string} fileName
   * @returns {string}
   */
  static getStoragePath(fileName) {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('Invalid media file name');
    }

    // Strict path traversal mitigation: disallow directory navigation sequences
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      throw new Error('Path traversal attempt detected');
    }

    const safeBase = path.basename(fileName);
    const resolved = path.resolve(MEDIA_STORAGE_DIR, safeBase);

    // Enforce that resolved path resides strictly within MEDIA_STORAGE_DIR
    if (!resolved.startsWith(MEDIA_STORAGE_DIR + path.sep) && resolved !== MEDIA_STORAGE_DIR) {
      throw new Error('Path traversal attempt detected');
    }

    return resolved;
  }

  /**
   * Validate MIME type against allowed list
   * @param {string} mimeType
   */
  static isAllowedMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') return false;
    const clean = mimeType.split(';')[0].trim().toLowerCase();
    return ALLOWED_MIME_TYPES.has(clean) || ALLOWED_MIME_TYPES.has(mimeType.toLowerCase());
  }

  /**
   * Save media buffer to private storage with a unique randomized filename and deduplication
   * @param {Buffer} buffer
   * @param {string} originalName
   * @param {string} mimeType
   * @returns {Promise<Object>}
   */
  static async savePrivateMedia(buffer, originalName, mimeType) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Invalid media buffer: expected Buffer instance.');
    }

    // 1. File Size Validation (100MB limit)
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      const err = new Error(`File exceeds maximum permitted size of 100MB (received ${buffer.length} bytes).`);
      err.code = 'FILE_TOO_LARGE';
      throw err;
    }

    if (buffer.length === 0) {
      const err = new Error('Cannot store empty media file (0 bytes).');
      err.code = 'FILE_EMPTY';
      throw err;
    }

    // 2. MIME Type Validation
    const cleanMime = mimeType ? mimeType.trim().toLowerCase() : 'application/octet-stream';
    if (!this.isAllowedMimeType(cleanMime)) {
      const err = new Error(`Unsupported or disallowed media MIME type: ${mimeType}`);
      err.code = 'INVALID_MIME_TYPE';
      throw err;
    }

    // 3. Deduplication via SHA-256 Checksum
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const existing = await MediaModel.findByChecksum(checksum);
    if (existing) {
      const existingFullPath = this.getStoragePath(existing.file_path);
      if (fs.existsSync(existingFullPath)) {
        // Return existing record to avoid redundant disk writes and duplicate storage
        return existing;
      }
    }

    // 4. Randomized Safe Filename Generation
    const ext = path.extname(originalName || '').toLowerCase() || '';
    const safeName = `media_${Date.now()}_${crypto.randomUUID()}${ext}`;
    const filePath = this.getStoragePath(safeName);

    await fs.promises.writeFile(filePath, buffer);

    // 5. Database Record Creation
    const mediaRecord = await MediaModel.create({
      fileName: path.basename(originalName || safeName),
      filePath: safeName, // relative filename
      mimeType: cleanMime,
      fileSizeBytes: buffer.length,
      checksum,
    });

    return mediaRecord;
  }

  /**
   * Retrieve media record and file stream for an authenticated request
   * @param {string} mediaId
   * @returns {Promise<{ record: Object, fullPath: string }|null>}
   */
  static async getMediaForStreaming(mediaId) {
    const record = await MediaModel.findById(mediaId);
    if (!record) return null;

    try {
      const fullPath = this.getStoragePath(record.file_path);
      if (!fs.existsSync(fullPath)) {
        return null;
      }
      return { record, fullPath };
    } catch {
      return null;
    }
  }

  /**
   * Helper to download media message from Baileys if needed
   * @param {Object} rawMsg
   * @param {Object} [socket]
   * @returns {Promise<Buffer|null>}
   */
  static async downloadBaileysMedia(rawMsg, socket = null) {
    try {
      const baileys = require('@whiskeysockets/baileys');
      const downloadMedia = baileys.downloadMediaMessage;
      if (typeof downloadMedia === 'function') {
        const buffer = await downloadMedia(
          rawMsg,
          'buffer',
          {},
          {
            reuploadRequest: socket?.updateMediaMessage,
          }
        );
        return buffer;
      }
    } catch (err) {
      console.warn('[MediaService] Baileys download media message notice:', err.message);
    }
    return null;
  }
}

module.exports = MediaService;
