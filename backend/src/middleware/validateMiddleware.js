/**
 * Input validation middleware for Authentication and Requests
 */

function validateLoginInput(req, res, next) {
  const { username, password } = req.body;

  const errors = [];

  if (!username || typeof username !== 'string' || username.trim() === '') {
    errors.push('Username is required.');
  } else if (username.trim().length < 3 || username.trim().length > 50) {
    errors.push('Username must be between 3 and 50 characters.');
  }

  if (!password || typeof password !== 'string') {
    errors.push('Password is required.');
  } else if (password.length < 6) {
    errors.push('Password must be at least 6 characters.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors,
    });
  }

  // Normalize inputs
  req.body.username = username.trim();
  req.body.password = password;

  next();
}

module.exports = {
  validateLoginInput,
};

