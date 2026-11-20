const jwt = require('jsonwebtoken');
const config = require('../config/env');
const AdminUserModel = require('../models/adminUserModel');

/**
 * Handle Admin Login
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body;

    // Retrieve admin record from database
    const admin = await AdminUserModel.findByUsername(username);

    // Prevent user enumeration attacks: use constant-time response logic
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    if (!admin.is_active) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated.',
      });
    }

    // Verify bcrypt password hash
    const isMatch = await AdminUserModel.verifyPassword(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    // Enforce that only authorized admin role can log in
    if (admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access restricted to system administrators.',
      });
    }

    // Update last login timestamp in database
    await AdminUserModel.updateLastLogin(admin.id);

    // Generate JWT token
    const tokenPayload = {
      id: admin.id,
      username: admin.username,
      role: admin.role,
    };

    const token = jwt.sign(tokenPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        fullName: admin.full_name,
        role: admin.role,
        lastLogin: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current authenticated admin user profile
 * GET /api/auth/me
 */
async function getMe(req, res, next) {
  try {
    // req.user is set by authenticateToken middleware
    return res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin Logout
 * POST /api/auth/logout
 */
async function logout(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      message: 'Logout successful. Client session cleared.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  getMe,
  logout,
};

