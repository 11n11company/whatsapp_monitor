const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const SalespersonModel = require('../models/salespersonModel');
const ConnectionManager = require('../services/whatsapp/ConnectionManager');

/**
 * List all salespersons with optional search and status filtering
 * GET /api/salespersons
 */
async function listSalespersons(req, res, next) {
  try {
    const { search, status, is_active } = req.query;

    let isActiveBool = undefined;
    if (is_active === 'true') isActiveBool = true;
    if (is_active === 'false') isActiveBool = false;

    const salespersons = await SalespersonModel.findAll({
      search,
      connectionStatus: status,
      isActive: isActiveBool,
    });

    return res.status(200).json({
      success: true,
      count: salespersons.length,
      data: salespersons,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single salesperson by ID
 * GET /api/salespersons/:id
 */
async function getSalespersonById(req, res, next) {
  try {
    const { id } = req.params;
    const salesperson = await SalespersonModel.findById(id);

    if (!salesperson) {
      return res.status(404).json({
        success: false,
        message: 'Salesperson not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: salesperson,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new salesperson
 * POST /api/salespersons
 */
async function createSalesperson(req, res, next) {
  try {
    const { name, phone_number, email, connection_status } = req.body;

    // Check for duplicate phone number
    const existing = await SalespersonModel.findByPhoneNumber(phone_number);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A salesperson with phone number "${phone_number}" already exists (${existing.name}).`,
        code: 'DUPLICATE_PHONE_NUMBER',
      });
    }

    const created = await SalespersonModel.create({
      name,
      phoneNumber: phone_number,
      email,
      connectionStatus: connection_status || 'Not Connected',
    });

    return res.status(201).json({
      success: true,
      message: 'Salesperson registered successfully.',
      data: created,
    });
  } catch (error) {
    // Catch PostgreSQL unique constraint violation (code 23505)
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A salesperson with this phone number already exists.',
        code: 'DUPLICATE_PHONE_NUMBER',
      });
    }
    next(error);
  }
}

/**
 * Update an existing salesperson
 * PATCH /api/salespersons/:id
 */
async function updateSalesperson(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await SalespersonModel.findById(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Salesperson not found.',
      });
    }

    // Check if updating phone number causes duplicate with another salesperson
    if (req.sanitizedFields.phone_number && req.sanitizedFields.phone_number !== existing.phone_number) {
      const duplicate = await SalespersonModel.findByPhoneNumber(req.sanitizedFields.phone_number, id);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Phone number "${req.sanitizedFields.phone_number}" is already assigned to salesperson "${duplicate.name}".`,
          code: 'DUPLICATE_PHONE_NUMBER',
        });
      }
    }

    const updated = await SalespersonModel.update(id, req.sanitizedFields);

    return res.status(200).json({
      success: true,
      message: 'Salesperson updated successfully.',
      data: updated,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A salesperson with this phone number already exists.',
        code: 'DUPLICATE_PHONE_NUMBER',
      });
    }
    next(error);
  }
}

/**
 * Soft-delete or completely purge a salesperson and all their data
 * DELETE /api/salespersons/:id(?purge=true)
 */
async function deleteSalesperson(req, res, next) {
  try {
    const { id } = req.params;
    const { purge } = req.query;
    const existing = await SalespersonModel.findById(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Salesperson not found.',
      });
    }

    if (purge === 'true') {
      // 1. Purge active WhatsApp socket and session credentials on disk
      await ConnectionManager.purgeSession(id);

      // 2. Remove any associated media attachment files on disk
      try {
        const mediaRes = await db.query(
          `SELECT ma.id, ma.file_path 
           FROM messages m 
           JOIN media_attachments ma ON ma.id = m.media_id 
           WHERE m.salesperson_id = $1`,
          [id]
        );
        for (const row of mediaRes.rows) {
          if (row.file_path) {
            const fullPath = path.resolve(__dirname, '../../storage/media', path.basename(row.file_path));
            if (fs.existsSync(fullPath)) {
              try { fs.unlinkSync(fullPath); } catch {}
            }
          }
        }
      } catch (mediaErr) {
        console.warn('[DeleteSalesperson] Media purge notice:', mediaErr.message);
      }

      // 3. Delete salesperson from PostgreSQL (cascades to whatsapp_sessions, customers, conversations, messages)
      const purged = await SalespersonModel.hardDelete(id);

      return res.status(200).json({
        success: true,
        message: `Salesperson "${existing.name}" and all associated chats, customers, and data have been completely removed.`,
        data: purged,
        purged: true,
      });
    }

    const deactivated = await SalespersonModel.softDelete(id);

    return res.status(200).json({
      success: true,
      message: `Salesperson "${existing.name}" has been deactivated. Historical records preserved.`,
      data: deactivated,
      purged: false,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listSalespersons,
  getSalespersonById,
  createSalesperson,
  updateSalesperson,
  deleteSalesperson,
};

