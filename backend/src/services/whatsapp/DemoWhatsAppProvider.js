const WhatsAppProvider = require('./WhatsAppProvider');

/**
 * DemoWhatsAppProvider
 * Safe evaluation adapter that provides simulated lifecycle states for Phase 3 UI testing.
 * 
 * SAFETY GUARANTEES:
 * - Explicitly labeled as isDemo: true.
 * - Never claims a real WhatsApp connection is established.
 * - Never attempts unauthorized reverse-engineering of WhatsApp protocols.
 * - Disallows any message sending or data exfiltration.
 */
class DemoWhatsAppProvider extends WhatsAppProvider {
  constructor() {
    super('demo');
    this.isDemo = true;
    // In-memory active demo sessions cache
    this.sessions = new Map();
  }

  supportsQRRefresh() {
    return true;
  }

  /**
   * Initiate a demo connection session
   * @param {Object} salesperson
   */
  async initiateConnection(salesperson) {
    const now = Date.now();
    const qrExpiresAt = new Date(now + 60 * 1000).toISOString(); // 60s expiration

    // Safe demo QR content explicitly watermarked as demo
    const demoQrPayload = `DEMO_WHATSAPP_PAIRING:SALESPERSON=${salesperson.id};PHONE=${salesperson.phone_number};CREATED=${now};EXPIRES=${qrExpiresAt}`;

    const sessionData = {
      salespersonId: salesperson.id,
      phone: salesperson.phone_number,
      name: salesperson.name,
      status: 'Waiting for QR Scan',
      provider: 'demo',
      isDemo: true,
      isRealConnection: false,
      qrCode: demoQrPayload,
      qrExpiresAt,
      createdAt: new Date(now).toISOString(),
      lastCheckedAt: new Date(now).toISOString(),
      message: 'DEMO MODE: Scan interface demonstration active. Real WhatsApp pairing requires a production provider adapter.',
    };

    this.sessions.set(salesperson.id, sessionData);

    return {
      success: true,
      status: sessionData.status,
      provider: 'demo',
      isDemo: true,
      isRealConnection: false,
      qrCode: sessionData.qrCode,
      qrExpiresAt: sessionData.qrExpiresAt,
      message: sessionData.message,
    };
  }

  /**
   * Check connection status
   * Automatically handles QR expiration after 60 seconds
   * @param {string} salespersonId
   */
  async getConnectionStatus(salespersonId) {
    const session = this.sessions.get(salespersonId);
    if (!session) {
      return {
        status: 'Not Connected',
        provider: 'demo',
        isDemo: true,
        isRealConnection: false,
        qrCode: null,
        qrExpiresAt: null,
        message: 'No connection has been initiated for this salesperson.',
      };
    }

    // Check for QR expiration
    if (session.status === 'Waiting for QR Scan' && session.qrExpiresAt) {
      const expiresAtTime = new Date(session.qrExpiresAt).getTime();
      if (Date.now() > expiresAtTime) {
        session.status = 'QR Expired';
        session.qrCode = null;
        session.message = 'QR code has expired. Please refresh to generate a new pairing code.';
      }
    }

    session.lastCheckedAt = new Date().toISOString();

    return {
      status: session.status,
      provider: 'demo',
      isDemo: true,
      isRealConnection: false,
      qrCode: session.qrCode,
      qrExpiresAt: session.qrExpiresAt,
      message: session.message,
    };
  }

  /**
   * Get active QR code payload
   * @param {string} salespersonId
   */
  async getQRCode(salespersonId) {
    const statusData = await this.getConnectionStatus(salespersonId);
    return {
      qrCode: statusData.qrCode,
      qrExpiresAt: statusData.qrExpiresAt,
      status: statusData.status,
      isExpired: statusData.status === 'QR Expired',
      isDemo: true,
      provider: 'demo',
      message: statusData.message,
    };
  }

  /**
   * Refresh expired QR code
   * @param {string} salespersonId
   */
  async refreshQRCode(salespersonId) {
    const session = this.sessions.get(salespersonId);
    if (!session) {
      throw new Error('Cannot refresh QR code. Connection has not been initiated.');
    }

    const now = Date.now();
    const qrExpiresAt = new Date(now + 60 * 1000).toISOString();
    const demoQrPayload = `DEMO_WHATSAPP_PAIRING:SALESPERSON=${salespersonId};PHONE=${session.phone};REFRESHED=${now};EXPIRES=${qrExpiresAt}`;

    session.status = 'Waiting for QR Scan';
    session.qrCode = demoQrPayload;
    session.qrExpiresAt = qrExpiresAt;
    session.message = 'DEMO MODE: Refreshed pairing QR code.';

    return {
      success: true,
      status: session.status,
      qrCode: session.qrCode,
      qrExpiresAt: session.qrExpiresAt,
      isDemo: true,
      provider: 'demo',
      message: session.message,
    };
  }

  /**
   * Demo session recovery stub
   * @param {Object} salesperson
   */
  async recoverSession(salesperson) {
    return true;
  }

  /**
   * Demo session recovery all stub
   */
  async recoverAllSessions() {
    return { recovered: 0, total: 0 };
  }

  /**
   * Purge session from in-memory cache
   * @param {string} salespersonId
   */
  async purgeSession(salespersonId) {
    this.sessions.delete(salespersonId);
  }

  /**
   * Disconnect session
   * @param {string} salespersonId
   */
  async disconnect(salespersonId) {
    const session = this.sessions.get(salespersonId);
    if (session) {
      session.status = 'Disconnected';
      session.qrCode = null;
      session.qrExpiresAt = null;
      session.message = 'Session disconnected by administrator.';
      this.sessions.delete(salespersonId);
    }

    return {
      success: true,
      status: 'Disconnected',
      provider: 'demo',
      isDemo: true,
      message: 'Connection terminated.',
    };
  }
}

module.exports = DemoWhatsAppProvider;

