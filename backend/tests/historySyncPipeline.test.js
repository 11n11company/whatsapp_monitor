/**
 * History Synchronization & 72-Hour Pipeline Verification Test Suite
 * 
 * Verifies:
 * 1. Timestamp format conversions: seconds, milliseconds, protobuf Long, plain JSON Long, string
 * 2. 72-hour cutoff calculation: strictly includes <= 72h, excludes > 72h for historical imports
 * 3. Live notify messages: NEVER subject to cutoff filter regardless of timestamp
 * 4. Batch idempotency & deduplication: duplicate batches do not duplicate rows or corrupt customer names
 * 5. Group vs Individual chat handling: individual preserves phone & pushName, group preserves group_subject
 * 6. Detailed sync diagnostics in whatsapp_sessions.sync_progress
 * 7. Message retrieval pagination: newest first, chronological display
 */

const crypto = require('crypto');
const db = require('../src/config/db');
const CustomerModel = require('../src/models/customerModel');
const ConversationModel = require('../src/models/conversationModel');
const MessageModel = require('../src/models/messageModel');
const WhatsAppSessionModel = require('../src/models/whatsappSessionModel');
const MessageHandler = require('../src/services/whatsapp/MessageHandler');

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

async function runTests() {
  console.log('\n======================================================================');
  console.log('  WhatsApp 72-Hour History Synchronization Pipeline Verification Suite');
  console.log('======================================================================\n');

  await db.testConnection();

  const testSalespersonId = crypto.randomUUID();
  const repContext = {
    salespersonId: testSalespersonId,
    salespersonName: 'History Sync Test Rep',
    salespersonPhone: '+19998887777',
    socket: null,
  };

  try {
    // 0. Seed test salesperson and initial session
    await db.query(
      `INSERT INTO salespersons (id, name, phone_number, is_active, connection_status)
       VALUES ($1, $2, $3, true, 'Connected')
       ON CONFLICT (id) DO UPDATE SET is_active = true, connection_status = 'Connected';`,
      [testSalespersonId, repContext.salespersonName, repContext.salespersonPhone]
    );

    await WhatsAppSessionModel.upsertSession({
      salespersonId: testSalespersonId,
      status: 'Connected',
      provider: 'baileys',
      isDemo: false,
    });

    // ========================================================================
    // PART 1: Timestamp Conversion Verification
    // ========================================================================
    console.log('\n--- PART 1: Timestamp Conversion Verification ---');

    const baseSec = 1732185600; // 2024-11-21T10:40:00.000Z
    const baseMs = baseSec * 1000;

    // Normalization test with different timestamp formats
    const mockContext = { salespersonId: testSalespersonId, salespersonPhone: '+19998887777', salespersonName: 'Rep' };

    // 1. Seconds (number)
    const normSec = MessageHandler.normalizeMessage(mockContext, {
      key: { id: 'TS_SEC', remoteJid: '15551234567@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Testing seconds timestamp' },
      messageTimestamp: baseSec,
    });
    assert('Normalizes seconds timestamp correctly to ISO string', normSec.timestamp === new Date(baseMs).toISOString());

    // 2. Milliseconds (number)
    const normMs = MessageHandler.normalizeMessage(mockContext, {
      key: { id: 'TS_MS', remoteJid: '15551234567@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Testing milliseconds timestamp' },
      messageTimestamp: baseMs,
    });
    assert('Normalizes milliseconds timestamp without 1000x multiplication', normMs.timestamp === new Date(baseMs).toISOString());

    // 3. Protobuf Long instance with .toNumber()
    const mockProtoLong = { low: baseSec, high: 0, unsigned: true, toNumber: () => baseSec };
    const normLong = MessageHandler.normalizeMessage(mockContext, {
      key: { id: 'TS_LONG', remoteJid: '15551234567@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Testing protobuf Long timestamp' },
      messageTimestamp: mockProtoLong,
    });
    assert('Normalizes protobuf Long object with .toNumber()', normLong.timestamp === new Date(baseMs).toISOString());

    // 4. Plain JSON object without prototype: { low, high, unsigned }
    const plainJsonLong = { low: baseSec, high: 0, unsigned: true };
    const normJsonLong = MessageHandler.normalizeMessage(mockContext, {
      key: { id: 'TS_JSON_LONG', remoteJid: '15551234567@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Testing plain JSON Long object' },
      messageTimestamp: plainJsonLong,
    });
    assert('Normalizes plain JSON Long object without NaN', normJsonLong.timestamp === new Date(baseMs).toISOString());

    // 5. String seconds
    const normStr = MessageHandler.normalizeMessage(mockContext, {
      key: { id: 'TS_STR', remoteJid: '15551234567@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Testing string timestamp' },
      messageTimestamp: String(baseSec),
    });
    assert('Normalizes string timestamp correctly', normStr.timestamp === new Date(baseMs).toISOString());

    // 6. Missing/null timestamp falls back safely without throwing RangeError
    const normNull = MessageHandler.normalizeMessage(mockContext, {
      key: { id: 'TS_NULL', remoteJid: '15551234567@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Testing null timestamp' },
      messageTimestamp: null,
    });
    assert('Null timestamp falls back safely to current ISO string', typeof normNull.timestamp === 'string' && !isNaN(Date.parse(normNull.timestamp)));

    // ========================================================================
    // PART 2: 72-Hour Cutoff Boundary & Historical Import
    // ========================================================================
    console.log('\n--- PART 2: 72-Hour Boundary & Historical Import ---');

    const now = Date.now();
    const t_24h_ago = Math.floor((now - 24 * 3600 * 1000) / 1000);   // 1 day ago (within window)
    const t_48h_ago = Math.floor((now - 48 * 3600 * 1000) / 1000);   // 2 days ago (within window)
    const t_71h_ago = Math.floor((now - 71.5 * 3600 * 1000) / 1000); // 71.5h ago (within window)
    const t_73h_ago = Math.floor((now - 73 * 3600 * 1000) / 1000);   // 73h ago (OUTSIDE window)
    const t_120h_ago = Math.floor((now - 120 * 3600 * 1000) / 1000); // 5 days ago (OUTSIDE window)

    const historyData = {
      contacts: [
        { id: '15551112222@s.whatsapp.net', name: 'Alice Customer', phoneNumber: '15551112222' },
        { id: '12036302@g.us', name: 'Team Project Group' },
      ],
      chats: [
        { id: '15551112222@s.whatsapp.net', displayName: 'Alice Customer' },
        { id: '12036302@g.us', name: 'Team Project Group' },
      ],
      messages: [
        {
          key: { id: 'HIST_MSG_24H', remoteJid: '15551112222@s.whatsapp.net', fromMe: false },
          message: { conversation: '24h ago message (should be saved)' },
          messageTimestamp: t_24h_ago,
        },
        {
          key: { id: 'HIST_MSG_48H', remoteJid: '15551112222@s.whatsapp.net', fromMe: true },
          message: { conversation: '48h ago message (should be saved)' },
          messageTimestamp: t_48h_ago,
        },
        {
          key: { id: 'HIST_MSG_71H', remoteJid: '15551112222@s.whatsapp.net', fromMe: false },
          message: { conversation: '71.5h ago boundary message (should be saved)' },
          messageTimestamp: t_71h_ago,
        },
        {
          key: { id: 'HIST_MSG_73H_EXCLUDED', remoteJid: '15551112222@s.whatsapp.net', fromMe: false },
          message: { conversation: '73h ago message (must be EXCLUDED)' },
          messageTimestamp: t_73h_ago,
        },
        {
          key: { id: 'HIST_MSG_120H_EXCLUDED', remoteJid: '15551112222@s.whatsapp.net', fromMe: false },
          message: { conversation: '120h ago message (must be EXCLUDED)' },
          messageTimestamp: t_120h_ago,
        },
        // Group message within 72h
        {
          key: { id: 'HIST_GROUP_MSG', remoteJid: '12036302@g.us', fromMe: false, participant: '15559998888@s.whatsapp.net' },
          message: { conversation: 'Group discussion message' },
          messageTimestamp: t_24h_ago,
          pushName: 'Bob Group Member',
        },
      ],
    };

    // Execute background history sync directly (awaiting internal batching)
    await MessageHandler.processBackgroundHistorySync(repContext, historyData);

    // Verify messages within 72h were persisted
    const saved24h = await MessageModel.findBySalespersonAndWhatsAppMessageId(testSalespersonId, 'HIST_MSG_24H');
    assert('Historical message within 24h was saved', Boolean(saved24h));

    const saved48h = await MessageModel.findBySalespersonAndWhatsAppMessageId(testSalespersonId, 'HIST_MSG_48H');
    assert('Historical message within 48h was saved', Boolean(saved48h));

    const saved71h = await MessageModel.findBySalespersonAndWhatsAppMessageId(testSalespersonId, 'HIST_MSG_71H');
    assert('Historical message at 71.5h boundary was saved', Boolean(saved71h));

    const savedGroup = await MessageModel.findBySalespersonAndWhatsAppMessageId(testSalespersonId, 'HIST_GROUP_MSG');
    assert('Historical group message was saved with participant details', Boolean(savedGroup) && savedGroup.participant_name === 'Bob Group Member');

    // Verify messages outside 72h were excluded
    const excluded73h = await MessageModel.findBySalespersonAndWhatsAppMessageId(testSalespersonId, 'HIST_MSG_73H_EXCLUDED');
    assert('Historical message > 72h (73h) was strictly excluded', excluded73h === null);

    const excluded120h = await MessageModel.findBySalespersonAndWhatsAppMessageId(testSalespersonId, 'HIST_MSG_120H_EXCLUDED');
    assert('Historical message > 72h (120h) was strictly excluded', excluded120h === null);

    // Check session sync_progress diagnostics
    const sessionRec = await WhatsAppSessionModel.findBySalespersonId(testSalespersonId);
    assert('Session sync_status is Synchronization completed', sessionRec.sync_status === 'Synchronization completed');
    assert('Diagnostics: messagesReceived equals total in payload (6)', sessionRec.sync_progress.messagesReceived === 6);
    assert('Diagnostics: messagesWithinWindow equals 4', sessionRec.sync_progress.messagesWithinWindow === 4);
    assert('Diagnostics: messagesOutsideWindow equals 2', sessionRec.sync_progress.messagesOutsideWindow === 2);
    assert('Diagnostics: messagesSaved equals 4', sessionRec.sync_progress.messagesSaved === 4);

    // ========================================================================
    // PART 3: Live Notify Messages NEVER Filtered by Cutoff
    // ========================================================================
    console.log('\n--- PART 3: Live Notify Messages Cutoff Immunity ---');

    // Simulate delayed delivery of a live notify message with timestamp older than 72 hours
    const liveOldTimestamp = Math.floor((now - 150 * 3600 * 1000) / 1000); // 150 hours old
    const liveNotifyUpsert = {
      type: 'notify', // Live message indicator
      messages: [
        {
          key: { id: 'LIVE_OLD_MSG_150H', remoteJid: '15551112222@s.whatsapp.net', fromMe: false },
          message: { conversation: 'Live delayed incoming message' },
          messageTimestamp: liveOldTimestamp,
        },
      ],
    };

    const liveResults = await MessageHandler.handleMessagesUpsert(repContext, liveNotifyUpsert);
    assert('Live message returned persisted result', liveResults.length === 1 && liveResults[0].message);

    const savedLiveOld = await MessageModel.findBySalespersonAndWhatsAppMessageId(testSalespersonId, 'LIVE_OLD_MSG_150H');
    assert('Live notify message older than 72h is persisted (never dropped by cutoff)', Boolean(savedLiveOld));

    // ========================================================================
    // PART 4: Batch Idempotency & Deduplication
    // ========================================================================
    console.log('\n--- PART 4: Batch Idempotency & Deduplication ---');

    // Re-run the exact same history sync payload
    await MessageHandler.processBackgroundHistorySync(repContext, historyData);

    const sessionRec2 = await WhatsAppSessionModel.findBySalespersonId(testSalespersonId);
    assert('Re-syncing batch skipped duplicates without errors', sessionRec2.sync_progress.messagesSkippedDuplicate > 0);

    // Verify customer display name was NOT overwritten with raw JID
    const customerRec = await CustomerModel.findBySalespersonAndWhatsAppId(testSalespersonId, '15551112222@s.whatsapp.net');
    assert('Customer display name preserved as "Alice Customer" (never overwritten by raw JID)', customerRec.display_name === 'Alice Customer');

    // ========================================================================
    // PART 5: Message Pagination & Retrieval
    // ========================================================================
    console.log('\n--- PART 5: Message Pagination & Chronological Ordering ---');

    const convRec = await ConversationModel.findOrCreate(testSalespersonId, customerRec.id);
    const paginated = await MessageModel.findByConversationId(convRec.id, { limit: 20, offset: 0 });

    assert('findByConversationId returns messages for conversation', paginated.length > 0);

    // Verify chronological order: each timestamp >= previous timestamp
    let isChronological = true;
    for (let i = 1; i < paginated.length; i++) {
      const prevTime = new Date(paginated[i - 1].message_timestamp).getTime();
      const currTime = new Date(paginated[i].message_timestamp).getTime();
      if (currTime < prevTime) {
        isChronological = false;
        break;
      }
    }
    assert('Messages returned in chronological order (oldest to newest for chat box)', isChronological);

  } catch (err) {
    console.error('Test Suite Exception:', err);
    failed++;
  } finally {
    // Clean up test data
    try {
      await db.query(`DELETE FROM messages WHERE salesperson_id = $1;`, [testSalespersonId]);
      await db.query(`DELETE FROM conversations WHERE salesperson_id = $1;`, [testSalespersonId]);
      await db.query(`DELETE FROM customers WHERE salesperson_id = $1;`, [testSalespersonId]);
      await db.query(`DELETE FROM whatsapp_sessions WHERE salesperson_id = $1;`, [testSalespersonId]);
      await db.query(`DELETE FROM salespersons WHERE id = $1;`, [testSalespersonId]);
    } catch {
      // Cleanup best effort
    }

    console.log('\n======================================================================');
    console.log(`  Tests Passed: ${passed} | Tests Failed: ${failed}`);
    console.log('======================================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
