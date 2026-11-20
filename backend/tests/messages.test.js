/**
 * Automated Verification Test Suite for WhatsApp Monitor (Phase 5: Customer Management & Message Storage)
 */
const http = require('http');
const app = require('../src/app');
const config = require('../src/config/env');
const db = require('../src/config/db');
const MessageHandler = require('../src/services/whatsapp/MessageHandler');
const CustomerModel = require('../src/models/customerModel');
const ConversationModel = require('../src/models/conversationModel');
const MessageModel = require('../src/models/messageModel');
const MediaService = require('../src/services/media/mediaService');

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

async function runPhase5Tests() {
  console.log('--- Starting Phase 5 Customer Management & Message Storage Verification Suite ---');
  await db.testConnection();

  const server = app.listen(0);
  let failed = 0;
  let passed = 0;

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
    // 1. Authenticate as Admin
    const loginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { username: config.adminSeed.username, password: config.adminSeed.password }
    );
    assert('Admin login succeeds', loginRes.status === 200);
    const token = loginRes.body?.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Create two distinct test salespersons (Rep A and Rep B)
    const repARes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST', headers: authHeaders },
      { name: 'Rep Alpha', phone_number: `+1555${Math.floor(1000000 + Math.random() * 9000000)}` }
    );
    const repA = repARes.body?.data;
    assert('Created Rep Alpha', repARes.status === 201 && repA?.id);

    const repBRes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST', headers: authHeaders },
      { name: 'Rep Beta', phone_number: `+1555${Math.floor(1000000 + Math.random() * 9000000)}` }
    );
    const repB = repBRes.body?.data;
    assert('Created Rep Beta', repBRes.status === 201 && repB?.id);

    // ==========================================
    // Group 1: Incoming Message Storage & Customer Creation
    // ==========================================
    console.log('\n  [Group 1] Incoming Message Processing & Customer Discovery:');
    const customerPhone = '15557778899';
    const customerWaId = `${customerPhone}@s.whatsapp.net`;
    const msg1Id = `MSG_IN_${Date.now()}_1`;
    const msg1Text = 'Hello, can you send the price list for commercial supplies?';

    const upsert1 = {
      messages: [
        {
          key: { id: msg1Id, remoteJid: customerWaId, fromMe: false },
          pushName: 'Alice Henderson',
          message: { conversation: msg1Text },
          messageTimestamp: Math.floor(Date.now() / 1000) - 60,
        },
      ],
    };

    const results1 = await MessageHandler.handleMessagesUpsert(
      { salespersonId: repA.id, salespersonPhone: repA.phone_number, salespersonName: repA.name },
      upsert1
    );

    assert('MessageHandler processed incoming message', results1.length === 1);
    const cust1 = results1[0]?.customer;
    const conv1 = results1[0]?.conversation;
    const message1 = results1[0]?.message;

    assert('Created new customer record', cust1 !== null && typeof cust1?.id === 'string');
    assert('Customer display name matches pushName', cust1?.display_name === 'Alice Henderson');
    assert('Customer phone extracted accurately', cust1?.phone_number === `+${customerPhone}`);
    assert('Customer whatsapp_id recorded', cust1?.whatsapp_id === customerWaId);
    assert('Customer scoped to Rep Alpha', cust1?.salesperson_id === repA.id);

    assert('Created conversation thread', conv1 !== null && typeof conv1?.id === 'string');
    assert('Conversation linked to Rep Alpha and Customer', conv1?.salesperson_id === repA.id && conv1?.customer_id === cust1?.id);

    assert('Stored incoming message record', message1 !== null && typeof message1?.id === 'string');
    assert('Message direction is incoming', message1?.direction === 'incoming');
    assert('Message text stored correctly', message1?.message_text === msg1Text);
    assert('Message type is text', message1?.message_type === 'text');

    // ==========================================
    // Group 2: Existing Customer Identification
    // ==========================================
    console.log('\n  [Group 2] Existing Customer Identification & Thread Continuity:');
    const msg2Id = `MSG_IN_${Date.now()}_2`;
    const msg2Text = 'Also, do you offer net-30 payment terms?';

    const upsert2 = {
      messages: [
        {
          key: { id: msg2Id, remoteJid: customerWaId, fromMe: false },
          pushName: 'Alice Henderson',
          message: { conversation: msg2Text },
          messageTimestamp: Math.floor(Date.now() / 1000) - 30,
        },
      ],
    };

    const results2 = await MessageHandler.handleMessagesUpsert(
      { salespersonId: repA.id, salespersonPhone: repA.phone_number, salespersonName: repA.name },
      upsert2
    );

    assert('Re-identified existing customer (no duplicate customer created)', results2[0]?.customer?.id === cust1.id);
    assert('Re-used existing conversation thread', results2[0]?.conversation?.id === conv1.id);
    assert('Stored second incoming message in same conversation', results2[0]?.message?.id !== message1.id);

    // ==========================================
    // Group 3: Outgoing Message Storage (Rep -> Customer)
    // ==========================================
    console.log('\n  [Group 3] Outgoing Message Storage:');
    const msg3Id = `MSG_OUT_${Date.now()}_3`;
    const msg3Text = 'Hi Alice! Yes, we offer net-30 terms. I am sending our brochure now.';

    const upsert3 = {
      messages: [
        {
          key: { id: msg3Id, remoteJid: customerWaId, fromMe: true },
          pushName: 'Rep Alpha', // Rep's pushName must NOT overwrite customer's name!
          message: { extendedTextMessage: { text: msg3Text } },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const results3 = await MessageHandler.handleMessagesUpsert(
      { salespersonId: repA.id, salespersonPhone: repA.phone_number, salespersonName: repA.name },
      upsert3
    );

    const message3 = results3[0]?.message;
    assert('Stored outgoing message record', message3 !== null);
    assert('Message direction is outgoing', message3?.direction === 'outgoing');
    assert('Outgoing text preserved', message3?.message_text === msg3Text);

    // Verify customer display name was NOT overwritten by rep's pushName
    const checkCust = await CustomerModel.findById(cust1.id);
    assert('Customer display name preserved (not overwritten by rep name)', checkCust?.display_name === 'Alice Henderson');

    // ==========================================
    // Group 4: Duplicate Message Prevention (Idempotency)
    // ==========================================
    console.log('\n  [Group 4] Duplicate Message Prevention (Idempotency):');
    const duplicateResults = await MessageHandler.handleMessagesUpsert(
      { salespersonId: repA.id, salespersonPhone: repA.phone_number, salespersonName: repA.name },
      upsert3 // Send exact same message again
    );

    assert(
      'Duplicate message was NOT re-inserted (in-memory skip or ON CONFLICT)',
      duplicateResults.length === 0 || duplicateResults[0]?.message === null
    );

    // Check message count in conversation remains 3
    const convMsgCount = await MessageModel.countByConversationId(conv1.id);
    assert('Total messages in conversation remains exactly 3', convMsgCount === 3);

    // ==========================================
    // Group 5: Multiple Salesperson Isolation
    // ==========================================
    console.log('\n  [Group 5] Multi-Salesperson Customer Isolation:');
    // The same WhatsApp customer phone now contacts Rep B
    const msgRepBId = `MSG_REPB_${Date.now()}`;
    const upsertRepB = {
      messages: [
        {
          key: { id: msgRepBId, remoteJid: customerWaId, fromMe: false },
          pushName: 'Alice Henderson',
          message: { conversation: 'Hello Rep Beta, checking on your regional catalog.' },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const resultsRepB = await MessageHandler.handleMessagesUpsert(
      { salespersonId: repB.id, salespersonPhone: repB.phone_number, salespersonName: repB.name },
      upsertRepB
    );

    const custRepB = resultsRepB[0]?.customer;
    assert('Created separate customer record scoped to Rep B', custRepB?.id !== cust1.id);
    assert('Customer for Rep B has same whatsapp_id', custRepB?.whatsapp_id === customerWaId);
    assert('Customer for Rep B is scoped to Rep B', custRepB?.salesperson_id === repB.id);

    // ==========================================
    // Group 6: Customer REST APIs
    // ==========================================
    console.log('\n  [Group 6] Customer REST APIs:');

    // Unauthorized check
    const unauthCustRes = await makeRequest(
      server,
      { path: `/api/salespersons/${repA.id}/customers`, method: 'GET' }
    );
    assert('GET /api/salespersons/:id/customers without token returns 401', unauthCustRes.status === 401);

    // Invalid UUID check
    const invalidIdRes = await makeRequest(
      server,
      { path: '/api/salespersons/not-a-valid-uuid/customers', method: 'GET', headers: authHeaders }
    );
    assert('GET /api/salespersons/invalid-uuid/customers returns 400', invalidIdRes.status === 400);

    // Non-existent salesperson UUID
    const nonExistentSpRes = await makeRequest(
      server,
      { path: '/api/salespersons/11111111-2222-3333-4444-555555555555/customers', method: 'GET', headers: authHeaders }
    );
    assert('GET /api/salespersons/non-existent/customers returns 404', nonExistentSpRes.status === 404);

    // List customers for Rep A
    const listCustRes = await makeRequest(
      server,
      { path: `/api/salespersons/${repA.id}/customers`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/salespersons/:id/customers returns 200', listCustRes.status === 200);
    assert('Rep A has exactly 1 customer', listCustRes.body?.data?.length === 1);
    assert('Customer has latest conversation preview', listCustRes.body?.data[0]?.last_message_preview !== null);
    assert('Pagination metadata returned', listCustRes.body?.pagination?.total === 1);

    // Search customers
    const searchRes = await makeRequest(
      server,
      { path: `/api/salespersons/${repA.id}/customers?search=Alice`, method: 'GET', headers: authHeaders }
    );
    assert('Search by name finds customer', searchRes.body?.data?.length === 1);

    const searchMissRes = await makeRequest(
      server,
      { path: `/api/salespersons/${repA.id}/customers?search=NonExistentName`, method: 'GET', headers: authHeaders }
    );
    assert('Search for non-existent name returns empty array', searchMissRes.body?.data?.length === 0);

    // Get customer by ID
    const getCustRes = await makeRequest(
      server,
      { path: `/api/customers/${cust1.id}`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/customers/:id returns 200', getCustRes.status === 200);
    assert('Customer details match', getCustRes.body?.data?.display_name === 'Alice Henderson');

    // Get customer conversations
    const getCustConvsRes = await makeRequest(
      server,
      { path: `/api/customers/${cust1.id}/conversations`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/customers/:id/conversations returns 200', getCustConvsRes.status === 200);
    assert('Customer has 1 conversation', getCustConvsRes.body?.data?.length === 1);

    // ==========================================
    // Group 7: Conversation REST APIs & Ordering
    // ==========================================
    console.log('\n  [Group 7] Conversation Messages REST APIs:');

    // Unauthorized check
    const unauthConvRes = await makeRequest(
      server,
      { path: `/api/conversations/${conv1.id}/messages`, method: 'GET' }
    );
    assert('GET /api/conversations/:id/messages without token returns 401', unauthConvRes.status === 401);

    // Invalid UUID check
    const badConvIdRes = await makeRequest(
      server,
      { path: '/api/conversations/not-a-valid-uuid/messages', method: 'GET', headers: authHeaders }
    );
    assert('GET /api/conversations/bad-id/messages returns 400', badConvIdRes.status === 400);

    // List messages chronologically
    const msgsRes = await makeRequest(
      server,
      { path: `/api/conversations/${conv1.id}/messages`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/conversations/:id/messages returns 200', msgsRes.status === 200);
    const msgs = msgsRes.body?.data;
    assert('Returns 3 messages in conversation', msgs?.length === 3);
    assert('First message is earliest incoming', msgs[0]?.whatsapp_message_id === msg1Id);
    assert('Third message is latest outgoing', msgs[2]?.whatsapp_message_id === msg3Id);
    assert('Messages include direction (incoming/outgoing)', msgs[0]?.direction === 'incoming' && msgs[2]?.direction === 'outgoing');

    // Pagination test on messages
    const paginatedMsgsRes = await makeRequest(
      server,
      { path: `/api/conversations/${conv1.id}/messages?page=1&limit=2`, method: 'GET', headers: authHeaders }
    );
    assert('Pagination limit=2 returns 2 messages', paginatedMsgsRes.body?.data?.length === 2);
    assert('Pagination reports total = 3', paginatedMsgsRes.body?.pagination?.total === 3);

    // ==========================================
    // Group 8: Private Media Storage & Preparation
    // ==========================================
    console.log('\n  [Group 8] Private Media Preparation & Controls:');
    const dummyBuffer = Buffer.from('FAKE_IMAGE_DATA_FOR_AUDIT_LOGS_ONLY');
    const savedMedia = await MediaService.savePrivateMedia(dummyBuffer, 'quote_estimate.pdf', 'application/pdf');
    assert('Saved private media attachment with random filename', savedMedia?.id && savedMedia?.file_path !== 'quote_estimate.pdf');

    const mediaRes = await makeRequest(
      server,
      { path: `/api/media/${savedMedia.id}`, method: 'GET', headers: authHeaders }
    );
    assert('Authenticated GET /api/media/:mediaId returns 200', mediaRes.status === 200);
    assert('Media response sets correct MIME header', mediaRes.headers['content-type'] === 'application/pdf');

    const unauthMediaRes = await makeRequest(
      server,
      { path: `/api/media/${savedMedia.id}`, method: 'GET' }
    );
    assert('Unauthenticated media request returns 401', unauthMediaRes.status === 401);

    // ==========================================
    // Group 9: Strict Read-Only Restrictions
    // ==========================================
    console.log('\n  [Group 9] Strict Read-Only Policy Guarantees:');
    const sendAttempts = [
      { path: '/api/messages/send', method: 'POST' },
      { path: '/api/conversations/send', method: 'POST' },
      { path: `/api/conversations/${conv1.id}/reply`, method: 'POST' },
      { path: `/api/conversations/${conv1.id}/delete`, method: 'POST' },
      { path: `/api/messages/${message1.id}/delete`, method: 'DELETE' },
    ];

    for (const attempt of sendAttempts) {
      const res = await makeRequest(
        server,
        { ...attempt, headers: authHeaders },
        attempt.method === 'DELETE' ? null : { text: 'Test send' }
      );
      assert(`${attempt.method} ${attempt.path} returns 404 (No message mutation)`, res.status === 404);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log(`\n--- Phase 5 Test Results: ${passed} Passed, ${failed} Failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runPhase5Tests();
}

module.exports = runPhase5Tests;
