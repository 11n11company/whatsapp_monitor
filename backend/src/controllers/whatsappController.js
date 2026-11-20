const ConnectionManager = require('../services/whatsapp/ConnectionManager');
const SalespersonModel = require('../models/salespersonModel');

/**
 * Initiate WhatsApp connection workflow
 * POST /api/whatsapp/connect/:salespersonId
 */
async function connect(req, res, next) {
  try {
    const { salespersonId } = req.params;

    // Verify salesperson exists
    const salesperson = await SalespersonModel.findById(salespersonId);
    if (!salesperson) {
      return res.status(404).json({
        success: false,
        message: 'Salesperson not found.',
      });
    }

    // Only active salespersons may connect
    if (!salesperson.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Cannot initiate WhatsApp connection for an inactive or deactivated salesperson.',
      });
    }

    const sessionResult = await ConnectionManager.initiateConnection(salesperson);

    return res.status(200).json({
      success: true,
      message: 'Connection initialization complete.',
      data: sessionResult,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current connection status
 * GET /api/whatsapp/status/:salespersonId
 */
async function getStatus(req, res, next) {
  try {
    const { salespersonId } = req.params;

    const salesperson = await SalespersonModel.findById(salespersonId);
    if (!salesperson) {
      return res.status(404).json({
        success: false,
        message: 'Salesperson not found.',
      });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const statusData = await ConnectionManager.getStatus(salespersonId);

    return res.status(200).json({
      success: true,
      data: {
        ...statusData,
        salespersonName: salesperson.name,
        phoneNumber: salesperson.phone_number,
        isActive: salesperson.is_active,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get synchronization status and metrics
 * GET /api/whatsapp/sync-status/:salespersonId
 */
async function getSyncStatus(req, res, next) {
  try {
    const { salespersonId } = req.params;

    const salesperson = await SalespersonModel.findById(salespersonId);
    if (!salesperson) {
      return res.status(404).json({
        success: false,
        message: 'Salesperson not found.',
      });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const syncData = await ConnectionManager.getSyncStatus(salespersonId);

    return res.status(200).json({
      success: true,
      data: {
        ...syncData,
        salespersonName: salesperson.name,
        phoneNumber: salesperson.phone_number,
        isActive: salesperson.is_active,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current QR code
 * GET /api/whatsapp/qr/:salespersonId
 */
async function getQRCode(req, res, next) {
  try {
    const { salespersonId } = req.params;

    const salesperson = await SalespersonModel.findById(salespersonId);
    if (!salesperson) {
      return res.status(404).json({
        success: false,
        message: 'Salesperson not found.',
      });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const qrData = await ConnectionManager.getQRCode(salespersonId);

    return res.status(200).json({
      success: true,
      data: qrData,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Refresh expired QR code
 * POST /api/whatsapp/refresh-qr/:salespersonId
 */
async function refreshQRCode(req, res, next) {
  try {
    const { salespersonId } = req.params;

    const salesperson = await SalespersonModel.findById(salespersonId);
    if (!salesperson) {
      return res.status(404).json({
        success: false,
        message: 'Salesperson not found.',
      });
    }

    const refreshResult = await ConnectionManager.refreshQRCode(salespersonId);

    return res.status(200).json({
      success: true,
      message: 'QR code refreshed successfully.',
      data: refreshResult,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Terminate/disconnect session
 * POST /api/whatsapp/disconnect/:salespersonId
 */
async function disconnect(req, res, next) {
  try {
    const { salespersonId } = req.params;

    const salesperson = await SalespersonModel.findById(salespersonId);
    if (!salesperson) {
      return res.status(404).json({
        success: false,
        message: 'Salesperson not found.',
      });
    }

    const disconnectResult = await ConnectionManager.disconnect(salespersonId);

    return res.status(200).json({
      success: true,
      message: 'WhatsApp session disconnected.',
      data: disconnectResult,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  connect,
  getStatus,
  getSyncStatus,
  getQRCode,
  refreshQRCode,
  disconnect,
};

