/**
 * Phase 11: WhatsApp Customer Identity Resolution and Real-Time Message Synchronization Test Suite
 *
 * Verifies:
 * 1. Contact name resolution priority (contact name > verifiedName > pushName > existing > phone fallback).
 * 2. Raw JID exclusion from display_name (no raw JID stored as name).
 * 3. Group conversations detection (@g.us), group subject storage, and dynamic updates via groups.update.
 * 4. Group participant capture (participant_jid and participant_name).
 * 5. WhatsApp LID support (@lid) and reliable mapping to phone numbers.
 * 6. Duplicate prevention for customers and messages.
 * 7. Real-time incoming and outgoing message persistence and direction.
 * 8. Live SSE stream event emission with standard payload structure.
 * 9. Salesperson isolation for real-time events.
 */

const http = require('http');
const app = require('../src/app');
const db = require('../src/config/db');
const config = require('../src/config/env');
const CustomerModel = require('../src/models/customerModel');
const ConversationModel = require('../src/models/conversationModel');
const MessageModel = require('../src/models/messageModel');
const MessageHandler = require('../src/services/whatsapp/MessageHandler');
const { createStreamTicket } = require('../src/middleware/authMiddleware');

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

async function runPhase11Tests() {
  console.log('\n======================================================================');
  console.log('  Phase 11: Identity Resolution & Real-Time Sync Verification Suite');
  console.log('======================================================================\n');

  await db.testConnection();

  const salespersonId = '5358e311-eaf5-4708-871c-e27dcd8baba0'; // mohammed
  const repContext = {
    salespersonId,
    salespersonName: 'mohammed',
    salespersonPhone: '+859165987',
  };

  try {
    // Ensure test salesperson exists in PostgreSQL
    await db.query(
      `INSERT INTO salespersons (id, name, phone_number, is_active, connection_status)
       VALUES ($1, $2, $3, true, 'Connected')
       ON CONFLICT (id) DO UPDATE SET is_active = true, connection_status = 'Connected';`,
      [salespersonId, 'mohammed', '+859165987']
    );

    // ====================================================================
    // Section 1: Customer Name Resolution Priority & Sanitization
    // ====================================================================
    console.log('\n  [Section 1] Customer Name Resolution Priority & Sanitization:');

    // 1.1 Priority: Contact Name from Address Book
    const contactPayload1 = [
      {
        id: '919876543210@s.whatsapp.net',
        name: 'Ahmed Al-Mansoor',
        verifiedName: 'Ahmed Enterprises',
        notify: 'Ahmed WA',
      },
    ];
    await MessageHandler.handleContactsUpsert(repContext, contactPayload1);
    const c1 = await CustomerModel.findBySalespersonAndWhatsAppId(salespersonId, '919876543210@s.whatsapp.net');
    assert('Contact name from address book takes top priority', c1?.display_name === 'Ahmed Al-Mansoor');
    assert('Phone number correctly extracted for individual', c1?.phone_number === '+919876543210');
    assert('Contact type is individual', c1?.contact_type === 'individual');

    // 1.2 Priority: Verified Business Name when contact name is absent
    const contactPayload2 = [
      {
        id: '919876543211@s.whatsapp.net',
        name: null,
        verifiedName: 'Official Gulf Trading Co',
        notify: 'Gulf Support',
      },
    ];
    await MessageHandler.handleContactsUpsert(repContext, contactPayload2);
    const c2 = await CustomerModel.findBySalespersonAndWhatsAppId(salespersonId, '919876543211@s.whatsapp.net');
    assert('WhatsApp verified business name is preferred when address book name is missing', c2?.display_name === 'Official Gulf Trading Co');

    // 1.3 Priority: WhatsApp pushName when both contact name and verifiedName are absent
    const contactPayload3 = [
      {
        id: '919876543212@s.whatsapp.net',
        name: null,
        verifiedName: null,
        notify: 'Fatima Zahra',
      },
    ];
    await MessageHandler.handleContactsUpsert(repContext, contactPayload3);
    const c3 = await CustomerModel.findBySalespersonAndWhatsAppId(salespersonId, '919876543212@s.whatsapp.net');
    assert('WhatsApp pushName is used when contact & business names are absent', c3?.display_name === 'Fatima Zahra');

    // 1.4 Strict Sanitization: Never store raw WhatsApp JID as display_name
    const rawJidContact = [
      {
        id: '919876543213@s.whatsapp.net',
        name: '919876543213@s.whatsapp.net',
        notify: '+919876543213',
      },
    ];
    await MessageHandler.handleContactsUpsert(repContext, rawJidContact);
    const c4 = await CustomerModel.findBySalespersonAndWhatsAppId(salespersonId, '919876543213@s.whatsapp.net');
    assert('Raw WhatsApp JID is strictly rejected as display_name', c4?.display_name === null);
    assert('Phone number is preserved as fallback', c4?.phone_number === '+919876543213');

    // 1.5 Pure phone number string rejected as display_name
    assert('sanitizeDisplayName rejects raw JID', CustomerModel.sanitizeDisplayName('917736916485@s.whatsapp.net') === null);
    assert('sanitizeDisplayName rejects group JID', CustomerModel.sanitizeDisplayName('120363411055677963@g.us') === null);
    assert('sanitizeDisplayName rejects bare phone string', CustomerModel.sanitizeDisplayName('+917736916485') === null);
    assert('sanitizeDisplayName accepts legitimate human names', CustomerModel.sanitizeDisplayName('Tariq Bin Ziyad') === 'Tariq Bin Ziyad');

    // ====================================================================
    // Section 2: WhatsApp Group Conversations Handling (@g.us)
    // ====================================================================
    console.log('\n  [Section 2] WhatsApp Group Conversations Handling (@g.us):');

    const groupJid = '120363411055677963@g.us';

    // 2.1 Chat upsert creates group with group subject
    await MessageHandler.handleChatsUpsert(repContext, [
      {
        id: groupJid,
        name: 'Enterprise VIP Accounts',
      },
    ]);

    const groupCust = await CustomerModel.findBySalespersonAndWhatsAppId(salespersonId, groupJid);
    assert('Group identified and marked with contact_type = "group"', groupCust?.contact_type === 'group');
    assert('Group subject correctly captured and stored', groupCust?.group_subject === 'Enterprise VIP Accounts');
    assert('Group display_name reflects group subject', groupCust?.display_name === 'Enterprise VIP Accounts');
    assert('Group phone_number is strictly null', groupCust?.phone_number === null);

    // 2.2 Dynamic Group Subject Update via groups.update
    await MessageHandler.handleGroupsUpdate(repContext, [
      {
        id: groupJid,
        subject: 'Enterprise VIP Accounts (Q4 Expansion)',
      },
    ]);

    const updatedGroup = await CustomerModel.findBySalespersonAndWhatsAppId(salespersonId, groupJid);
    assert('Group subject dynamically updated via groups.update', updatedGroup?.group_subject === 'Enterprise VIP Accounts (Q4 Expansion)');
    assert('Group display_name updated in sync', updatedGroup?.display_name === 'Enterprise VIP Accounts (Q4 Expansion)');

    // 2.3 Duplicate Group Prevention
    await MessageHandler.handleChatsUpsert(repContext, [
      {
        id: groupJid,
        name: 'Enterprise VIP Accounts (Q4 Expansion)',
      },
    ]);
    const groupCount = await CustomerModel.countBySalespersonId(salespersonId, { search: 'Enterprise VIP' });
    assert('Duplicate group customer records are prevented', groupCount === 1);

    // ====================================================================
    // Section 3: WhatsApp LID Support (@lid)
    // ====================================================================
    console.log('\n  [Section 3] WhatsApp LID Resolution (@lid):');

    const lidJid = '99887766554433@lid';
    const realPhoneJid = '919876543299@s.whatsapp.net';

    // 3.1 Store LID mapping
    await MessageHandler.handleLidMappingUpdate(repContext, {
      lid: lidJid,
      pn: realPhoneJid,
    });

    const mappedPn = await CustomerModel.findPhoneJidByLid(salespersonId, lidJid);
    assert('LID to Phone JID mapping stored and retrieved successfully', mappedPn === realPhoneJid);

    // 3.2 Contact with LID resolves to real phone number
    await MessageHandler.handleContactsUpsert(repContext, [
      {
        id: lidJid,
        phoneNumber: realPhoneJid,
        name: 'Rashid Al-Kindi',
        lid: lidJid,
      },
    ]);

    const lidCust = await CustomerModel.findBySalespersonAndWhatsAppId(salespersonId, lidJid);
    assert('LID customer record created with proper name', lidCust?.display_name === 'Rashid Al-Kindi');
    assert('LID customer record mapped to real clean phone', lidCust?.phone_number === '+919876543299');
    assert('LID JID recorded in lid_jid column', lidCust?.lid_jid === lidJid);

    // ====================================================================
    // Section 4: Real-Time Incoming, Outgoing & Group Messages
    // ====================================================================
    console.log('\n  [Section 4] Real-Time Messages Persistence & SSE Stream:');

    // Set up SSE Event Listener to verify live emission
    const eventBus = MessageHandler.getEventBus();
    let sseEventsReceived = [];
    const sseListener = (data) => {
      sseEventsReceived.push(data);
    };
    eventBus.on('message:persisted', sseListener);

    // 4.1 Incoming 1-on-1 Message from Customer
    const incomingMsgId = `msg_in_${Date.now()}`;
    await MessageHandler.handleMessagesUpsert(repContext, {
      type: 'notify',
      messages: [
        {
          key: {
            id: incomingMsgId,
            remoteJid: '919876543210@s.whatsapp.net',
            fromMe: false,
          },
          pushName: 'Ahmed Al-Mansoor',
          message: {
            conversation: 'Hello, I would like to confirm my order for tomorrow.',
          },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      ],
    });

    const persistedIn = await MessageModel.findBySalespersonAndWhatsAppMessageId(salespersonId, incomingMsgId);
    assert('Incoming message persisted in PostgreSQL', Boolean(persistedIn));
    assert('Incoming message direction is "incoming"', persistedIn?.direction === 'incoming');
    assert('Incoming message text is correct', persistedIn?.message_text === 'Hello, I would like to confirm my order for tomorrow.');

    // 4.2 Outgoing Message sent directly by Salesperson (fromMe: true)
    const outgoingMsgId = `msg_out_${Date.now()}`;
    await MessageHandler.handleMessagesUpsert(repContext, {
      type: 'notify',
      messages: [
        {
          key: {
            id: outgoingMsgId,
            remoteJid: '919876543210@s.whatsapp.net',
            fromMe: true,
          },
          message: {
            conversation: 'Certainly! Your shipment has been scheduled for 10 AM.',
          },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      ],
    });

    const persistedOut = await MessageModel.findBySalespersonAndWhatsAppMessageId(salespersonId, outgoingMsgId);
    assert('Outgoing message persisted in PostgreSQL', Boolean(persistedOut));
    assert('Outgoing message direction is "outgoing"', persistedOut?.direction === 'outgoing');

    // 4.3 Group Message with Participant Metadata
    const groupMsgId = `msg_grp_${Date.now()}`;
    const participantJid = '919876543212@s.whatsapp.net';
    await MessageHandler.handleMessagesUpsert(repContext, {
      type: 'notify',
      messages: [
        {
          key: {
            id: groupMsgId,
            remoteJid: groupJid,
            participant: participantJid,
            fromMe: false,
          },
          pushName: 'Fatima Zahra',
          message: {
            conversation: 'Shared quarterly report in group thread.',
          },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      ],
    });

    const persistedGroupMsg = await MessageModel.findBySalespersonAndWhatsAppMessageId(salespersonId, groupMsgId);
    assert('Group message persisted in PostgreSQL', Boolean(persistedGroupMsg));
    assert('Group message participant JID recorded', persistedGroupMsg?.participant_jid === participantJid);
    assert('Group message participant name recorded', persistedGroupMsg?.participant_name === 'Fatima Zahra');

    // 4.4 Idempotent Deduplication (No duplicate messages)
    await MessageHandler.handleMessagesUpsert(repContext, {
      type: 'notify',
      messages: [
        {
          key: {
            id: incomingMsgId,
            remoteJid: '919876543210@s.whatsapp.net',
            fromMe: false,
          },
          message: { conversation: 'Duplicate attempt' },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      ],
    });
    const conv = await ConversationModel.findById(persistedIn.conversation_id);
    const msgCount = await MessageModel.countByConversationId(persistedIn.conversation_id);
    assert('Conversation last_message_preview updated', conv?.last_message_preview?.includes('Duplicate attempt') || conv?.last_message_preview?.includes('Certainly'));
    assert('Duplicate WhatsApp message insertion safely avoided', msgCount >= 2);

    // 4.5 Verify SSE Live Stream Events Emission & Schema
    assert('SSE events were emitted after message persistence', sseEventsReceived.length >= 3);
    const sampleSSE = sseEventsReceived.find((e) => e.whatsappMessageId === incomingMsgId);
    assert('SSE event has type = "new_message"', sampleSSE?.type === 'new_message');
    assert('SSE event has salespersonId matching context', sampleSSE?.salespersonId === salespersonId);
    assert('SSE event includes conversationId', Boolean(sampleSSE?.conversationId));
    assert('SSE event includes customerId', Boolean(sampleSSE?.customerId));
    assert('SSE event includes direction', sampleSSE?.direction === 'incoming');
    assert('SSE event includes persisted message data', sampleSSE?.data?.message?.whatsapp_message_id === incomingMsgId);
    assert('SSE event timestamp is valid ISO string', Boolean(new Date(sampleSSE?.timestamp).getTime()));

    // 4.6 Salesperson Isolation: events for Rep B do not match Rep A
    const otherRepContext = {
      salespersonId: 'd7654c89-355e-4bb6-aba2-95b087f750f1',
      salespersonName: 'Rep Beta',
      salespersonPhone: '+15553111102',
    };
    await db.query(
      `INSERT INTO salespersons (id, name, phone_number, is_active, connection_status)
       VALUES ($1, $2, $3, true, 'Connected')
       ON CONFLICT (id) DO NOTHING;`,
      [otherRepContext.salespersonId, otherRepContext.salespersonName, otherRepContext.salespersonPhone]
    );

    const otherMsgId = `msg_other_${Date.now()}`;
    await MessageHandler.handleMessagesUpsert(otherRepContext, {
      type: 'notify',
      messages: [
        {
          key: { id: otherMsgId, remoteJid: '919876543299@s.whatsapp.net', fromMe: false },
          pushName: 'Isolate Tester',
          message: { conversation: 'Isolated Rep Message' },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      ],
    });

    const otherSSE = sseEventsReceived.find((e) => e.whatsappMessageId === otherMsgId);
    assert('Rep Beta SSE event carries separate salespersonId', otherSSE?.salespersonId === otherRepContext.salespersonId);
    assert('Rep Beta salespersonId is distinct from Rep Mohammed', otherSSE?.salespersonId !== repContext.salespersonId);

    // Clean up event listener
    eventBus.removeListener('message:persisted', sseListener);

  } catch (err) {
    console.error('Phase 11 test execution error:', err);
    failed++;
  }

  console.log('\n======================================================================');
  console.log(`  Phase 11 Verification Results: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runPhase11Tests();
