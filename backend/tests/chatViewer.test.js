/**
 * Automated Verification Test Suite for WhatsApp Monitor (Phase 6: Admin WhatsApp Chat Viewer)
 *
 * Verifies all Phase 6 requirements:
 * 1. Selecting salesperson loads their customers (GET /api/salespersons/:id/customers)
 * 2. Switching salesperson clears previous customer and isolates data (multi-tenancy)
 * 3. Opening customer conversation (GET /api/conversations/:id/messages)
 * 4. Incoming message display & direction (incoming, customer sender)
 * 5. Outgoing message display & direction (outgoing, salesperson sender)
 * 6. Chronological sorting (ascending order)
 * 7. Loading older messages (pagination preserves chronological order without duplicate keys)
 * 8. Media authorization and private streaming (MIME type, Range requests, token in header and query)
 * 9. Cross-salesperson access prevention (403 CROSS_SALESPERSON_FORBIDDEN on parameter tampering)
 * 10. Invalid customer or conversation UUIDs return 400 Bad Request
 * 11. Non-existent customer or conversation UUIDs return 404 Not Found
 * 12. Empty conversation handling (returns empty list structure gracefully)
 * 13. Unsupported message types stored with descriptive placeholder
 * 14. Real-time updates via live-stream (SSE endpoint responds with 200 text/event-stream and sends events)
 * 15. Strict read-only guarantee: confirm no send, reply, forward, delete, or edit endpoints exist
 */

const http = require('http');
const app = require('../src/app');
const config = require('../src/config/env');
const db = require('../src/config/db');
const SalespersonModel = require('../src/models/salespersonModel');
const CustomerModel = require('../src/models/customerModel');
const ConversationModel = require('../src/models/conversationModel');
const MessageModel = require('../src/models/messageModel');
const MediaService = require('../src/services/media/mediaService');
const MessageHandler = require('../src/services/whatsapp/MessageHandler');

function makeRequest(server, options, postData) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const payload = postData !== undefined && postData !== null
      ? (typeof postData === 'string' ? postData : JSON.stringify(postData))
      : null;

    const headers = {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...(options.headers || {}),
    };

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method || 'GET',
        agent: false,
        headers,
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
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Helper to stream an SSE request until an event is received or timeout
 */
function listenToSSE(server, path, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const port = server.address().port;
    const events = [];
    let isDone = false;
    let savedStatus = 200;
    let savedHeaders = {};

    let timer = null;

    const cleanupAndResolve = () => {
      if (isDone) return;
      isDone = true;
      if (timer) clearTimeout(timer);
      try {
        req.destroy();
      } catch (_) {}
      resolve({ status: savedStatus, headers: savedHeaders, events });
    };

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        agent: false,
        headers: { Accept: 'text/event-stream' },
      },
      (res) => {
        savedStatus = res.statusCode;
        savedHeaders = res.headers;
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n\n');
          while (lines.length > 1) {
            const rawEvent = lines.shift();
            if (rawEvent.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(rawEvent.replace(/^data:\s*/, ''));
                events.push(parsed);
                if (parsed.type === 'new_message') {
                  setTimeout(cleanupAndResolve, 150);
                }
              } catch {
                events.push(rawEvent);
              }
            }
          }
          buffer = lines[0];
        });

        res.on('error', () => cleanupAndResolve());
        res.on('close', () => cleanupAndResolve());
      }
    );

    timer = setTimeout(cleanupAndResolve, timeoutMs);

    req.on('error', () => cleanupAndResolve());
    req.end();
  });
}

async function runPhase6Tests() {
  console.log('--- Starting Phase 6 Admin WhatsApp Chat Viewer Verification Suite ---');
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
    // ==========================================
    // 0. Setup: Authenticate Admin & Seed Test Data
    // ==========================================
    console.log('\n  [Setup] Authenticating & Seeding Multi-Salesperson Chat Test Data:');
    const loginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { username: config.adminSeed.username, password: config.adminSeed.password }
    );
    assert('Admin login successful', loginRes.status === 200 && loginRes.body.token);
    const token = loginRes.body.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // Create Rep A & Rep B
    const uniqueSuffix = Date.now().toString().slice(-6);
    const repA = await SalespersonModel.create({
      name: `Alice Sales_${uniqueSuffix}`,
      phone_number: `+1911${uniqueSuffix}`,
      email: `alice_${uniqueSuffix}@corp.test`,
      connection_status: 'Connected',
    });
    const repB = await SalespersonModel.create({
      name: `Bob Sales_${uniqueSuffix}`,
      phone_number: `+1922${uniqueSuffix}`,
      email: `bob_${uniqueSuffix}@corp.test`,
      connection_status: 'Connected',
    });
    assert('Created isolated Rep A and Rep B', repA?.id && repB?.id);

    // Create Customers for Rep A: CustA1 (active conversation), CustA2 (empty conversation)
    const custA1 = await CustomerModel.upsert({
      salespersonId: repA.id,
      whatsappId: `1800111${uniqueSuffix}@s.whatsapp.net`,
      phoneNumber: `+1800111${uniqueSuffix}`,
      displayName: 'Carol Customer A1',
    });

    const custA2 = await CustomerModel.upsert({
      salespersonId: repA.id,
      whatsappId: `1800222${uniqueSuffix}@s.whatsapp.net`,
      phoneNumber: `+1800222${uniqueSuffix}`,
      displayName: 'David Customer A2 (Empty)',
    });

    // Create Customer for Rep B: CustB1
    const custB1 = await CustomerModel.upsert({
      salespersonId: repB.id,
      whatsappId: `1800333${uniqueSuffix}@s.whatsapp.net`,
      phoneNumber: `+1800333${uniqueSuffix}`,
      displayName: 'Eve Customer B1',
    });
    assert('Created customer records for Rep A and Rep B', custA1?.id && custA2?.id && custB1?.id);

    // Create Conversations
    const convA1 = await ConversationModel.findOrCreate(repA.id, custA1.id);
    const convA2 = await ConversationModel.findOrCreate(repA.id, custA2.id); // Empty
    const convB1 = await ConversationModel.findOrCreate(repB.id, custB1.id);
    assert('Created conversations for test customers', convA1?.id && convA2?.id && convB1?.id);

    // Seed Messages for CustA1 in deliberate chronological sequence
    const t0 = new Date(Date.now() - 60000).toISOString();
    const t1 = new Date(Date.now() - 45000).toISOString();
    const t2 = new Date(Date.now() - 30000).toISOString();
    const t3 = new Date(Date.now() - 15000).toISOString();

    // 1. Incoming text message
    const msg1 = await MessageModel.create({
      conversationId: convA1.id,
      salespersonId: repA.id,
      customerId: custA1.id,
      whatsappMessageId: `WAM_IN_1_${uniqueSuffix}`,
      direction: 'incoming',
      messageType: 'text',
      messageText: 'Hello Alice, could you share the product pricing?',
      messageTimestamp: t0,
    });

    // 2. Outgoing text message
    const msg2 = await MessageModel.create({
      conversationId: convA1.id,
      salespersonId: repA.id,
      customerId: custA1.id,
      whatsappMessageId: `WAM_OUT_2_${uniqueSuffix}`,
      direction: 'outgoing',
      messageType: 'text',
      messageText: 'Hi Carol! Absolutely, here is the price sheet.',
      messageTimestamp: t1,
    });

    // 3. Outgoing media message (with private media attachment)
    const mediaBuffer = Buffer.from('FAKE_PDF_CONTRACT_CONTENT_FOR_TESTS');
    const mediaAttachment = await MediaService.savePrivateMedia(
      mediaBuffer,
      'pricing_sheet.pdf',
      'application/pdf'
    );
    const msg3 = await MessageModel.create({
      conversationId: convA1.id,
      salespersonId: repA.id,
      customerId: custA1.id,
      whatsappMessageId: `WAM_OUT_3_${uniqueSuffix}`,
      direction: 'outgoing',
      messageType: 'document',
      messageText: 'pricing_sheet.pdf',
      mediaId: mediaAttachment.id,
      messageTimestamp: t2,
    });

    // 4. Incoming unsupported message type (e.g. poll_creation)
    const msg4 = await MessageModel.create({
      conversationId: convA1.id,
      salespersonId: repA.id,
      customerId: custA1.id,
      whatsappMessageId: `WAM_IN_4_${uniqueSuffix}`,
      direction: 'incoming',
      messageType: 'poll_creation',
      messageText: '[Unsupported message: poll_creation]',
      messageTimestamp: t3,
    });

    // Update conversation metadata
    await ConversationModel.updateLastMessage(convA1.id, {
      lastMessageAt: t3,
      lastMessagePreview: msg4.message_text,
    });
    assert('Seeded chronological conversation messages (text, media, unsupported)', msg1?.id && msg2?.id && msg3?.id && msg4?.id);

    // ==========================================
    // Group 1: Salesperson Selection & Customer List
    // ==========================================
    console.log('\n  [Group 1] Point 1 & 2: Salesperson Selection & Customer Isolation:');
    const custResA = await makeRequest(
      server,
      { path: `/api/salespersons/${repA.id}/customers`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/salespersons/:id/customers returns 200', custResA.status === 200);
    assert('Returns correct customers array', Array.isArray(custResA.body.data));

    const repACustIds = custResA.body.data.map((c) => c.id);
    assert('Rep A list includes CustA1', repACustIds.includes(custA1.id));
    assert('Rep A list includes CustA2', repACustIds.includes(custA2.id));
    assert('Rep A list NEVER includes Rep B customer CustB1', !repACustIds.includes(custB1.id));

    // Check customer metadata fields
    const foundA1 = custResA.body.data.find((c) => c.id === custA1.id);
    assert('Customer item contains display_name', foundA1?.display_name === 'Carol Customer A1');
    assert('Customer item contains phone_number', !!foundA1?.phone_number);
    assert('Customer item contains last_message_preview', foundA1?.last_message_preview === '[Unsupported message: poll_creation]');
    assert('Customer item contains last_message_at timestamp', !!foundA1?.last_message_at);

    // Query Rep B customers to prove strict isolation on salesperson switch
    const custResB = await makeRequest(
      server,
      { path: `/api/salespersons/${repB.id}/customers`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/salespersons/:repB/customers returns 200', custResB.status === 200);
    const repBCustIds = custResB.body.data.map((c) => c.id);
    assert('Rep B list contains CustB1', repBCustIds.includes(custB1.id));
    assert('Rep B list NEVER contains CustA1 or CustA2', !repBCustIds.includes(custA1.id) && !repBCustIds.includes(custA2.id));

    // ==========================================
    // Group 2: Opening Customer Conversation
    // ==========================================
    console.log('\n  [Group 2] Point 3, 4, 5: Customer Conversation & Message Direction:');
    const convDetailsRes = await makeRequest(
      server,
      { path: `/api/salespersons/${repA.id}/customers/${custA1.id}/conversation`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/salespersons/:sId/customers/:cId/conversation returns 200', convDetailsRes.status === 200);
    assert('Returns conversation object with correct ID', convDetailsRes.body.data?.id === convA1.id);
    assert('Returns customer metadata', convDetailsRes.body.customer?.display_name === 'Carol Customer A1');
    assert('Returns salesperson metadata', convDetailsRes.body.salesperson?.name === repA.name);

    // Fetch conversation messages
    const msgsRes = await makeRequest(
      server,
      { path: `/api/conversations/${convA1.id}/messages`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/conversations/:id/messages returns 200', msgsRes.status === 200);
    assert('Returns all 4 messages', msgsRes.body.data?.length === 4);

    // Verify Incoming Message
    const incomingMsg = msgsRes.body.data.find((m) => m.id === msg1.id);
    assert('Incoming message has direction === "incoming"', incomingMsg?.direction === 'incoming');
    assert('Incoming message content preserved accurately', (incomingMsg?.message_text || incomingMsg?.content) === 'Hello Alice, could you share the product pricing?');

    // Verify Outgoing Message
    const outgoingMsg = msgsRes.body.data.find((m) => m.id === msg2.id);
    assert('Outgoing message has direction === "outgoing"', outgoingMsg?.direction === 'outgoing');
    assert('Outgoing message content preserved accurately', (outgoingMsg?.message_text || outgoingMsg?.content) === 'Hi Carol! Absolutely, here is the price sheet.');

    // ==========================================
    // Group 3: Chronological Sorting & Pagination
    // ==========================================
    console.log('\n  [Group 3] Point 6 & 7: Chronological Sorting & Pagination:');
    const messagesList = msgsRes.body.data;
    let isSorted = true;
    for (let i = 0; i < messagesList.length - 1; i++) {
      const currTime = new Date(messagesList[i].timestamp || messagesList[i].created_at).getTime();
      const nextTime = new Date(messagesList[i + 1].timestamp || messagesList[i + 1].created_at).getTime();
      if (currTime > nextTime) {
        isSorted = false;
        break;
      }
    }
    assert('Messages are returned in strict chronological ascending order (oldest first)', isSorted);

    // Pagination: page 1 with limit 2
    const page1Res = await makeRequest(
      server,
      { path: `/api/conversations/${convA1.id}/messages?page=1&limit=2`, method: 'GET', headers: authHeaders }
    );
    assert('Pagination Page 1 returns 2 messages', page1Res.body.data?.length === 2);
    assert('Page 1 has total: 4, totalPages: 2', page1Res.body.pagination?.total === 4 && page1Res.body.pagination?.totalPages === 2);
    const p1Ids = page1Res.body.data.map((m) => m.id);

    // Pagination: page 2 with limit 2
    const page2Res = await makeRequest(
      server,
      { path: `/api/conversations/${convA1.id}/messages?page=2&limit=2`, method: 'GET', headers: authHeaders }
    );
    assert('Pagination Page 2 returns 2 messages', page2Res.body.data?.length === 2);
    const p2Ids = page2Res.body.data.map((m) => m.id);

    // Ensure no overlapping or duplicate keys across pages
    const hasOverlap = p1Ids.some((id) => p2Ids.includes(id));
    assert('Pagination preserves distinct chronological segments without duplicate keys', !hasOverlap);
    assert('Combined paginated IDs match total 4 messages', [...p1Ids, ...p2Ids].length === 4);

    // ==========================================
    // Group 4: Media Authorization & Private Streaming
    // ==========================================
    console.log('\n  [Group 4] Point 8: Media Authorization & Private Streaming:');
    // 1. Authenticated stream via Authorization header
    const mediaHeaderRes = await makeRequest(
      server,
      { path: `/api/media/${mediaAttachment.id}`, method: 'GET', headers: authHeaders }
    );
    assert('Authenticated GET /api/media/:mediaId via header returns 200', mediaHeaderRes.status === 200);
    assert('Sets correct Content-Type: application/pdf', mediaHeaderRes.headers['content-type'] === 'application/pdf');
    assert('Sets Content-Disposition with filename', mediaHeaderRes.headers['content-disposition'].includes('pricing_sheet.pdf'));
    assert('Sets Cache-Control: private', mediaHeaderRes.headers['cache-control'].includes('private'));
    assert('Sets Accept-Ranges: bytes', mediaHeaderRes.headers['accept-ranges'] === 'bytes');

    // 2. Authenticated stream via ?token= query parameter (for HTML5 img/video/audio src)
    const mediaQueryRes = await makeRequest(
      server,
      { path: `/api/media/${mediaAttachment.id}?token=${token}`, method: 'GET' }
    );
    assert('Authenticated GET /api/media/:mediaId?token=... returns 200', mediaQueryRes.status === 200);

    // 3. Range request streaming (HTTP 206 Partial Content)
    const rangeRes = await makeRequest(
      server,
      {
        path: `/api/media/${mediaAttachment.id}`,
        method: 'GET',
        headers: { ...authHeaders, Range: 'bytes=0-10' },
      }
    );
    assert('Range request returns 206 Partial Content', rangeRes.status === 206);
    assert('Range response includes Content-Range header', !!rangeRes.headers['content-range']);
    assert('Range response sets Content-Length to requested slice size (11)', rangeRes.headers['content-length'] === '11');

    // 4. Unauthenticated media request rejection
    const unauthMediaRes = await makeRequest(
      server,
      { path: `/api/media/${mediaAttachment.id}`, method: 'GET' }
    );
    assert('Unauthenticated request to /api/media/:mediaId is rejected with 401', unauthMediaRes.status === 401);

    // ==========================================
    // Group 5: Cross-Salesperson Access Prevention (Security)
    // ==========================================
    console.log('\n  [Group 5] Point 9: Cross-Salesperson Access Prevention:');
    // Salesperson A tries to access CustB1 (who belongs to Rep B)
    const crossRes1 = await makeRequest(
      server,
      { path: `/api/salespersons/${repA.id}/customers/${custB1.id}/conversation`, method: 'GET', headers: authHeaders }
    );
    assert('Accessing Rep B customer through Rep A URL returns 403 Forbidden', crossRes1.status === 403);
    assert('Returns CROSS_SALESPERSON_FORBIDDEN error code', crossRes1.body?.code === 'CROSS_SALESPERSON_FORBIDDEN');

    // Accessing conversation with mismatched salespersonId query parameter
    const crossRes2 = await makeRequest(
      server,
      { path: `/api/conversations/${convA1.id}/messages?salespersonId=${repB.id}`, method: 'GET', headers: authHeaders }
    );
    assert('Requesting Rep A conversation with Rep B salespersonId returns 403 Forbidden', crossRes2.status === 403);
    assert('Returns CROSS_SALESPERSON_FORBIDDEN error code on conversation tamper', crossRes2.body?.code === 'CROSS_SALESPERSON_FORBIDDEN');

    // ==========================================
    // Group 6: Parameter Validation & Error Handling
    // ==========================================
    console.log('\n  [Group 6] Point 10 & 11: Validation (400) & Non-Existent (404):');
    const invalidSalespersonRes = await makeRequest(
      server,
      { path: '/api/salespersons/not-a-valid-uuid/customers', method: 'GET', headers: authHeaders }
    );
    assert('Invalid salesperson UUID returns 400 Bad Request', invalidSalespersonRes.status === 400);

    const invalidConvRes = await makeRequest(
      server,
      { path: '/api/conversations/invalid-uuid-format/messages', method: 'GET', headers: authHeaders }
    );
    assert('Invalid conversation UUID returns 400 Bad Request', invalidConvRes.status === 400);

    const invalidCustRes = await makeRequest(
      server,
      { path: '/api/customers/not-a-uuid', method: 'GET', headers: authHeaders }
    );
    assert('Invalid customer UUID returns 400 Bad Request', invalidCustRes.status === 400);

    const invalidMediaRes = await makeRequest(
      server,
      { path: '/api/media/malformed-uuid', method: 'GET', headers: authHeaders }
    );
    assert('Invalid media UUID returns 400 Bad Request', invalidMediaRes.status === 400);

    // Non-existent valid UUIDs
    const randomUuid = '00000000-0000-0000-0000-000000000000';
    const notFoundSalespersonRes = await makeRequest(
      server,
      { path: `/api/salespersons/${randomUuid}/customers`, method: 'GET', headers: authHeaders }
    );
    assert('Non-existent salesperson returns 404 Not Found', notFoundSalespersonRes.status === 404);

    const notFoundConvRes = await makeRequest(
      server,
      { path: `/api/conversations/${randomUuid}/messages`, method: 'GET', headers: authHeaders }
    );
    assert('Non-existent conversation returns 404 Not Found', notFoundConvRes.status === 404);

    const notFoundCustRes = await makeRequest(
      server,
      { path: `/api/customers/${randomUuid}`, method: 'GET', headers: authHeaders }
    );
    assert('Non-existent customer returns 404 Not Found', notFoundCustRes.status === 404);

    const notFoundMediaRes = await makeRequest(
      server,
      { path: `/api/media/${randomUuid}`, method: 'GET', headers: authHeaders }
    );
    assert('Non-existent media returns 404 Not Found', notFoundMediaRes.status === 404);

    // ==========================================
    // Group 7: Empty Conversation Handling
    // ==========================================
    console.log('\n  [Group 7] Point 12: Empty Conversation Graceful Handling:');
    const emptyConvRes = await makeRequest(
      server,
      { path: `/api/conversations/${convA2.id}/messages`, method: 'GET', headers: authHeaders }
    );
    assert('Empty conversation returns 200 OK', emptyConvRes.status === 200);
    assert('Empty conversation returns empty data array', Array.isArray(emptyConvRes.body.data) && emptyConvRes.body.data.length === 0);
    assert('Pagination total is 0 for empty conversation', emptyConvRes.body.pagination?.total === 0);

    // ==========================================
    // Group 8: Unsupported Message Types
    // ==========================================
    console.log('\n  [Group 8] Point 13: Unsupported Message Types Handled Cleanly:');
    const unsupportedMsg = msgsRes.body.data.find((m) => m.id === msg4.id);
    assert('Unsupported message stored with raw type intact', unsupportedMsg?.message_type === 'poll_creation');
    assert('Unsupported message content contains readable placeholder', (unsupportedMsg?.message_text || unsupportedMsg?.content) === '[Unsupported message: poll_creation]');

    // ==========================================
    // Group 9: Real-time Live-Stream (SSE)
    // ==========================================
    console.log('\n  [Group 9] Point 14: Real-time Live-Stream (Server-Sent Events):');
    const unauthSseRes = await makeRequest(
      server,
      { path: '/api/whatsapp/live-stream', method: 'GET' }
    );
    assert('Unauthenticated SSE connection is rejected with 401', unauthSseRes.status === 401);

    // Test live SSE stream with query token
    const ssePromise = listenToSSE(server, `/api/whatsapp/live-stream?token=${token}`, 2000);

    // Wait 200ms to allow connection handshake, then emit a real event via event bus
    setTimeout(() => {
      MessageHandler.getEventBus().emit('message:persisted', {
        message: {
          id: `live-msg-${uniqueSuffix}`,
          conversation_id: convA1.id,
          direction: 'incoming',
          content: 'Real-time test message via SSE',
        },
        conversation: { id: convA1.id },
      });
    }, 300);

    const sseResult = await ssePromise;
    assert('SSE endpoint returns 200 OK', sseResult.status === 200);
    assert('SSE Content-Type is text/event-stream', sseResult.headers['content-type'].includes('text/event-stream'));
    assert('SSE Cache-Control is no-cache', sseResult.headers['cache-control'].includes('no-cache'));

    const connectedEvent = sseResult.events.find((e) => e && e.type === 'connected');
    assert('SSE stream sends initial "connected" handshake event', !!connectedEvent);

    const newMsgEvent = sseResult.events.find((e) => e && e.type === 'new_message');
    assert('SSE stream receives "new_message" broadcast event', !!newMsgEvent && newMsgEvent.payload?.message?.id === `live-msg-${uniqueSuffix}`);

    // ==========================================
    // Group 10: Strict Read-Only Policy Guarantees
    // ==========================================
    console.log('\n  [Group 10] Point 15: Strict Read-Only Policy Enforced (No Send/Reply/Edit/Delete):');
    const prohibitedEndpoints = [
      { path: '/api/messages/send', method: 'POST' },
      { path: '/api/messages/reply', method: 'POST' },
      { path: `/api/messages/${msg1.id}/edit`, method: 'PATCH' },
      { path: `/api/messages/${msg1.id}/delete`, method: 'DELETE' },
      { path: `/api/conversations/${convA1.id}/reply`, method: 'POST' },
      { path: `/api/conversations/${convA1.id}/send`, method: 'POST' },
      { path: `/api/conversations/${convA1.id}/delete`, method: 'DELETE' },
      { path: '/api/whatsapp/send', method: 'POST' },
      { path: '/api/whatsapp/forward', method: 'POST' },
    ];

    for (const endpoint of prohibitedEndpoints) {
      const res = await makeRequest(
        server,
        { ...endpoint, headers: authHeaders },
        { text: 'Prohibited write attempt' }
      );
      assert(`Prohibited ${endpoint.method} ${endpoint.path} returns 404 Not Found`, res.status === 404);
    }
  } catch (err) {
    console.error('Phase 6 Test execution error:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log(`\n--- Phase 6 Test Results: ${passed} Passed, ${failed} Failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runPhase6Tests();
}

module.exports = runPhase6Tests;
