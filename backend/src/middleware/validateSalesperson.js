const { validatePhoneNumber } = require('../utils/phoneUtils');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_STATUSES = [
  'Not Connected',
  'Pending',
  'Initializing',
  'Waiting for QR Scan',
  'QR Expired',
  'Connecting',
  'Connected',
  'Disconnected',
  'Error',
];

/**
 * Validate UUID in request route parameters (e.g. /:id or /:salespersonId)
 */
function validateUUIDParam(req, res, next) {
  const id = req.params.id || req.params.salespersonId;
  if (!id || !UUID_REGEX.test(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid salesperson ID format. A valid UUID is required.',
    });
  }
  next();
}

/**
 * Validate salesperson creation payload (POST /api/salespersons)
 */
function validateCreateSalesperson(req, res, next) {
  const { name, email } = req.body;
  const phone_number = req.body.phone_number || req.body.phoneNumber;
  const connection_status = req.body.connection_status || req.body.connectionStatus;
  const errors = [];

  // Name validation
  if (!name || typeof name !== 'string' || name.trim() === '') {
    errors.push('Salesperson name is required.');
  } else if (name.trim().length < 2 || name.trim().length > 100) {
    errors.push('Salesperson name must be between 2 and 100 characters.');
  }

  // Phone number validation
  const phoneValidation = validatePhoneNumber(phone_number);
  if (!phoneValidation.isValid) {
    errors.push(phoneValidation.error);
  }

  // Email validation (optional)
  let normalizedEmail = null;
  if (email !== undefined && email !== null && String(email).trim() !== '') {
    const trimmedEmail = String(email).trim();
    if (trimmedEmail.length > 100) {
      errors.push('Email address must not exceed 100 characters.');
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.push('Invalid email address format.');
    } else {
      normalizedEmail = trimmedEmail.toLowerCase();
    }
  }

  // Connection status validation (optional, defaults to 'Not Connected')
  let status = 'Not Connected';
  if (connection_status) {
    if (!ALLOWED_STATUSES.includes(connection_status)) {
      errors.push(`Connection status must be one of: ${ALLOWED_STATUSES.join(', ')}.`);
    } else {
      status = connection_status;
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors,
    });
  }

  // Attach sanitized and normalized values to req.body
  req.body.name = name.trim();
  req.body.phone_number = phoneValidation.normalized;
  req.body.email = normalizedEmail;
  req.body.connection_status = status;

  next();
}

/**
 * Validate salesperson update payload (PATCH /api/salespersons/:id)
 */
function validateUpdateSalesperson(req, res, next) {
  const { id } = req.params;
  if (!id || !UUID_REGEX.test(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid salesperson ID format. A valid UUID is required.',
    });
  }

  const name = req.body.name;
  const email = req.body.email;
  const is_active = req.body.is_active;
  const phone_number = req.body.phone_number !== undefined ? req.body.phone_number : req.body.phoneNumber;
  const connection_status = req.body.connection_status !== undefined ? req.body.connection_status : req.body.connectionStatus;
  const errors = [];
  const sanitized = {};

  if (
    name === undefined &&
    phone_number === undefined &&
    email === undefined &&
    is_active === undefined &&
    connection_status === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'No valid fields provided for update. Provide at least one field to update.',
    });
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      errors.push('Salesperson name cannot be empty.');
    } else if (name.trim().length < 2 || name.trim().length > 100) {
      errors.push('Salesperson name must be between 2 and 100 characters.');
    } else {
      sanitized.name = name.trim();
    }
  }

  if (phone_number !== undefined) {
    const phoneValidation = validatePhoneNumber(phone_number);
    if (!phoneValidation.isValid) {
      errors.push(phoneValidation.error);
    } else {
      sanitized.phone_number = phoneValidation.normalized;
    }
  }

  if (email !== undefined) {
    if (email === null || String(email).trim() === '') {
      sanitized.email = null;
    } else {
      const trimmedEmail = String(email).trim();
      if (trimmedEmail.length > 100) {
        errors.push('Email address must not exceed 100 characters.');
      } else if (!EMAIL_REGEX.test(trimmedEmail)) {
        errors.push('Invalid email address format.');
      } else {
        sanitized.email = trimmedEmail.toLowerCase();
      }
    }
  }

  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      errors.push('is_active must be a boolean (true or false).');
    } else {
      sanitized.is_active = is_active;
    }
  }

  if (connection_status !== undefined) {
    if (!ALLOWED_STATUSES.includes(connection_status)) {
      errors.push(`Connection status must be one of: ${ALLOWED_STATUSES.join(', ')}.`);
    } else {
      sanitized.connection_status = connection_status;
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors,
    });
  }

  req.sanitizedFields = sanitized;
  next();
}

module.exports = {
  validateUUIDParam,
  validateCreateSalesperson,
  validateUpdateSalesperson,
};

