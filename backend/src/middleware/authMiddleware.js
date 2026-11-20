const jwt = require('jsonwebtoken');
const config = require('../config/env');
const AdminUserModel = require('../models/adminUserModel');

/**
 * Standard Admin Authentication Middleware (for general APIs)
 * Strictly verifies admin token; rejects scoped media/stream tickets
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    let token = null;

    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({
          success: false,
          message: 'Invalid authorization format. Format must be: Bearer <token>',
        });
      }
      token = parts[1];
    } else if (req.query && req.query.token) {
      token = String(req.query.token);
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authorization token provided.',
      });
    }

    jwt.verify(token, config.jwt.secret, async (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            message: 'Session expired. Please log in again.',
            code: 'TOKEN_EXPIRED',
          });
        }
        return res.status(401).json({
          success: false,
          message: 'Invalid or tampered authentication token.',
          code: 'TOKEN_INVALID',
        });
      }

      // Security Guard: Scoped tickets (media_ticket, stream_ticket) cannot access general APIs
      if (decoded.scope && (decoded.scope === 'media_stream' || decoded.scope === 'sse_stream')) {
        return res.status(403).json({
          success: false,
          code: 'SCOPED_TOKEN_RESTRICTED',
          message: 'Access denied. Scoped media/stream tickets cannot be used to access application APIs.',
        });
      }

      const userId = decoded.id || decoded.sub;
      const user = await AdminUserModel.findById(userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User associated with this token no longer exists.',
        });
      }

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Admin account has been deactivated.',
        });
      }

      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. Admin privileges required.',
        });
      }

      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        lastLogin: user.last_login,
      };

      next();
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Generate a short-lived, single-media scoped access ticket (valid for 5 minutes)
 */
function createMediaTicket(mediaId, user) {
  return jwt.sign(
    {
      sub: user.id,
      scope: 'media_stream',
      mediaId,
      type: 'media_ticket',
    },
    config.jwt.secret,
    { expiresIn: '5m' }
  );
}

/**
 * Generate a short-lived SSE stream ticket (valid for 2 minutes)
 */
function createStreamTicket(user) {
  return jwt.sign(
    {
      sub: user.id,
      scope: 'sse_stream',
      type: 'stream_ticket',
    },
    config.jwt.secret,
    { expiresIn: '2m' }
  );
}

/**
 * Middleware for media streaming authentication
 * Accepts:
 *  1. Header: Authorization: Bearer <adminToken>
 *  2. Query ticket: ?ticket=<mediaTicket> (scoped strictly to req.params.mediaId)
 *  3. Backward-compat query token: ?token=<adminToken>
 */
async function verifyMediaTicket(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const ticketParam = req.query?.ticket;
    const tokenParam = req.query?.token;
    const targetMediaId = req.params.mediaId;

    let token = null;
    let isTicket = false;

    if (ticketParam) {
      token = String(ticketParam);
      isTicket = true;
    } else if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    } else if (tokenParam) {
      token = String(tokenParam);
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Valid media authorization header or ticket required.',
      });
    }

    jwt.verify(token, config.jwt.secret, async (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            code: 'MEDIA_TICKET_EXPIRED',
            message: 'Media access ticket has expired. Please request a fresh ticket.',
          });
        }
        return res.status(401).json({
          success: false,
          code: 'MEDIA_TICKET_INVALID',
          message: 'Invalid or tampered media ticket.',
        });
      }

      // If a scoped ticket was used, verify scope and mediaId binding
      if (decoded.scope === 'media_stream' || isTicket) {
        if (decoded.scope !== 'media_stream') {
          return res.status(403).json({
            success: false,
            code: 'INVALID_TICKET_SCOPE',
            message: 'Invalid ticket scope for media streaming.',
          });
        }

        if (decoded.mediaId !== targetMediaId) {
          return res.status(403).json({
            success: false,
            code: 'MEDIA_TICKET_MISMATCH',
            message: 'Access denied. Ticket is not valid for this media attachment.',
          });
        }
      } else if (decoded.scope === 'sse_stream') {
        return res.status(403).json({
          success: false,
          code: 'INVALID_TICKET_SCOPE',
          message: 'SSE stream ticket cannot be used for media streaming.',
        });
      }

      const userId = decoded.id || decoded.sub;
      const user = await AdminUserModel.findById(userId);
      if (!user || !user.is_active || user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Admin authorization required for media streaming.',
        });
      }

      req.user = user;
      next();
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware for SSE live-stream authentication
 * Accepts:
 *  1. Header: Authorization: Bearer <adminToken>
 *  2. Query ticket: ?ticket=<streamTicket> (scope: sse_stream)
 *  3. Backward-compat query token: ?token=<adminToken>
 */
async function verifyStreamTicket(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const ticketParam = req.query?.ticket;
    const tokenParam = req.query?.token;

    let token = null;

    if (ticketParam) {
      token = String(ticketParam);
    } else if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    } else if (tokenParam) {
      token = String(tokenParam);
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Valid stream ticket or authorization header required.',
      });
    }

    jwt.verify(token, config.jwt.secret, async (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            code: 'STREAM_TICKET_EXPIRED',
            message: 'Live stream connection ticket expired.',
          });
        }
        return res.status(401).json({
          success: false,
          code: 'STREAM_TICKET_INVALID',
          message: 'Invalid stream token.',
        });
      }

      if (decoded.scope === 'media_stream') {
        return res.status(403).json({
          success: false,
          code: 'INVALID_TICKET_SCOPE',
          message: 'Media ticket cannot be used for SSE stream.',
        });
      }

      const userId = decoded.id || decoded.sub;
      const user = await AdminUserModel.findById(userId);
      if (!user || !user.is_active || user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Admin authorization required.',
        });
      }

      req.user = user;
      next();
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  authenticateToken,
  authMiddleware: authenticateToken,
  createMediaTicket,
  createStreamTicket,
  verifyMediaTicket,
  verifyStreamTicket,
};
