/**
 * WhatsAppProvider (Base Interface / Abstract Class)
 * Defines standard lifecycle operations for WhatsApp connection providers.
 */
class WhatsAppProvider {
  constructor(name = 'base') {
    this.name = name;
    this.isDemo = false;
  }

  /**
   * Initiate a new WhatsApp connection workflow for a salesperson
   * @param {Object} salesperson The salesperson database entity
   * @returns {Promise<Object>} Connection session state
   */
  async initiateConnection(salesperson) {
    throw new Error('initiateConnection() must be implemented by provider adapter.');
  }

  /**
   * Query the live connection status for a salesperson
   * @param {string} salespersonId UUID of salesperson
   * @returns {Promise<Object>} Status payload
   */
  async getConnectionStatus(salespersonId) {
    throw new Error('getConnectionStatus() must be implemented by provider adapter.');
  }

  /**
   * Get the current active QR code payload
   * @param {string} salespersonId UUID of salesperson
   * @returns {Promise<Object>} QR code payload
   */
  async getQRCode(salespersonId) {
    throw new Error('getQRCode() must be implemented by provider adapter.');
  }

  /**
   * Refresh/regenerate expired QR code
   * @param {string} salespersonId UUID of salesperson
   * @returns {Promise<Object>} Refreshed QR code payload
   */
  async refreshQRCode(salespersonId) {
    throw new Error('refreshQRCode() must be implemented by provider adapter.');
  }

  /**
   * Disconnect an active or pending connection
   * @param {string} salespersonId UUID of salesperson
   * @returns {Promise<Object>} Disconnect result
   */
  async disconnect(salespersonId) {
    throw new Error('disconnect() must be implemented by provider adapter.');
  }

  /**
   * Check if this provider supports QR code refresh
   * @returns {boolean}
   */
  supportsQRRefresh() {
    return false;
  }

  /**
   * Return provider capabilities and metadata
   */
  getMetadata() {
    return {
      provider: this.name,
      isDemo: this.isDemo,
      supportsQRRefresh: this.supportsQRRefresh(),
      supportsRealMessaging: false, // Strict safety guarantee
    };
  }
}

module.exports = WhatsAppProvider;

