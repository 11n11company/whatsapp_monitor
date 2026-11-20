/**
 * Phone Number Normalization and Validation Utilities
 * Complies with ITU E.164 international numbering standard.
 */

/**
 * Normalizes a phone number into strict E.164 format (+<country_code><subscriber_number>)
 * @param {string} phone
 * @returns {string} Normalized phone number
 */
function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return '';
  }

  // Remove whitespace, dashes, parentheses, dots
  let cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '');

  // Handle international '00' prefix
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  // Ensure it starts with '+'
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  return cleaned;
}

/**
 * Validates whether a phone number meets the E.164 international standard
 * @param {string} phone
 * @returns {{ isValid: boolean, normalized: string, error: string|null }}
 */
function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string' || phone.trim() === '') {
    return {
      isValid: false,
      normalized: '',
      error: 'Phone number is required.',
    };
  }

  const normalized = normalizePhoneNumber(phone);

  // E.164 regex: + followed by 1-9, then 6 to 14 additional digits (total 7-15 digits)
  const e164Regex = /^\+[1-9]\d{6,14}$/;

  if (!e164Regex.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: 'Invalid phone number format. Must include country code and 7-15 digits (e.g. +15552345678 or +919876543210).',
    };
  }

  return {
    isValid: true,
    normalized,
    error: null,
  };
}

module.exports = {
  normalizePhoneNumber,
  validatePhoneNumber,
};

