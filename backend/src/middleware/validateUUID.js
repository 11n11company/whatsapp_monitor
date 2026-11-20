const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates a middleware that validates a specific route parameter as a UUID
 * @param {string} paramName e.g. 'salespersonId', 'customerId', 'conversationId'
 */
function validateUUID(paramName) {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!value || !UUID_REGEX.test(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format. A valid UUID is required.`,
      });
    }
    next();
  };
}

module.exports = {
  validateUUID,
  UUID_REGEX,
};

