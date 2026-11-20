/**
 * Phase 10: Complete Hardcoded Data Removal and Production Readiness Cleanup Verification Suite
 * 
 * Verifies:
 * 1. Database-driven dashboard overview with zero mock/demo objects.
 * 2. Proper empty states across all endpoints (salespersons, customers, conversations, messages, recent activity).
 * 3. Accurate state machine values for WhatsApp pairing (Connecting, Waiting for QR Scan, QR Expired, Connected, Disconnected).
 * 4. Absolute removal of hardcoded personas (Sarah Johnson, Michael Chen, Elena Rostova).
 * 5. Strict read-only supervisory posture (no send/reply/edit/delete/forward).
 */

const http = require('http');
const app = require('../src/app');
const db = require('../src/config/db');
const config = require('../src/config/env');
const SalespersonModel = require('../src/models/salespersonModel');
const CustomerModel = require('../src/models/customerModel');
const ConversationModel = require('../src/models/conversationModel');
const MessageModel = require('../src/models/messageModel');

function makeRequest(server, options, postData = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let body;
        try {
          body = JSON.parse(data);
        } catch {
          body = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}`);
    failed++;
  }
}

async function runCleanDataAuditSuite() {
  console.log('\n======================================================================');
  console.log('  Phase 10: Hardcoded Data Removal & Production Cleanup Audit');
  console.log('======================================================================\n');

  await db.testConnection();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let existingSalespersons = null;

  try {
    // 1. Authenticate Admin
    const loginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { username: config.adminSeed.username, password: config.adminSeed.password }
    );
    assert('Admin authentication succeeds', loginRes.status === 200);
    const token = loginRes.body?.token || loginRes.body?.data?.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // ====================================================================
    // Section 1: Audit Clean Database Empty State
    // ====================================================================
    console.log('\n  [Section 1] Clean Database Empty State:');
    
    // Save existing active salespersons before testing empty baseline
    try {
      existingSalespersons = await db.query('SELECT * FROM salespersons WHERE deleted_at IS NULL;');
    } catch {}

    // Purge operational data to test pure empty state baseline
    await db.query('TRUNCATE messages, media_attachments, conversations, customers, whatsapp_sessions, salespersons CASCADE;');

    // Verify Salespersons endpoint returns empty array (not hardcoded list)
    const spRes = await makeRequest(server, { path: '/api/salespersons', method: 'GET' }, null, authHeaders);
    assert('GET /api/salespersons returns 200', spRes.status === 200);
    assert('Salespersons list is strictly empty array []', Array.isArray(spRes.body?.data) && spRes.body.data.length === 0);
    assert('No mock personas exist in database', JSON.stringify(spRes.body).indexOf('Sarah Johnson') === -1);

    // Verify Dashboard Overview reflects real database counts (all 0)
    const dashRes = await makeRequest(server, { path: '/api/dashboard/overview', method: 'GET' }, null, authHeaders);
    assert('GET /api/dashboard/overview returns 200', dashRes.status === 200);
    assert('totalSalespersons value is 0', dashRes.body?.data?.overview?.totalSalespersons?.value === 0);
    assert('connectedAccounts value is 0', dashRes.body?.data?.overview?.connectedAccounts?.value === 0);
    assert('totalCustomers value is 0', dashRes.body?.data?.overview?.totalCustomers?.value === 0);
    assert('totalConversations value is 0', dashRes.body?.data?.overview?.totalConversations?.value === 0);
    assert('recentActivity is empty array []', Array.isArray(dashRes.body?.data?.recentActivity) && dashRes.body.data.recentActivity.length === 0);
    assert('Dashboard payload has no hardcoded demo flags', dashRes.body?.data?.isDemo === undefined || dashRes.body?.data?.isDemo === false);
    assert('Dashboard payload contains zero references to demo names', JSON.stringify(dashRes.body).indexOf('Elena Rostova') === -1);

    // ====================================================================
    // Section 2: Database-Driven Dynamic Counts
    // ====================================================================
    console.log('\n  [Section 2] Live Database-Driven Dynamic Metrics:');

    // Create a real salesperson record
    const uniquePhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
    const createSpRes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST' },
      { name: 'Pilot Agent Alpha', phone_number: uniquePhone, email: 'pilot.alpha@enterprise.com' },
      authHeaders
    );
    assert('Salesperson created successfully', createSpRes.status === 201);
    const spId = createSpRes.body?.data?.id;

    // Verify Dashboard Overview immediately reflects new salesperson count (1)
    const dashAfterSp = await makeRequest(server, { path: '/api/dashboard/overview', method: 'GET' }, null, authHeaders);
    assert('totalSalespersons dynamically updates to 1', dashAfterSp.body?.data?.overview?.totalSalespersons?.value === 1);
    assert('totalCustomers remains 0 until real chat occurs', dashAfterSp.body?.data?.overview?.totalCustomers?.value === 0);
    assert('totalConversations remains 0 until thread is initiated', dashAfterSp.body?.data?.overview?.totalConversations?.value === 0);

    // Create a customer record
    const customer = await CustomerModel.upsert({
      salespersonId: spId,
      whatsappId: '15559998877@s.whatsapp.net',
      phoneNumber: '+15559998877',
      displayName: 'Corporate Client X',
    });
    assert('Customer created in PostgreSQL', Boolean(customer.id));

    // Verify customer count updates dynamically
    const dashAfterCust = await makeRequest(server, { path: '/api/dashboard/overview', method: 'GET' }, null, authHeaders);
    assert('totalCustomers dynamically updates to 1', dashAfterCust.body?.data?.overview?.totalCustomers?.value === 1);

    // Create a conversation record and message
    const conversation = await ConversationModel.findOrCreate(spId, customer.id);
    assert('Conversation created in PostgreSQL', Boolean(conversation.id));

    const msg = await MessageModel.create({
      conversationId: conversation.id,
      salespersonId: spId,
      customerId: customer.id,
      whatsappMessageId: `MSG_${Date.now()}`,
      direction: 'incoming',
      messageType: 'text',
      messageText: 'Hello, I need pricing information for Q4 enterprise licenses.',
      messageTimestamp: new Date(),
    });
    assert('Message created in PostgreSQL', Boolean(msg.id));

    // Verify Dashboard Overview dynamic conversation and recent activity
    const dashAfterMsg = await makeRequest(server, { path: '/api/dashboard/overview', method: 'GET' }, null, authHeaders);
    assert('totalConversations dynamically updates to 1', dashAfterMsg.body?.data?.overview?.totalConversations?.value === 1);
    assert('recentActivity contains exactly 1 real logged item', dashAfterMsg.body?.data?.recentActivity?.length === 1);
    assert('recentActivity displays real salesperson name', dashAfterMsg.body?.data?.recentActivity[0]?.salesperson === 'Pilot Agent Alpha');
    assert('recentActivity displays genuine message preview', dashAfterMsg.body?.data?.recentActivity[0]?.preview.includes('pricing information'));

    // ====================================================================
    // Section 3: WhatsApp QR State Machine Validation
    // ====================================================================
    console.log('\n  [Section 3] WhatsApp QR Pairing State Machine:');

    // Initiate real WhatsApp pairing via Baileys
    const connectRes = await makeRequest(
      server,
      { path: `/api/whatsapp/connect/${spId}`, method: 'POST' },
      null,
      authHeaders
    );
    assert('Initiate connection returns 200', connectRes.status === 200);
    assert('Session state is valid pairing state (Connecting, Waiting for QR Scan)', 
      ['Initializing', 'Connecting', 'Waiting for QR Scan'].includes(connectRes.body?.data?.status));
    assert('Provider is explicitly "baileys"', connectRes.body?.data?.provider === 'baileys');
    assert('isDemo is strictly false', connectRes.body?.data?.isDemo === false);

    // Query status
    const statusRes = await makeRequest(
      server,
      { path: `/api/whatsapp/status/${spId}`, method: 'GET' },
      null,
      authHeaders
    );
    assert('GET /api/whatsapp/status/:id returns 200', statusRes.status === 200);
    assert('Status polling never reports "Connected" before genuine scan', statusRes.body?.data?.status !== 'Connected');

    // Test disconnect
    const disconnectRes = await makeRequest(
      server,
      { path: `/api/whatsapp/disconnect/${spId}`, method: 'POST' },
      null,
      authHeaders
    );
    assert('POST /api/whatsapp/disconnect returns 200', disconnectRes.status === 200);
    assert('Status transitions cleanly to "Disconnected"', disconnectRes.body?.data?.status === 'Disconnected');

    // ====================================================================
    // Section 4: Strict Read-Only Supervisory Policy
    // ====================================================================
    console.log('\n  [Section 4] Strict Read-Only Supervisory Policy:');

    const prohibitedEndpoints = [
      { path: '/api/messages/send', method: 'POST' },
      { path: '/api/messages/reply', method: 'POST' },
      { path: '/api/messages/delete', method: 'POST' },
      { path: `/api/conversations/${conversation.id}/send`, method: 'POST' },
      { path: `/api/conversations/${conversation.id}/reply`, method: 'POST' },
      { path: `/api/conversations/${conversation.id}/delete`, method: 'DELETE' },
      { path: '/api/whatsapp/send', method: 'POST' },
      { path: '/api/whatsapp/forward', method: 'POST' },
    ];

    for (const ep of prohibitedEndpoints) {
      const res = await makeRequest(server, ep, ep.method === 'DELETE' ? null : { text: 'test' }, authHeaders);
      assert(`Prohibited ${ep.method} ${ep.path} returns 404 Not Found`, res.status === 404);
    }

  } catch (err) {
    console.error('Phase 10 suite execution error:', err);
    failed++;
  } finally {
    try {
      if (existingSalespersons?.rows?.length > 0) {
        for (const sp of existingSalespersons.rows) {
          await db.query(
            'INSERT INTO salespersons (id, name, phone_number, email, is_active, connection_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING;',
            [sp.id, sp.name, sp.phone_number, sp.email, sp.is_active, sp.connection_status, sp.created_at, sp.updated_at]
          );
        }
      }
    } catch (restoreErr) {
      console.warn('Failed restoring salespersons:', restoreErr.message);
    }
    server.close();
  }

  console.log('\n======================================================================');
  console.log(`  Phase 10 Audit Results: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runCleanDataAuditSuite();

