const config = require('../../config/env');
const DemoWhatsAppProvider = require('./DemoWhatsAppProvider');
const BaileysWhatsAppProvider = require('./BaileysWhatsAppProvider');
const WhatsAppSessionModel = require('../../models/whatsappSessionModel');
const SalespersonModel = require('../../models/salespersonModel');

class ConnectionManager {
  constructor() {
    // Select provider based on configuration: 'baileys' (Real Provider) or 'demo'
    const providerType = (config.whatsappProvider || 'baileys').toLowerCase();

    if (providerType === 'baileys') {
      this.provider = new BaileysWhatsAppProvider();
    } else {
      this.provider = new DemoWhatsAppProvider();
    }

    console.log(
      `[ConnectionManager] Initialized with active provider: "${this.provider.name}" (isDemo: ${this.provider.isDemo})`
    );
  }

  /**
   * Dynamically switch or set custom provider adapter
   * @param {Object} providerAdapter
   */
  setProvider(providerAdapter) {
    this.provider = providerAdapter;
    console.log(`[ConnectionManager] Active provider switched to: "${this.provider.name}"`);
  }

  /**
   * Get active provider instance
   */
  getProvider() {
    return this.provider;
  }

  /**
   * Initiate connection workflow for an active salesperson
   * @param {Object} salesperson
   */
  async initiateConnection(salesperson) {
    if (!salesperson.is_active) {
      throw new Error('Cannot initiate connection for an inactive salesperson.');
    }

    // Call provider adapter
    const result = await this.provider.initiateConnection(salesperson);

    // Persist session state in database
    await WhatsAppSessionModel.upsertSession({
      salespersonId: salesperson.id,
      status: result.status,
      provider: result.provider,
      isDemo: result.isDemo,
      qrCode: result.qrCode,
      qrExpiresAt: result.qrExpiresAt,
      syncStatus: result.syncStatus || 'Waiting for device pairing',
      syncProgress: result.syncProgress || null,
      metadata: { initiatedBy: 'admin', phone: salesperson.phone_number },
    });

    // Synchronize salesperson connection_status
    await SalespersonModel.update(salesperson.id, {
      connection_status: result.status,
    });

    return {
      ...result,
      salespersonId: salesperson.id,
      salespersonName: salesperson.name,
      phoneNumber: salesperson.phone_number,
      liveMonitoring: result.status === 'Connected',
    };
  }

  /**
   * Query connection status
   * @param {string} salespersonId
   */
  async getStatus(salespersonId) {
    const liveStatus = await this.provider.getConnectionStatus(salespersonId);

    // Update database status if changed
    const dbSession = await WhatsAppSessionModel.findBySalespersonId(salespersonId);
    if (dbSession && dbSession.status !== liveStatus.status) {
      await WhatsAppSessionModel.updateStatus(salespersonId, liveStatus.status);
      await SalespersonModel.update(salespersonId, {
        connection_status: liveStatus.status,
      });
    }

    return {
      salespersonId,
      ...liveStatus,
      syncStatus: dbSession?.sync_status || liveStatus.syncStatus || 'Waiting for device pairing',
      syncProgress: dbSession?.sync_progress || liveStatus.syncProgress || null,
      liveMonitoring: liveStatus.status === 'Connected',
      supportsQRRefresh: this.provider.supportsQRRefresh(),
    };
  }

  /**
   * Query synchronization status and progress
   * @param {string} salespersonId
   */
  async getSyncStatus(salespersonId) {
    const statusData = await this.getStatus(salespersonId);
    return {
      salespersonId,
      connectionStatus: statusData.status,
      syncStatus: statusData.syncStatus,
      syncProgress: statusData.syncProgress,
      liveMonitoring: statusData.liveMonitoring,
      lastSyncAt: statusData.syncProgress?.lastSyncAt || null,
    };
  }

  /**
   * Get active pairing QR code
   * @param {string} salespersonId
   */
  async getQRCode(salespersonId) {
    return this.provider.getQRCode(salespersonId);
  }

  /**
   * Refresh expired pairing QR code
   * @param {string} salespersonId
   */
  async refreshQRCode(salespersonId) {
    if (!this.provider.supportsQRRefresh()) {
      throw new Error(`Provider "${this.provider.name}" does not support manual QR refresh.`);
    }

    const result = await this.provider.refreshQRCode(salespersonId);

    // Update database session
    await WhatsAppSessionModel.upsertSession({
      salespersonId,
      status: result.status,
      provider: result.provider,
      isDemo: result.isDemo,
      qrCode: result.qrCode,
      qrExpiresAt: result.qrExpiresAt,
    });

    // Synchronize salesperson table
    await SalespersonModel.update(salespersonId, {
      connection_status: result.status,
    });

    return result;
  }

  /**
   * Terminate/disconnect connection
   * @param {string} salespersonId
   */
  async disconnect(salespersonId) {
    const result = await this.provider.disconnect(salespersonId);

    // Mark session as disconnected in database
    await WhatsAppSessionModel.markDisconnected(salespersonId);

    // Update salesperson status
    await SalespersonModel.update(salespersonId, {
      connection_status: 'Disconnected',
    });

    return result;
  }

  /**
   * Completely purge provider session, socket, and storage files for a salesperson
   * @param {string} salespersonId
   */
  async purgeSession(salespersonId) {
    if (this.provider && typeof this.provider.purgeSession === 'function') {
      await this.provider.purgeSession(salespersonId);
    }
  }

  /**
   * Recovers all active sessions on backend startup
   */
  async recoverSessions() {
    if (this.provider && typeof this.provider.recoverAllSessions === 'function') {
      return this.provider.recoverAllSessions();
    }
    return { recovered: 0, total: 0 };
  }

  /**
   * Gracefully close all provider sockets during server shutdown
   */
  async shutdown() {
    if (this.provider && typeof this.provider.shutdownAll === 'function') {
      await this.provider.shutdownAll();
    }
  }
}

// Export singleton instance
module.exports = new ConnectionManager();
