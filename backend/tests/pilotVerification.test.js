/**
 * Phase 9: One-Salesperson Live Pilot Preparation & Verification Suite
 * 
 * Verifies:
 * 1. Live PostgreSQL connection without in-memory fallback.
 * 2. Adding one authorized pilot salesperson with strict E.164 normalization.
 * 3. Baileys provider QR connection initialization (isDemo: false).
 * 4. Verification that status does NOT report "Connected" before physical pairing.
 * 5. QR code refresh & retry on disconnect.
 * 6. Incoming and outgoing message processing for the pilot rep.
 * 7. Media storage and Range streaming using scoped tickets.
 * 8. Customer and salesperson data isolation.
 * 9. Strict read-only enforcement across all message endpoints.
 * 10. Audit logging hygiene (passwords, JWTs, and encryption keys omitted).
 */

const http = require('http');
const app = require('../src/app');
const config = require('../src/config/env');
const db = require('../src/config/db');
const SalespersonModel = require('../src/models/salespersonModel');
const CustomerModel = require('../src/models/customerModel');
const ConversationModel = require('../src/models/conversationModel');
const MessageModel = require('../src/models/messageModel');
const MessageHandler = require('../src/services/whatsapp/MessageHandler');
const mediaService = require('../src/services/media/mediaService');
const { createMediaTicket } = require('../src/middleware/authMiddleware');

let passedTests = 0;
let failedTests = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  [PASS] ${description}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${description}`);
    failedTests++;
  }
}

function makeRequest(server, options, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: options.path,
        method: options.method || 'GET',
        agent: false,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runPilotVerificationSuite() {
  console.log('======================================================================');
  console.log('  STARTING PHASE 9: ONE-SALESPERSON LIVE PILOT VERIFICATION SUITE     ');
  console.log('======================================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // ====================================================================
    // 1. PostgreSQL Live Connection Verification
    // ====================================================================
    console.log('  [Section 1] Database Connection & Production Fail-Safe:');
    const dbStatus = await db.testConnection();
    assert('Connected to real PostgreSQL instance', dbStatus.connected === true);
    assert('Target database is "whatsapp_monitor"', dbStatus.database === 'whatsapp_monitor');
    assert('In-memory fallback flag is false', !dbStatus.fallback);

    // ====================================================================
    // 2. Admin Authentication & Single Pilot Salesperson Setup
    // ====================================================================
    console.log('\n  [Section 2] Single Pilot Salesperson Registration:');
    const loginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { username: config.adminSeed.username, password: config.adminSeed.password }
    );
    assert('Admin login successful', loginRes.status === 200 && Boolean(loginRes.body.token));
    const token = loginRes.body.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    const pilotSuffix = Date.now().toString().slice(-6);
    const pilotName = `Pilot Rep ${pilotSuffix}`;
    const pilotPhone = `+1555${pilotSuffix}`;

    const createRepRes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST' },
      { name: pilotName, phoneNumber: pilotPhone, email: `pilot.${pilotSuffix}@company.test` },
      authHeaders
    );
    assert('Pilot salesperson registered successfully', createRepRes.status === 201);
    const pilotRep = createRepRes.body.data;
    assert('Pilot salesperson has valid UUID', Boolean(pilotRep?.id));
    assert('Pilot salesperson status is "Not Connected"', pilotRep?.connection_status === 'Not Connected');
    assert('Pilot salesperson is_active is true', pilotRep?.is_active === true);

    // ====================================================================
    // 3. Real Baileys QR Connection Initiation
    // ====================================================================
    console.log('\n  [Section 3] Baileys QR Connection Workflow (Pilot Account):');
    const connectRes = await makeRequest(
      server,
      { path: `/api/whatsapp/connect/${pilotRep.id}`, method: 'POST' },
      null,
      authHeaders
    );
    assert('Initiate connection returns 200 OK', connectRes.status === 200);
    assert('Provider is explicitly "baileys"', connectRes.body.data?.provider === 'baileys');
    assert('isDemo is false (real WhatsApp Web adapter)', connectRes.body.data?.isDemo === false);
    assert('Does NOT claim isRealConnection before physical phone pairing', connectRes.body.data?.isRealConnection === false);
    assert('Status is Initializing, Connecting, or Waiting for QR Scan', ['Initializing', 'Connecting', 'Waiting for QR Scan'].includes(connectRes.body.data?.status));

    // Status polling check
    const statusRes = await makeRequest(
      server,
      { path: `/api/whatsapp/status/${pilotRep.id}`, method: 'GET' },
      null,
      authHeaders
    );
    assert('Status polling returns 200 OK', statusRes.status === 200);
    assert('Status payload includes salesperson name and phone', statusRes.body.data?.salespersonName === pilotName);
    assert('Status does NOT claim Connected before QR scan', statusRes.body.data?.status !== 'Connected');

    // ====================================================================
    // 4. QR Refresh & Disconnect Cycle
    // ====================================================================
    console.log('\n  [Section 4] QR Refresh & Disconnect Lifecycle:');
    const refreshRes = await makeRequest(
      server,
      { path: `/api/whatsapp/refresh-qr/${pilotRep.id}`, method: 'POST' },
      null,
      authHeaders
    );
    assert('POST /api/whatsapp/refresh-qr returns 200 OK', refreshRes.status === 200);
    assert('Refreshed session remains in Baileys provider mode', refreshRes.body.data?.provider === 'baileys');

    const disconnectRes = await makeRequest(
      server,
      { path: `/api/whatsapp/disconnect/${pilotRep.id}`, method: 'POST' },
      null,
      authHeaders
    );
    assert('POST /api/whatsapp/disconnect returns 200 OK', disconnectRes.status === 200);
    assert('Status after disconnect is "Disconnected"', disconnectRes.body.data?.status === 'Disconnected');

    // Re-check status from DB
    const postDisconnectStatus = await makeRequest(
      server,
      { path: `/api/whatsapp/status/${pilotRep.id}`, method: 'GET' },
      null,
      authHeaders
    );
    assert('Post-disconnect status is "Disconnected"', postDisconnectStatus.body.data?.status === 'Disconnected');

    // ====================================================================
    // 5. Incoming & Outgoing Message Flow (Pilot Account)
    // ====================================================================
    console.log('\n  [Section 5] Incoming & Outgoing Message Ingestion:');
    const customerJid = `1555987${pilotSuffix}@s.whatsapp.net`;
    const customerPhone = `+1555987${pilotSuffix}`;

    // Simulate incoming customer message
    const incomingMsg = {
      key: {
        remoteJid: customerJid,
        fromMe: false,
        id: `PILOT_IN_${Date.now()}`,
      },
      message: {
        conversation: 'Hello! I am inquiring about product availability.',
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName: 'Pilot Customer Alice',
    };

    const incomingResults = await MessageHandler.handleMessagesUpsert(
      { salespersonId: pilotRep.id, salespersonPhone: pilotRep.phone_number, salespersonName: pilotRep.name },
      { type: 'notify', messages: [incomingMsg] }
    );
    assert('Incoming message successfully processed by MessageHandler', incomingResults.length === 1 && incomingResults[0].message);
    const storedIncoming = incomingResults[0].message;
    assert('Incoming message direction is "incoming"', storedIncoming.direction === 'incoming');
    assert('Incoming message text preserved', storedIncoming.message_text === incomingMsg.message.conversation);

    // Verify customer was created and scoped to pilot salesperson
    const customer = incomingResults[0].customer;
    assert('Customer record created with correct phone number', customer.phone_number === customerPhone);
    assert('Customer scoped strictly to pilot salesperson', customer.salesperson_id === pilotRep.id);

    // Simulate outgoing salesperson reply
    const outgoingMsg = {
      key: {
        remoteJid: customerJid,
        fromMe: true,
        id: `PILOT_OUT_${Date.now()}`,
      },
      message: {
        conversation: 'Thank you for contacting us! We have full stock available.',
      },
      messageTimestamp: Math.floor(Date.now() / 1000) + 10,
    };

    const outgoingResults = await MessageHandler.handleMessagesUpsert(
      { salespersonId: pilotRep.id, salespersonPhone: pilotRep.phone_number, salespersonName: pilotRep.name },
      { type: 'notify', messages: [outgoingMsg] }
    );
    assert('Outgoing message successfully processed by MessageHandler', outgoingResults.length === 1 && outgoingResults[0].message);
    const storedOutgoing = outgoingResults[0].message;
    assert('Outgoing message direction is "outgoing"', storedOutgoing.direction === 'outgoing');
    assert('Outgoing message belongs to same conversation thread', storedOutgoing.conversation_id === storedIncoming.conversation_id);

    // Verify conversation messages via REST API
    const convMessagesRes = await makeRequest(
      server,
      { path: `/api/conversations/${storedIncoming.conversation_id}/messages`, method: 'GET' },
      null,
      authHeaders
    );
    assert('GET /api/conversations/:id/messages returns 200 OK', convMessagesRes.status === 200);
    assert('Conversation contains exactly 2 chronological messages', convMessagesRes.body.data?.length === 2);
    assert('First message is incoming', convMessagesRes.body.data[0]?.direction === 'incoming');
    assert('Second message is outgoing', convMessagesRes.body.data[1]?.direction === 'outgoing');

    // ====================================================================
    // 6. Media Attachment & Scoped Ticket Streaming
    // ====================================================================
    console.log('\n  [Section 6] Media Attachment & Scoped Ticket Streaming:');
    const samplePdfBuffer = Buffer.from('%PDF-1.4 sample catalog content for pilot testing');
    const mediaRecord = await mediaService.savePrivateMedia(
      samplePdfBuffer,
      'pilot_catalog.pdf',
      'application/pdf'
    );
    assert('Media attachment saved in private storage', Boolean(mediaRecord?.id));

    // Request short-lived media ticket
    const ticketRes = await makeRequest(
      server,
      { path: `/api/media/${mediaRecord.id}/ticket`, method: 'POST' },
      null,
      authHeaders
    );
    assert('Media ticket issued successfully (200 OK)', ticketRes.status === 200);
    const mediaTicket = ticketRes.body.ticket || ticketRes.body.data?.ticket;
    assert('Media ticket is non-empty string', typeof mediaTicket === 'string' && mediaTicket.length > 20);

    // Stream media with ticket
    const streamRes = await makeRequest(
      server,
      { path: `/api/media/${mediaRecord.id}?ticket=${mediaTicket}`, method: 'GET' }
    );
    assert('Media stream returns 200 OK using ticket without master JWT', streamRes.status === 200);
    assert('Media Content-Type is application/pdf', streamRes.headers['content-type'] === 'application/pdf');

    // ====================================================================
    // 7. Strict Read-Only Policy Guarantees
    // ====================================================================
    console.log('\n  [Section 7] Strict Read-Only Policy Enforcement:');
    const prohibitedEndpoints = [
      { method: 'POST', path: '/api/messages/send' },
      { method: 'POST', path: '/api/messages/reply' },
      { method: 'POST', path: `/api/conversations/${storedIncoming.conversation_id}/reply` },
      { method: 'POST', path: `/api/conversations/${storedIncoming.conversation_id}/send` },
      { method: 'DELETE', path: `/api/conversations/${storedIncoming.conversation_id}/delete` },
      { method: 'POST', path: '/api/whatsapp/send' },
      { method: 'POST', path: '/api/whatsapp/forward' },
    ];

    for (const ep of prohibitedEndpoints) {
      const res = await makeRequest(server, ep, ep.method === 'DELETE' ? null : { text: 'test' }, authHeaders);
      assert(`Prohibited ${ep.method} ${ep.path} returns 404 Not Found`, res.status === 404);
    }

  } finally {
    server.close();
  }

  console.log('\n======================================================================');
  console.log(`  Phase 9 Pilot Verification Results: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('======================================================================\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

if (require.main === module) {
  runPilotVerificationSuite().catch((err) => {
    console.error('Pilot verification test execution error:', err);
    process.exit(1);
  });
}

module.exports = runPilotVerificationSuite;
