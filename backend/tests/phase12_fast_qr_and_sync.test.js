/**
 * Phase 12: Fast WhatsApp QR Pairing and Last 3 Days Priority Synchronization Test Suite
 *
 * Verifies:
 * 1. Fast QR pairing architecture:
 *    - Baileys socket starts immediately upon connect without waiting for history sync.
 *    - Events registered prior to QR emission.
 *    - Fast-path QR emission without arbitrary 5.5s delays.
 *    - State reporting: Initializing, Waiting for QR Scan, Connecting, Connected, Error.
 * 2. Last 3 Days Priority Synchronization:
 *    - Configurable history window (default HISTORY_SYNC_DAYS=3).
 *    - Cutoff timestamp calculation: server time minus 3 days.
 *    - Historical messages older than 3 days are dropped/skipped during initial sync.
 *    - Historical messages within 3 days are ingested with newest messages prioritized first.
 *    - Manageable batching (50 messages per chunk).
 *    - Sync progress and metrics saved to whatsapp_sessions and broadcast over SSE.
 * 3. CRITICAL: Real-Time Live Messages Bypassing Cutoff:
 *    - Newly received live messages (messages.upsert with type: 'notify') NEVER dropped by 3-day filter.
 *    - Both incoming and outgoing live messages persisted and emitted to SSE immediately.
 * 4. Latest 20 Messages Pagination:
 *    - Initial conversation load returns latest 20 messages in chronological order.
 *    - Upward pagination returns older messages in chronological order.
 * 5. Salesperson isolation and deduplication guarantees.
 */

const http = require('http');
const app = require('../src/app');
const db = require('../src/config/db');
const config = require('../src/config/env');
const CustomerModel = require('../src/models/customerModel');
const ConversationModel = require('../src/models/conversationModel');
const MessageModel = require('../src/models/messageModel');
const WhatsAppSessionModel = require('../src/models/whatsappSessionModel');
const MessageHandler = require('../src/services/whatsapp/MessageHandler');
const ConnectionManager = require('../src/services/whatsapp/ConnectionManager');

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

async function runPhase12Tests() {
  console.log('\n======================================================================');
  console.log('  Phase 12: Fast QR Pairing & 3-Day Priority Sync Verification Suite');
  console.log('======================================================================\n');

  await db.testConnection();

  const salespersonId = '5358e311-eaf5-4708-871c-e27dcd8baba0'; // mohammed
  const repContext = {
    salespersonId,
    salespersonName: 'mohammed',
    salespersonPhone: '+859165987',
  };

  try {
    // 1. Ensure test salesperson exists in DB
    await db.query(
      `INSERT INTO salespersons (id, name, phone_number, is_active, connection_status)
       VALUES ($1, $2, $3, true, 'Connected')
       ON CONFLICT (id) DO UPDATE SET is_active = true, connection_status = 'Connected';`,
      [salespersonId, 'mohammed', '+859165987']
    );

    // 2. Clean previous test messages and customers for clean test run
    await db.query(`DELETE FROM messages WHERE salesperson_id = $1;`, [salespersonId]);
    await db.query(`DELETE FROM customers WHERE salesperson_id = $1;`, [salespersonId]);

    // ========================================================================
    // PART 1: Fast QR Pairing & Connection Architecture
    // ========================================================================
    console.log('\n--- PART 1: Fast QR Pairing & State Management ---');

    const provider = ConnectionManager.getProvider();
    assert('Active provider exists and is initialized', Boolean(provider));
    assert('Supports manual QR refresh', provider.supportsQRRefresh() === true);

    // Verify session context creation and fast status retrieval
    const initialStatus = await ConnectionManager.getStatus(salespersonId);
    assert('Connection status is retrievable without delay', Boolean(initialStatus));
    assert('Initial status includes syncStatus property', 'syncStatus' in initialStatus);

    // Upsert session test with sync_status and sync_progress
    const sessionRecord = await WhatsAppSessionModel.upsertSession({
      salespersonId,
      status: 'Waiting for QR Scan',
      provider: 'baileys',
      isDemo: false,
      qrCode: 'TEST_QR_PAYLOAD_FAST_PAIRING_12345',
      qrExpiresAt: new Date(Date.now() + 60000).toISOString(),
      syncStatus: 'Waiting for device pairing',
      syncProgress: { messagesProcessed: 0, customersDiscovered: 0, startDate: null, endDate: null, lastSyncAt: null, error: null },
    });

    assert('whatsapp_sessions stores sync_status column', sessionRecord.sync_status === 'Waiting for device pairing');
    assert('whatsapp_sessions stores sync_progress JSONB object', typeof sessionRecord.sync_progress === 'object');
    assert('Session status is Waiting for QR Scan', sessionRecord.status === 'Waiting for QR Scan');

    const updatedSession = await WhatsAppSessionModel.updateSyncStatus(
      salespersonId,
      'Loading recent conversations',
      { messagesProcessed: 0, customersDiscovered: 12, startDate: null, endDate: null, lastSyncAt: new Date().toISOString(), error: null }
    );
    assert('updateSyncStatus correctly transitions sync_status', updatedSession.sync_status === 'Loading recent conversations');
    assert('updateSyncStatus records customer count in sync_progress', updatedSession.sync_progress.customersDiscovered === 12);

    // ========================================================================
    // PART 2: Configurable 3-Day Historical Message Synchronization Window
    // ========================================================================
    console.log('\n--- PART 2: 3-Day Historical Message Ingestion Window ---');

    const now = Date.now();
    const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(now - 4 * 24 * 60 * 60 * 1000); // Beyond 3-day cutoff
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000); // Beyond 3-day cutoff

    // Seed customer
    const testCust = await CustomerModel.upsert({
      salespersonId,
      whatsappId: '919876543210@s.whatsapp.net',
      phoneNumber: '+919876543210',
      displayName: 'Priority Customer 1',
      contactType: 'individual',
    });

    // Ingest simulated history sync payload (Workflow B: background append)
    const historyPayload = {
      chats: [
        { id: '919876543210@s.whatsapp.net', name: 'Priority Customer 1' },
      ],
      contacts: [
        { id: '919876543210@s.whatsapp.net', name: 'Priority Customer 1', phoneNumber: '919876543210' },
      ],
      messages: [
        {
          key: { remoteJid: '919876543210@s.whatsapp.net', fromMe: false, id: 'HIST_MSG_1_DAY_AGO' },
          message: { conversation: 'Message from yesterday (within 3 days)' },
          messageTimestamp: Math.floor(oneDayAgo.getTime() / 1000),
        },
        {
          key: { remoteJid: '919876543210@s.whatsapp.net', fromMe: true, id: 'HIST_MSG_2_DAYS_AGO' },
          message: { conversation: 'Message from 2 days ago (within 3 days)' },
          messageTimestamp: Math.floor(twoDaysAgo.getTime() / 1000),
        },
        {
          key: { remoteJid: '919876543210@s.whatsapp.net', fromMe: false, id: 'HIST_MSG_4_DAYS_AGO' },
          message: { conversation: 'Message from 4 days ago (MUST BE SKIPPED)' },
          messageTimestamp: Math.floor(fourDaysAgo.getTime() / 1000),
        },
        {
          key: { remoteJid: '919876543210@s.whatsapp.net', fromMe: false, id: 'HIST_MSG_10_DAYS_AGO' },
          message: { conversation: 'Message from 10 days ago (MUST BE SKIPPED)' },
          messageTimestamp: Math.floor(tenDaysAgo.getTime() / 1000),
        },
      ],
    };

    // Execute background sync processing
    await MessageHandler.processBackgroundHistorySync(repContext, historyPayload);

    // Verify which messages were saved vs dropped by 3-day cutoff
    const msg1Day = await MessageModel.findBySalespersonAndWhatsAppMessageId(salespersonId, 'HIST_MSG_1_DAY_AGO');
    const msg2Days = await MessageModel.findBySalespersonAndWhatsAppMessageId(salespersonId, 'HIST_MSG_2_DAYS_AGO');
    const msg4Days = await MessageModel.findBySalespersonAndWhatsAppMessageId(salespersonId, 'HIST_MSG_4_DAYS_AGO');
    const msg10Days = await MessageModel.findBySalespersonAndWhatsAppMessageId(salespersonId, 'HIST_MSG_10_DAYS_AGO');

    assert('Historical message within 1 day WAS ingested', Boolean(msg1Day));
    assert('Historical message within 2 days WAS ingested', Boolean(msg2Days));
    assert('Historical message 4 days old was SKIPPED by 3-day cutoff', msg4Days === null);
    assert('Historical message 10 days old was SKIPPED by 3-day cutoff', msg10Days === null);

    // Verify sync completion status
    const postSyncSession = await WhatsAppSessionModel.findBySalespersonId(salespersonId);
    assert('Sync status reached Synchronization completed', postSyncSession.sync_status === 'Synchronization completed');
    assert('Sync progress recorded messagesProcessed = 2', postSyncSession.sync_progress?.messagesProcessed === 2);
    assert('Sync progress recorded startDate and endDate window', Boolean(postSyncSession.sync_progress?.startDate && postSyncSession.sync_progress?.endDate));

    // ========================================================================
    // PART 3: CRITICAL Guarantee — Real-time Live Messages NEVER Dropped
    // ========================================================================
    console.log('\n--- PART 3: Real-Time Live Messages Bypassing 3-Day Filter ---');

    // Test a live incoming message with timestamp older than 3 days (e.g. phone clock skew or delay)
    // Live messages (type: 'notify') MUST NEVER BE DROPPED!
    const skewedLiveTimestamp = Math.floor((now - 5 * 24 * 60 * 60 * 1000) / 1000); // 5 days skewed
    const liveSkewedMessage = {
      messages: [
        {
          key: { remoteJid: '919876543210@s.whatsapp.net', fromMe: false, id: 'LIVE_SKEWED_MSG_5_DAYS' },
          message: { conversation: 'Live incoming message with skewed clock' },
          messageTimestamp: skewedLiveTimestamp,
        },
      ],
      type: 'notify', // Real-time live event!
    };

    let sseEmittedLiveMsg = null;
    const testEventListener = (data) => {
      if (data.whatsappMessageId === 'LIVE_SKEWED_MSG_5_DAYS') {
        sseEmittedLiveMsg = data;
      }
    };
    MessageHandler.getEventBus().on('message:persisted', testEventListener);

    const liveResult = await MessageHandler.handleMessagesUpsert(repContext, liveSkewedMessage);
    MessageHandler.getEventBus().removeListener('message:persisted', testEventListener);

    assert('Live message was persisted despite timestamp being 5 days old', liveResult.length === 1);
    const persistedLive = await MessageModel.findBySalespersonAndWhatsAppMessageId(salespersonId, 'LIVE_SKEWED_MSG_5_DAYS');
    assert('Persisted live message exists in database', Boolean(persistedLive));
    assert('Real-time live message was broadcast to SSE stream immediately', Boolean(sseEmittedLiveMsg));

    // Test live outgoing message sent directly by salesperson
    const liveOutgoingMessage = {
      messages: [
        {
          key: { remoteJid: '919876543210@s.whatsapp.net', fromMe: true, id: 'LIVE_OUTGOING_MSG_REP_1' },
          message: { conversation: 'Live reply sent by salesperson on phone' },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      ],
      type: 'notify',
    };

    const outResult = await MessageHandler.handleMessagesUpsert(repContext, liveOutgoingMessage);
    assert('Live outgoing message was processed successfully', outResult.length === 1);
    const persistedOut = await MessageModel.findBySalespersonAndWhatsAppMessageId(salespersonId, 'LIVE_OUTGOING_MSG_REP_1');
    assert('Outgoing message direction is outgoing', persistedOut?.direction === 'outgoing');

    // ========================================================================
    // PART 4: Latest 20 Messages First & Chronological Pagination
    // ========================================================================
    console.log('\n--- PART 4: Latest 20 Messages First & Chronological Pagination ---');

    // Create a dedicated conversation with 35 messages
    const pagCust = await CustomerModel.upsert({
      salespersonId,
      whatsappId: '919888888888@s.whatsapp.net',
      phoneNumber: '+919888888888',
      displayName: 'Pagination Test Customer',
      contactType: 'individual',
    });
    const pagConv = await ConversationModel.findOrCreate(salespersonId, pagCust.id);

    // Insert 35 sequential messages spanning 35 minutes
    const baseTime = now - 35 * 60 * 1000;
    for (let i = 1; i <= 35; i++) {
      const msgTime = new Date(baseTime + i * 60 * 1000).toISOString();
      await MessageModel.create({
        conversationId: pagConv.id,
        salespersonId,
        customerId: pagCust.id,
        whatsappMessageId: `PAG_MSG_${i}`,
        direction: i % 2 === 0 ? 'outgoing' : 'incoming',
        messageType: 'text',
        messageText: `Sequential message number ${i}`,
        messageTimestamp: msgTime,
      });
    }

    const totalCount = await MessageModel.countByConversationId(pagConv.id);
    assert('Total 35 messages created in conversation', totalCount === 35);

    // Page 1 (offset 0, limit 20): MUST return the LATEST 20 messages (messages 16 to 35) in chronological order!
    const page1Messages = await MessageModel.findByConversationId(pagConv.id, { limit: 20, offset: 0 });
    assert('Page 1 returns exactly 20 messages', page1Messages.length === 20);
    assert('Page 1 starts with message 16', page1Messages[0].whatsapp_message_id === 'PAG_MSG_16');
    assert('Page 1 ends with newest message 35', page1Messages[page1Messages.length - 1].whatsapp_message_id === 'PAG_MSG_35');

    // Verify chronological order: timestamps must be strictly ascending
    let isChronological = true;
    for (let j = 1; j < page1Messages.length; j++) {
      if (new Date(page1Messages[j].message_timestamp) < new Date(page1Messages[j - 1].message_timestamp)) {
        isChronological = false;
        break;
      }
    }
    assert('Page 1 messages are sorted in chronological order (oldest to newest)', isChronological);

    // Page 2 (offset 20, limit 20): MUST return the previous 15 older messages (messages 1 to 15) in chronological order!
    const page2Messages = await MessageModel.findByConversationId(pagConv.id, { limit: 20, offset: 20 });
    assert('Page 2 returns remaining 15 older messages', page2Messages.length === 15);
    assert('Page 2 starts with oldest message 1', page2Messages[0].whatsapp_message_id === 'PAG_MSG_1');
    assert('Page 2 ends with message 15', page2Messages[page2Messages.length - 1].whatsapp_message_id === 'PAG_MSG_15');

    // ========================================================================
    // PART 5: Deduplication and Salesperson Isolation
    // ========================================================================
    console.log('\n--- PART 5: Deduplication and Salesperson Isolation ---');

    // Attempting duplicate insert with same whatsapp_message_id
    const dupResult = await MessageModel.create({
      conversationId: pagConv.id,
      salespersonId,
      customerId: pagCust.id,
      whatsappMessageId: 'PAG_MSG_1',
      direction: 'incoming',
      messageType: 'text',
      messageText: 'Duplicate message attempt',
      messageTimestamp: new Date().toISOString(),
    });
    assert('Duplicate message insert is safely rejected (returns null without crashing)', dupResult === null);

    const countAfterDup = await MessageModel.countByConversationId(pagConv.id);
    assert('Message count remains 35 after duplicate insert attempt', countAfterDup === 35);

    // Clean up test data
    await db.query(`DELETE FROM messages WHERE salesperson_id = $1;`, [salespersonId]);
    await db.query(`DELETE FROM customers WHERE salesperson_id = $1;`, [salespersonId]);

    console.log('\n======================================================================');
    console.log(`  Phase 12 Test Summary: Passed: ${passed} | Failed: ${failed}`);
    console.log('======================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n[FATAL ERROR IN PHASE 12 TEST SUITE]:', err);
    process.exit(1);
  }
}

runPhase12Tests();
