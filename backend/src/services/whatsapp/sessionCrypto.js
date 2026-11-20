const crypto = require('crypto');
const config = require('../../config/env');

// Authenticated Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits for GCM

/**
 * Derives a 32-byte cryptographic key from the configured secret
 * @param {string} [customKey] Optional override key
 * @returns {Buffer} 32-byte Buffer key
 */
function getEncryptionKey(customKey = null) {
  const secret = customKey || config.sessionEncryptionKey || process.env.SESSION_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      '[Security Error] SESSION_ENCRYPTION_KEY is not defined in environment variables. ' +
      'Cannot initialize WhatsApp session storage without authenticated encryption at rest.'
    );
  }
  // Ensure exactly 32 bytes using SHA-256
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts arbitrary buffer or string using AES-256-GCM
 * Output format: [12 bytes IV][16 bytes Auth Tag][Ciphertext...]
 * @param {string|Buffer} data
 * @param {Buffer} [key]
 * @returns {Buffer}
 */
function encrypt(data, key = null) {
  const encKey = key || getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encKey, iv);

  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const ciphertext = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]);
}

/**
 * Decrypts an AES-256-GCM encrypted buffer
 * @param {Buffer} encryptedBuffer
 * @param {Buffer} [key]
 * @returns {Buffer} Plaintext buffer
 */
function decrypt(encryptedBuffer, key = null) {
  const encKey = key || getEncryptionKey();

  if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted payload: buffer too short.');
  }

  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const tag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = encryptedBuffer.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, encKey, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = {
  getEncryptionKey,
  encrypt,
  decrypt,
};

