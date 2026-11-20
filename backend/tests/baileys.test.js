/**
 * Phase 4 Verification Test Suite: Baileys WhatsApp Real Provider, Session Encryption, & Multi-Agent Architecture
 */
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const http = require('http');
const app = require('../src/app');
const config = require('../src/config/env');
const db = require('../src/config/db');
const sessionCrypto = require('../src/services/whatsapp/sessionCrypto');
const { useEncryptedAuthState } = require('../src/services/whatsapp/encryptedAuthState');
const BaileysWhatsAppProvider = require('../src/services/whatsapp/BaileysWhatsAppProvider');
const MessageHandler = require('../src/services/whatsapp/MessageHandler');
const ConnectionManager = require('../src/services/whatsapp/ConnectionManager');

function makeRequest(server, options, postData) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            json = body;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        });
      }
    );

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

// Mock socket simulating Baileys socket event emitter
class MockWASocket {
  constructor() {
    this.ev = new EventEmitter();
    this.isClosed = false;
  }
  end() {
    this.isClosed = true;
  }
}

async function runPhase4Tests() {
  console.log('--- Starting Phase 4 Real WhatsApp Provider & Security Verification Suite ---');
  await db.testConnection();

  const server = app.listen(0);
  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} ${details}`);
      failed++;
    }
  }

  try {
    // ==========================================
    // 1. Session Cryptography & Authenticated Encryption (AES-256-GCM)
    // ==========================================
    console.log('\n  [Group 1] Cryptographic Session Security at Rest:');
    const testSecret = '{"creds":{"privateKey":"TOP_SECRET_WHATSAPP_PRIVATE_KEY_12345"}}';
    const encrypted = sessionCrypto.encrypt(testSecret);
    assert('AES-256-GCM encrypts payload to binary Buffer', Buffer.isBuffer(encrypted));
    assert('Encrypted payload does NOT contain plaintext secret', !encrypted.toString('utf8').includes('TOP_SECRET'));

    const decrypted = sessionCrypto.decrypt(encrypted).toString('utf8');
    assert('AES-256-GCM decrypts payload back to exact plaintext', decrypted === testSecret);

    // Tampering test
    let tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff; // Flip a bit
    let tamperCaught = false;
    try {
      sessionCrypto.decrypt(tampered);
    } catch {
      tamperCaught = true;
    }
    assert('Tampered ciphertext fails authenticated decryption', tamperCaught);

    // Test useEncryptedAuthState
    const testStorageDir = path.resolve(__dirname, '../storage/test_sessions_auth');
    const authState = await useEncryptedAuthState(testStorageDir);
    assert('Encrypted auth state initializes creds', typeof authState.state.creds === 'object');

    const credsEncFile = path.join(testStorageDir, 'creds.enc');
    assert('Creds file exists on disk with .enc extension', fs.existsSync(credsEncFile));
    const rawOnDisk = fs.readFileSync(credsEncFile).toString('utf8');
    assert('Creds on disk are NOT raw JSON', !rawOnDisk.includes('"noiseKey"'));

    // Clean up test dir
    await authState.clearSession();
    assert('clearSession securely purges session files', !fs.existsSync(testStorageDir));

    // ==========================================
    // 2. Baileys Provider Lifecycle & Event Handling
    // ==========================================
    console.log('\n  [Group 2] Baileys Provider Lifecycle & Events:');
    const provider = new BaileysWhatsAppProvider();
    assert('Provider name is "baileys"', provider.name === 'baileys');
    assert('Provider isDemo is false (Real Provider)', provider.isDemo === false);

    // Admin login
    const loginRes = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
      username: config.adminSeed.username,
      password: config.adminSeed.password,
    });
    const token = loginRes.body?.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // Register active salesperson
    const testSpPhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
    const spRes = await makeRequest(server, { path: '/api/salespersons', method: 'POST', headers: authHeaders }, {
      name: 'Agent Alpha',
      phone_number: testSpPhone,
      email: 'alpha@company.com',
    });
    const salesperson = spRes.body?.data;
    const spId = salesperson.id;

    // Simulate session with mock socket to test events
    const sessionDir = provider.getSessionDir(spId);
    const spAuthState = await useEncryptedAuthState(sessionDir);
    const mockSocket = new MockWASocket();

    const sessionContext = {
      salespersonId: spId,
      salespersonName: salesperson.name,
      salespersonPhone: salesperson.phone_number,
      authState: spAuthState,
      socket: mockSocket,
      status: 'Initializing',
      provider: 'baileys',
      isDemo: false,
      isRealConnection: false,
      qrCode: null,
      qrExpiresAt: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      message: '',
    };
    provider.activeSessions.set(spId, sessionContext);

    // Event 1: QR update
    const realSampleQR = '2@u8R/sampleRealWhatsAppWebQRCodePayloadFromBaileysGateway==';
    await provider.handleConnectionUpdate(sessionContext, { qr: realSampleQR });
    assert('QR event transitions state to "Waiting for QR Scan"', sessionContext.status === 'Waiting for QR Scan');
    assert('Stores real QR code payload', sessionContext.qrCode === realSampleQR);
    assert('Sets QR expiration timestamp', typeof sessionContext.qrExpiresAt === 'string');

    // Event 2: Connection open (Device scanned and paired)
    await provider.handleConnectionUpdate(sessionContext, { connection: 'open' });
    assert('Connection open event transitions state to "Connected"', sessionContext.status === 'Connected');
    assert('isRealConnection is true', sessionContext.isRealConnection === true);
    assert('QR code is cleared upon connection', sessionContext.qrCode === null);

    // Event 3: Connection close with reconnectable error (515 restartRequired)
    await provider.handleConnectionUpdate(sessionContext, {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } },
    });
    assert('Reconnectable close triggers "Connecting" state', sessionContext.status === 'Connecting');
    assert('Increments reconnectAttempts', sessionContext.reconnectAttempts === 1);
    clearTimeout(sessionContext.reconnectTimer);

    // Event 4: Connection close with loggedOut (401)
    await provider.handleConnectionUpdate(sessionContext, {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });
    assert('LoggedOut event transitions state to "Disconnected"', sessionContext.status === 'Disconnected');
    assert('isRealConnection is reset to false', sessionContext.isRealConnection === false);

    // Clean up
    await provider.disconnect(spId);

    // ==========================================
    // 3. Multi-Salesperson Independent Sessions (5 Salespersons)
    // ==========================================
    console.log('\n  [Group 3] Multiple Salesperson Independent Sessions (5 Salespersons):');
    const multiReps = [];
    for (let i = 1; i <= 5; i++) {
      const repPhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
      const repRes = await makeRequest(server, { path: '/api/salespersons', method: 'POST', headers: authHeaders }, {
        name: `Salesperson ${i}`,
        phone_number: repPhone,
      });
      multiReps.push(repRes.body?.data);
    }
    assert('Successfully registered 5 separate salespersons', multiReps.length === 5);

    // Set provider in ConnectionManager to test multi-session independence
    ConnectionManager.setProvider(provider);

    // Initialize session contexts for each
    const testSockets = [];
    for (const rep of multiReps) {
      const dir = provider.getSessionDir(rep.id);
      const auth = await useEncryptedAuthState(dir);
      const sock = new MockWASocket();
      testSockets.push(sock);
      const ctx = {
        salespersonId: rep.id,
        salespersonName: rep.name,
        salespersonPhone: rep.phone_number,
        authState: auth,
        socket: sock,
        status: 'Waiting for QR Scan',
        provider: 'baileys',
        isDemo: false,
        isRealConnection: false,
        qrCode: `QR_DATA_${rep.id}`,
        qrExpiresAt: new Date(Date.now() + 60000).toISOString(),
        reconnectAttempts: 0,
      };
      provider.activeSessions.set(rep.id, ctx);
    }

    assert('5 independent sessions active simultaneously', provider.activeSessions.size >= 5);

    // Pair Salesperson 2 only
    const rep2Context = provider.activeSessions.get(multiReps[1].id);
    await provider.handleConnectionUpdate(rep2Context, { connection: 'open' });
    assert('Salesperson 2 status is "Connected"', rep2Context.status === 'Connected');

    // Verify other salespersons remain unchanged
    const rep1Context = provider.activeSessions.get(multiReps[0].id);
    const rep3Context = provider.activeSessions.get(multiReps[2].id);
    assert('Salesperson 1 remains "Waiting for QR Scan"', rep1Context.status === 'Waiting for QR Scan');
    assert('Salesperson 3 remains "Waiting for QR Scan"', rep3Context.status === 'Waiting for QR Scan');

    // Disconnect Salesperson 2
    await provider.disconnect(multiReps[1].id);
    assert('Salesperson 2 disconnected', provider.activeSessions.get(multiReps[1].id) === undefined);
    assert('Salesperson 1 is unaffected by Salesperson 2 disconnect', provider.activeSessions.get(multiReps[0].id) !== undefined);

    // Clean up all test sessions
    for (const rep of multiReps) {
      await provider.disconnect(rep.id);
    }

    // ==========================================
    // 4. Message Ingestion Preparation
    // ==========================================
    console.log('\n  [Group 4] Message Ingestion Event Normalization:');
    let capturedMessage = null;
    const bus = MessageHandler.getEventBus();
    const messageListener = (msg) => {
      capturedMessage = msg;
    };
    bus.once('message', messageListener);

    // Simulate incoming customer message
    MessageHandler.handleMessagesUpsert(
      { salespersonId: 'sp-1', salespersonPhone: '+15551111111', salespersonName: 'Alice' },
      {
        messages: [
          {
            key: { id: 'MSG_001', remoteJid: '15559998888@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Hello, what are your product pricing options?' },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        ],
      }
    );

    assert('Message event received on event bus', capturedMessage !== null);
    assert('Incoming customer message has isFromMe = false', capturedMessage?.isFromMe === false);
    assert('Customer phone extracted from JID', capturedMessage?.customerPhone === '15559998888' || capturedMessage?.customerPhone === '+15559998888');
    assert('Text content captured correctly', capturedMessage?.text === 'Hello, what are your product pricing options?');

    // Simulate outgoing salesperson message
    let outgoingMessage = null;
    bus.once('message', (msg) => {
      outgoingMessage = msg;
    });
    MessageHandler.handleMessagesUpsert(
      { salespersonId: 'sp-1', salespersonPhone: '+15551111111', salespersonName: 'Alice' },
      {
        messages: [
          {
            key: { id: 'MSG_002', remoteJid: '15559998888@s.whatsapp.net', fromMe: true },
            message: { conversation: 'Hi! Sending you our catalog right now.' },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        ],
      }
    );
    assert('Outgoing salesperson message has isFromMe = true', outgoingMessage?.isFromMe === true);

    // ==========================================
    // 5. Security & Read-Only Endpoint Guarantees
    // ==========================================
    console.log('\n  [Group 5] API Security & Read-Only Constraints:');

    // Verify non-existent outgoing messaging endpoints return 404
    const sendRes1 = await makeRequest(server, { path: '/api/whatsapp/send', method: 'POST', headers: authHeaders }, {});
    assert('POST /api/whatsapp/send returns 404 (No message sending API)', sendRes1.status === 404);

    const sendRes2 = await makeRequest(server, { path: '/api/messages/send', method: 'POST', headers: authHeaders }, {});
    assert('POST /api/messages/send returns 404 (Strictly read-only)', sendRes2.status === 404);

    const replyRes = await makeRequest(server, { path: '/api/whatsapp/reply', method: 'POST', headers: authHeaders }, {});
    assert('POST /api/whatsapp/reply returns 404', replyRes.status === 404);

    // Verify no credentials leaked in API responses
    const statusApiRes = await makeRequest(server, { path: `/api/whatsapp/status/${spId}`, method: 'GET', headers: authHeaders });
    assert('Status response does NOT contain private keys', !JSON.stringify(statusApiRes.body).includes('privateKey'));
    assert('Status response does NOT contain authState', !JSON.stringify(statusApiRes.body).includes('authState'));
    assert('Status response does NOT contain noiseKey', !JSON.stringify(statusApiRes.body).includes('noiseKey'));

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
    console.log(`\n--- Phase 4 Test Results: ${passed} Passed, ${failed} Failed ---`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase4Tests();

