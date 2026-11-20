const EventEmitter = require('events');
const path = require('path');
const CustomerModel = require('../../models/customerModel');
const ConversationModel = require('../../models/conversationModel');
const MessageModel = require('../../models/messageModel');
const MediaModel = require('../../models/mediaModel');
const WhatsAppSessionModel = require('../../models/whatsappSessionModel');

/**
 * Global event emitter for WhatsApp real-time events
 */
class WhatsAppMessageEventEmitter extends EventEmitter {}
const messageEvents = new WhatsAppMessageEventEmitter();

// In-memory deduplication set to ignore duplicate WhatsApp events (capped at 5,000 entries)
const recentlyProcessedKeys = new Set();
const MAX_DEDUP_CACHE = 5000;

/**
 * Historical message synchronization window in days (default: 3 days)
 */
function getHistorySyncDays() {
  const envVal = parseInt(process.env.HISTORY_SYNC_DAYS, 10);
  if (!isNaN(envVal) && envVal > 0) return envVal;
  return 3;
}

// In-memory cache of known group subjects to avoid spamming socket.groupMetadata
const groupSubjectCache = new Map();

function trackProcessedKey(key) {
  if (recentlyProcessedKeys.size >= MAX_DEDUP_CACHE) {
    const firstKey = recentlyProcessedKeys.values().next().value;
    recentlyProcessedKeys.delete(firstKey);
  }
  recentlyProcessedKeys.add(key);
}

/**
 * Clean phone number from WhatsApp JID
 * Only valid for individual users (@s.whatsapp.net, @c.us), NOT groups (@g.us) or LIDs (@lid).
 * @param {string} jid
 * @returns {string|null}
 */
function extractCleanPhone(jid) {
  if (!jid || typeof jid !== 'string') return null;
  if (jid.endsWith('@g.us') || jid.endsWith('@lid') || jid.endsWith('@broadcast') || jid.startsWith('status@')) {
    return null;
  }
  const digits = jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/[^0-9]/g, '');
  if (!digits || digits.length < 6 || digits.length > 20) return null;
  return `+${digits}`;
}

/**
 * MessageHandler: Handles WhatsApp contacts, groups, LID resolution, and message persistence.
 */
class MessageHandler {
  /**
   * Process raw Baileys 'messages.upsert' event
   * @param {Object} context
   * @param {string} context.salespersonId
   * @param {string} context.salespersonPhone
   * @param {string} context.salespersonName
   * @param {Object} [context.socket] Active WASocket instance
   * @param {Object} upsertPayload Raw Baileys upsert payload
   * @returns {Promise<Array<Object>>}
   */
  static async handleMessagesUpsert(context, upsertPayload) {
    if (!upsertPayload || !Array.isArray(upsertPayload.messages)) {
      return [];
    }

    const { salespersonName, salespersonId, socket } = context;
    const isLive = upsertPayload.type === 'notify';
    const results = [];

    console.log(
      `[WhatsApp Event][${salespersonName}] Processing messages.upsert: ${upsertPayload.messages.length} messages (type: ${upsertPayload.type || 'append'}, isLive: ${isLive})`
    );

    for (const msg of upsertPayload.messages) {
      if (!msg || !msg.key) continue;

      // 1. Ignore broadcast status updates
      const remoteJid = msg.key.remoteJid || '';
      if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@broadcast')) {
        continue;
      }

      // 2. Ignore protocol events (key exchange, revoke markers, history sync notifications)
      if (msg.message?.protocolMessage || msg.messageStubType) {
        continue;
      }

      // 3. History age filtering (ONLY for background sync/append, NEVER for live notify messages)
      if (!isLive) {
        const syncDays = getHistorySyncDays();
        const syncWindowMs = syncDays * 24 * 60 * 60 * 1000;
        const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : 0;
        if (msgTime > 0) {
          // Calculate reference time dynamically to handle any host clock skew
          const refTime = Math.max(Date.now(), msgTime);
          if (msgTime < refTime - syncWindowMs) {
            continue;
          }
        }
      }

      const normalized = this.normalizeMessage(context, msg);
      if (normalized) {
        const dedupKey = `${salespersonId}:${normalized.messageId}`;
        if (recentlyProcessedKeys.has(dedupKey) && !isLive) {
          continue;
        }
        trackProcessedKey(dedupKey);

        console.log(
          `[Message Pipeline][${normalized.messageId}] Direction: ${normalized.direction.toUpperCase()} | Rep: ${salespersonName} | Chat: ${normalized.remoteJid} | isGroup: ${normalized.isGroup} | Type: ${normalized.messageType}`
        );

        // Immediate event bus emission for raw message observation
        messageEvents.emit('message', normalized);

        // Persist message with retry resilience against transient database hiccups
        try {
          const persisted = await this.persistMessageWithRetry(context, normalized, msg);
          if (persisted) {
            results.push(persisted);

            // Broadcast to SSE stream only when persisted
            if (persisted.message) {
              const ssePayload = {
                type: 'new_message',
                salespersonId,
                customerId: persisted.customer?.id,
                conversationId: persisted.conversation?.id,
                messageId: persisted.message.id,
                whatsappMessageId: persisted.message.whatsapp_message_id,
                direction: persisted.message.direction,
                isGroup: normalized.isGroup,
                timestamp: persisted.message.message_timestamp,
                data: {
                  customer: persisted.customer,
                  conversation: persisted.conversation,
                  message: persisted.message,
                },
                // Backward-compatibility references
                customer: persisted.customer,
                conversation: persisted.conversation,
                message: persisted.message,
              };

              console.log(
                `[SSE Broadcast] Emitting 'new_message' for rep: ${salespersonId} | Conv: ${persisted.conversation?.id} | MsgId: ${persisted.message.id}`
              );
              messageEvents.emit('message:persisted', ssePayload);
            }
          }
        } catch (dbErr) {
          console.error(`[MessageHandler] Database error persisting msg ${normalized.messageId}:`, dbErr.message);
        }
      }
    }

    return results;
  }

  /**
   * Normalizes a raw Baileys message object into standard monitoring format
   * @param {Object} context
   * @param {Object} msg
   * @returns {Object|null}
   */
  static normalizeMessage(context, msg) {
    if (!msg.key || !msg.key.remoteJid) return null;

    const isFromMe = Boolean(msg.key.fromMe);
    const remoteJid = msg.key.remoteJid || '';
    const isGroup = remoteJid.endsWith('@g.us');
    const isLid = remoteJid.endsWith('@lid');

    // Group participant identification
    let participantJid = null;
    let participantName = null;

    if (isGroup) {
      participantJid = msg.key.participant || null;
      if (!isFromMe) {
        participantName = msg.pushName ? msg.pushName.trim() : null;
      } else {
        participantName = context.salespersonName;
      }
    }

    // Phone number resolution
    const customerPhone = isGroup ? null : extractCleanPhone(remoteJid);

    // Parse message content across all common WhatsApp types
    const messageContent = msg.message;
    let messageType = 'empty';
    let textContent = '[Empty message]';

    if (messageContent) {
      if (messageContent.conversation) {
        messageType = 'text';
        textContent = messageContent.conversation;
      } else if (messageContent.extendedTextMessage?.text) {
        messageType = 'text';
        textContent = messageContent.extendedTextMessage.text;
      } else if (messageContent.imageMessage) {
        messageType = 'image';
        textContent = messageContent.imageMessage.caption || '[Image Attachment]';
      } else if (messageContent.documentMessage) {
        messageType = 'document';
        textContent = messageContent.documentMessage.fileName || messageContent.documentMessage.caption || '[Document Attachment]';
      } else if (messageContent.audioMessage) {
        messageType = 'audio';
        textContent = messageContent.audioMessage.ptt ? '[Voice Message]' : '[Audio Clip]';
      } else if (messageContent.videoMessage) {
        messageType = 'video';
        textContent = messageContent.videoMessage.caption || '[Video Attachment]';
      } else if (messageContent.stickerMessage) {
        messageType = 'sticker';
        textContent = '[Sticker]';
      } else if (messageContent.contactMessage) {
        messageType = 'contact';
        textContent = messageContent.contactMessage.displayName || '[Contact Card]';
      } else if (messageContent.locationMessage) {
        messageType = 'location';
        textContent = messageContent.locationMessage.name || '[Location Data]';
      } else if (messageContent.reactionMessage) {
        messageType = 'reaction';
        textContent = messageContent.reactionMessage.text || '[Reaction]';
      } else {
        const keys = Object.keys(messageContent);
        if (keys.length === 0) {
          messageType = 'empty';
          textContent = '[Empty message]';
        } else {
          messageType = keys[0].replace('Message', '').toLowerCase();
          textContent = `[Attachment: ${messageType}]`;
        }
      }
    }

    const timestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    return {
      salespersonId: context.salespersonId,
      salespersonPhone: context.salespersonPhone,
      salespersonName: context.salespersonName,
      messageId: msg.key.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      remoteJid,
      customerPhone,
      isGroup,
      isLid,
      participantJid,
      participantName,
      isFromMe,
      direction: isFromMe ? 'outgoing' : 'incoming',
      senderRole: isFromMe ? 'salesperson' : 'customer',
      messageType,
      text: textContent,
      timestamp,
      pushName: msg.pushName || null,
      rawKey: {
        id: msg.key.id,
        remoteJid: msg.key.remoteJid,
        fromMe: msg.key.fromMe,
        participant: msg.key.participant,
      },
    };
  }

  /**
   * Persist message with automatic retry on transient database errors
   * @param {Object} context
   * @param {Object} normalized
   * @param {Object} [rawMsg]
   * @param {number} [maxRetries=3]
   * @returns {Promise<Object|null>}
   */
  static async persistMessageWithRetry(context, normalized, rawMsg = null, maxRetries = 3) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await this.persistMessage(context, normalized, rawMsg);
      } catch (err) {
        attempt++;
        if (attempt >= maxRetries) {
          throw err;
        }
        const delay = 150 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return null;
  }

  /**
   * Persists normalized message, customer/group, conversation, and media records into PostgreSQL
   * @param {Object} context
   * @param {Object} normalized
   * @param {Object} [rawMsg]
   * @returns {Promise<Object|null>}
   */
  static async persistMessage(context, normalized, rawMsg = null) {
    const { salespersonId, socket } = context;
    const {
      remoteJid,
      customerPhone,
      isFromMe,
      messageId,
      messageType,
      text,
      timestamp,
      isGroup,
      isLid,
      participantJid,
      participantName,
    } = normalized;

    if (!salespersonId || !remoteJid) {
      return null;
    }

    // --- Customer / Group Identity Resolution ---
    let displayName = null;
    let groupSubject = null;
    let contactType = isGroup ? 'group' : 'individual';
    let lidJid = isLid ? remoteJid : null;
    let resolvedPhone = customerPhone;

    // LID to phone resolution
    if (isLid && !resolvedPhone) {
      const mappedPhoneJid = await CustomerModel.findPhoneJidByLid(salespersonId, remoteJid);
      if (mappedPhoneJid) {
        resolvedPhone = extractCleanPhone(mappedPhoneJid);
      }
    }

    if (isGroup) {
      // Group Handling: retrieve cached or query groupMetadata
      const cachedSubject = groupSubjectCache.get(remoteJid);
      if (cachedSubject) {
        groupSubject = cachedSubject;
        displayName = cachedSubject;
      } else if (socket && typeof socket.groupMetadata === 'function') {
        // Query Baileys groupMetadata asynchronously
        this.fetchAndStoreGroupMetadata(socket, salespersonId, remoteJid).catch(() => {});
      }
    } else {
      // Individual Handling: use pushName from incoming message if available
      if (!isFromMe && (normalized.pushName || rawMsg?.pushName)) {
        displayName = CustomerModel.sanitizeDisplayName(
          normalized.pushName || rawMsg?.pushName,
          resolvedPhone,
          remoteJid
        );
      }
    }

    // 1. Identify or create customer record
    const customer = await CustomerModel.upsert({
      salespersonId,
      whatsappId: remoteJid,
      phoneNumber: resolvedPhone,
      displayName,
      contactType,
      groupSubject,
      lidJid,
    });

    if (!customer) {
      console.error(`[MessageHandler] Failed to resolve customer record for ${remoteJid}`);
      return null;
    }

    // 2. Find or create conversation for (salesperson, customer)
    const conversation = await ConversationModel.findOrCreate(salespersonId, customer.id);
    if (!conversation) {
      console.error(`[MessageHandler] Failed to find or create conversation for customer ${customer.id}`);
      return null;
    }

    // 3. Process media attachment metadata if present
    let mediaId = null;
    const messageContent = rawMsg?.message;
    if (messageContent) {
      let mediaPayload = null;
      let ext = '';
      let defaultName = '';

      if (messageContent.imageMessage) {
        mediaPayload = messageContent.imageMessage;
        ext = '.jpg';
        defaultName = `image_${messageId}.jpg`;
      } else if (messageContent.documentMessage) {
        mediaPayload = messageContent.documentMessage;
        ext = path.extname(mediaPayload.fileName || '') || '.pdf';
        defaultName = mediaPayload.fileName || `document_${messageId}${ext}`;
      } else if (messageContent.audioMessage) {
        mediaPayload = messageContent.audioMessage;
        ext = mediaPayload.ptt ? '.ogg' : '.mp3';
        defaultName = `audio_${messageId}${ext}`;
      } else if (messageContent.videoMessage) {
        mediaPayload = messageContent.videoMessage;
        ext = '.mp4';
        defaultName = `video_${messageId}.mp4`;
      }

      if (mediaPayload) {
        try {
          const mimeType = mediaPayload.mimetype || 'application/octet-stream';
          const fileSizeBytes = Number(mediaPayload.fileLength || 0);
          const fileName = mediaPayload.fileName || defaultName;

          const mediaRecord = await MediaModel.create({
            fileName,
            filePath: `pending_${messageId}${ext}`,
            mimeType,
            fileSizeBytes,
          });
          if (mediaRecord) {
            mediaId = mediaRecord.id;
          }
        } catch (mediaErr) {
          console.warn('[MessageHandler] Media metadata registration notice:', mediaErr.message);
        }
      }
    }

    // 4. Store message (idempotent insert with ON CONFLICT DO NOTHING)
    const direction = isFromMe ? 'outgoing' : 'incoming';
    const messageRecord = await MessageModel.create({
      conversationId: conversation.id,
      salespersonId,
      customerId: customer.id,
      whatsappMessageId: messageId,
      direction,
      messageType,
      messageText: text,
      mediaId,
      participantJid,
      participantName,
      messageTimestamp: timestamp,
    });

    // 5. Update conversation's latest message preview and timestamp
    const preview = text && text.trim() ? text.trim().substring(0, 150) : `[${messageType}]`;
    await ConversationModel.updateLastMessage(conversation.id, {
      lastMessageAt: timestamp,
      lastMessagePreview: preview,
    });

    console.log(
      `[DB Persist][${messageId}] Persisted message -> Conv: ${conversation.id} | Customer: ${customer.id} | Dir: ${direction}`
    );

    return { customer, conversation, message: messageRecord };
  }

  /**
   * Asynchronously fetches group metadata from Baileys and updates PostgreSQL & cache
   * @param {Object} socket Baileys WASocket
   * @param {string} salespersonId
   * @param {string} groupJid
   */
  static async fetchAndStoreGroupMetadata(socket, salespersonId, groupJid) {
    if (!socket || !groupJid || !groupJid.endsWith('@g.us')) return;
    try {
      const metadata = await socket.groupMetadata(groupJid);
      if (metadata && metadata.subject) {
        groupSubjectCache.set(groupJid, metadata.subject);
        const updated = await CustomerModel.updateGroupSubject(salespersonId, groupJid, metadata.subject);
        if (updated) {
          console.log(
            `[Identity Resolution][${groupJid}] Resolved group subject: "${metadata.subject}" (${metadata.participants?.length || 0} participants)`
          );
          messageEvents.emit('customer:updated', {
            type: 'customer_updated',
            salespersonId,
            customerId: updated.id,
            data: updated,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      // Group metadata query might fail if rep was removed from group or throttled; log safely
      console.warn(`[MessageHandler] Notice fetching groupMetadata for ${groupJid}:`, err.message);
    }
  }

  /**
   * Process Baileys 'messaging-history.set' event
   * Automatically synchronizes existing contacts, chats, and recent message history upon pairing.
   * Runs as a detached background job (Workflow B) to never block live message ingestion.
   * @param {Object} context
   * @param {Object} historyData
   */
  static handleMessagingHistory(context, historyData) {
    const { salespersonId, salespersonName } = context;
    console.log(
      `[WhatsApp Event][${salespersonName}] Enqueuing background history synchronization (Workflow B)...`
    );

    // Detached background execution to ensure socket and live message event loops are never blocked
    setImmediate(async () => {
      try {
        await this.processBackgroundHistorySync(context, historyData);
      } catch (err) {
        console.error(`[MessageHandler][${salespersonName}] Background sync failed:`, err.message);
        await WhatsAppSessionModel.updateSyncStatus(salespersonId, 'Synchronization failed', {
          error: err.message,
          lastSyncAt: new Date().toISOString(),
        });
        messageEvents.emit('sync:progress', {
          type: 'sync_progress',
          salespersonId,
          status: 'Synchronization failed',
          progress: { error: err.message, lastSyncAt: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  /**
   * Background processor for messaging history (Workflow B)
   * Applies the configurable 3-day window, resolves identities, batches DB writes, and reports progress.
   * @param {Object} context
   * @param {Object} historyData
   */
  static async processBackgroundHistorySync(context, historyData) {
    const { salespersonId, salespersonName, socket } = context;
    const { chats = [], contacts = [], messages = [], lidPnMappings = [] } = historyData || {};

    const syncDays = getHistorySyncDays();
    const syncWindowMs = syncDays * 24 * 60 * 60 * 1000;

    // Calculate reference time and window boundaries
    let maxTs = 0;
    for (const m of messages) {
      const ts = m.messageTimestamp ? Number(m.messageTimestamp) * 1000 : 0;
      if (ts > maxTs) maxTs = ts;
    }
    const refTime = maxTs > 0 ? Math.max(Date.now(), maxTs) : Date.now();
    const cutoffTime = refTime - syncWindowMs;
    const startDate = new Date(cutoffTime).toISOString();
    const endDate = new Date(refTime).toISOString();

    // 1. Initial State: Loading recent conversations
    const initialProgress = {
      messagesProcessed: 0,
      customersDiscovered: 0,
      totalMessagesInWindow: 0,
      startDate,
      endDate,
      syncDays,
      lastSyncAt: new Date().toISOString(),
      error: null,
    };
    await WhatsAppSessionModel.updateSyncStatus(salespersonId, 'Loading recent conversations', initialProgress);
    messageEvents.emit('sync:progress', {
      type: 'sync_progress',
      salespersonId,
      status: 'Loading recent conversations',
      progress: initialProgress,
      timestamp: new Date().toISOString(),
    });

    // 2. Process LID-to-Phone mappings
    if (Array.isArray(lidPnMappings)) {
      for (const mapping of lidPnMappings) {
        if (mapping && mapping.lid && mapping.pn) {
          await CustomerModel.storeLidMapping(salespersonId, mapping.lid, mapping.pn);
        }
      }
    }

    // 3. Process contacts with strict priority order
    let customersDiscovered = 0;
    if (Array.isArray(contacts)) {
      for (const contact of contacts) {
        if (!contact || !contact.id || contact.id === 'status@broadcast') continue;
        const jid = contact.id;
        const isGroup = jid.endsWith('@g.us');
        const isLid = jid.endsWith('@lid');

        let cleanPhone = null;
        if (!isGroup) {
          if (contact.phoneNumber) {
            cleanPhone = extractCleanPhone(contact.phoneNumber);
          } else if (!isLid) {
            cleanPhone = extractCleanPhone(jid);
          }
        }

        if (contact.lid && (contact.phoneNumber || (!isLid && jid))) {
          const pnJid = contact.phoneNumber || jid;
          await CustomerModel.storeLidMapping(salespersonId, contact.lid, pnJid);
        }

        const rawName = contact.name || contact.verifiedName || contact.notify || null;
        const displayName = CustomerModel.sanitizeDisplayName(rawName, cleanPhone, jid);

        try {
          const customer = await CustomerModel.upsert({
            salespersonId,
            whatsappId: jid,
            phoneNumber: cleanPhone,
            displayName,
            contactType: isGroup ? 'group' : 'individual',
            lidJid: isLid ? jid : (contact.lid || null),
          });

          if (displayName && cleanPhone) {
            await CustomerModel.updateDisplayNameByPhone(salespersonId, cleanPhone, displayName);
          }

          if (customer) {
            customersDiscovered++;
            await ConversationModel.findOrCreate(salespersonId, customer.id);
          }
        } catch {
          // Continue on individual contact error
        }
      }
    }

    // 4. Process chats
    if (Array.isArray(chats)) {
      for (const chat of chats) {
        if (!chat || !chat.id || chat.id === 'status@broadcast') continue;
        const jid = chat.id;
        const isGroup = jid.endsWith('@g.us');
        const isLid = jid.endsWith('@lid');
        const cleanPhone = isGroup ? null : extractCleanPhone(jid);

        let groupSubject = null;
        let displayName = null;

        if (isGroup) {
          groupSubject = CustomerModel.sanitizeDisplayName(chat.name || chat.displayName || null, null, jid);
          if (groupSubject) {
            groupSubjectCache.set(jid, groupSubject);
            displayName = groupSubject;
          } else if (socket) {
            this.fetchAndStoreGroupMetadata(socket, salespersonId, jid).catch(() => {});
          }
        } else {
          displayName = CustomerModel.sanitizeDisplayName(chat.displayName || chat.name || null, cleanPhone, jid);
        }

        try {
          const customer = await CustomerModel.upsert({
            salespersonId,
            whatsappId: jid,
            phoneNumber: cleanPhone,
            displayName,
            contactType: isGroup ? 'group' : 'individual',
            groupSubject,
            lidJid: isLid ? jid : null,
          });

          if (customer) {
            customersDiscovered++;
            await ConversationModel.findOrCreate(salespersonId, customer.id);
          }
        } catch {
          // Continue on individual chat error
        }
      }
    }

    // 5. Filter historical messages to configured window (default 3 days)
    const recentMessages = [];
    if (Array.isArray(messages)) {
      for (const m of messages) {
        const ts = m.messageTimestamp ? Number(m.messageTimestamp) * 1000 : 0;
        if (ts >= cutoffTime) {
          recentMessages.push(m);
        }
      }
    }

    // Prioritize newest messages first!
    recentMessages.sort((a, b) => {
      const tsA = a.messageTimestamp ? Number(a.messageTimestamp) : 0;
      const tsB = b.messageTimestamp ? Number(b.messageTimestamp) : 0;
      return tsB - tsA;
    });

    console.log(
      `[MessageHandler][${salespersonName}] Prioritizing ${recentMessages.length} of ${messages.length} messages within ${syncDays}-day window (newest first)`
    );

    // 6. Synchronizing recent messages in batches of 50
    const BATCH_SIZE = 50;
    let processedCount = 0;
    let hasBatchErrors = false;

    const syncInitialProgress = {
      messagesProcessed: 0,
      customersDiscovered,
      totalMessagesInWindow: recentMessages.length,
      startDate,
      endDate,
      syncDays,
      lastSyncAt: new Date().toISOString(),
      error: null,
    };
    await WhatsAppSessionModel.updateSyncStatus(salespersonId, 'Synchronizing recent messages', syncInitialProgress);
    messageEvents.emit('sync:progress', {
      type: 'sync_progress',
      salespersonId,
      status: 'Synchronizing recent messages',
      progress: syncInitialProgress,
      timestamp: new Date().toISOString(),
    });

    for (let i = 0; i < recentMessages.length; i += BATCH_SIZE) {
      const batch = recentMessages.slice(i, i + BATCH_SIZE);
      try {
        await this.handleMessagesUpsert(context, { messages: batch, type: 'append' });
        processedCount += batch.length;
      } catch (batchErr) {
        hasBatchErrors = true;
        console.error(`[MessageHandler][${salespersonName}] Batch sync write error:`, batchErr.message);
      }

      const currentProgress = {
        messagesProcessed: processedCount,
        customersDiscovered,
        totalMessagesInWindow: recentMessages.length,
        startDate,
        endDate,
        syncDays,
        lastSyncAt: new Date().toISOString(),
        error: hasBatchErrors ? 'Encountered transient write issues during batch' : null,
      };

      await WhatsAppSessionModel.updateSyncStatus(salespersonId, 'Synchronizing recent messages', currentProgress);
      messageEvents.emit('sync:progress', {
        type: 'sync_progress',
        salespersonId,
        status: 'Synchronizing recent messages',
        progress: currentProgress,
        timestamp: new Date().toISOString(),
      });

      // Cooperative scheduling: yield event loop to let live messages process without latency
      await new Promise((resolve) => setImmediate(resolve));
    }

    const finalStatus = hasBatchErrors
      ? 'Synchronization partially completed'
      : 'Synchronization completed';

    const finalProgress = {
      messagesProcessed: processedCount,
      customersDiscovered,
      totalMessagesInWindow: recentMessages.length,
      startDate,
      endDate,
      syncDays,
      lastSyncAt: new Date().toISOString(),
      error: hasBatchErrors ? 'Partial batch failure during sync' : null,
    };

    await WhatsAppSessionModel.updateSyncStatus(salespersonId, finalStatus, finalProgress);
    messageEvents.emit('sync:progress', {
      type: 'sync_progress',
      salespersonId,
      status: finalStatus,
      progress: finalProgress,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `[WhatsApp Event][${salespersonName}] ${finalStatus}: ${processedCount} messages, ${customersDiscovered} customers within ${syncDays} days.`
    );
  }

  /**
   * Process Baileys 'chats.upsert' and 'chats.update' events
   * @param {Object} context
   * @param {Array} chats
   */
  static async handleChatsUpsert(context, chats) {
    if (!Array.isArray(chats)) return;
    const { salespersonId, socket } = context;

    for (const chat of chats) {
      if (!chat || !chat.id || chat.id === 'status@broadcast') continue;
      const jid = chat.id;
      const isGroup = jid.endsWith('@g.us');
      const cleanPhone = isGroup ? null : extractCleanPhone(jid);

      let groupSubject = null;
      let displayName = null;

      if (isGroup) {
        groupSubject = CustomerModel.sanitizeDisplayName(chat.name || chat.displayName || null, null, jid);
        if (groupSubject) {
          groupSubjectCache.set(jid, groupSubject);
          displayName = groupSubject;
        } else if (socket) {
          this.fetchAndStoreGroupMetadata(socket, salespersonId, jid).catch(() => {});
        }
      } else {
        displayName = CustomerModel.sanitizeDisplayName(chat.displayName || chat.name || null, cleanPhone, jid);
      }

      try {
        const customer = await CustomerModel.upsert({
          salespersonId,
          whatsappId: jid,
          phoneNumber: cleanPhone,
          displayName,
          contactType: isGroup ? 'group' : 'individual',
          groupSubject,
        });

        if (customer) {
          await ConversationModel.findOrCreate(salespersonId, customer.id);
          if (displayName || groupSubject) {
            messageEvents.emit('customer:updated', {
              type: 'customer_updated',
              salespersonId,
              customerId: customer.id,
              data: customer,
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        // Silently continue
      }
    }
  }

  /**
   * Process Baileys 'contacts.upsert' and 'contacts.update' events
   * @param {Object} context
   * @param {Array} contacts
   */
  static async handleContactsUpsert(context, contacts) {
    if (!Array.isArray(contacts)) return;
    const { salespersonId } = context;

    for (const contact of contacts) {
      if (!contact || !contact.id || contact.id === 'status@broadcast') continue;
      const jid = contact.id;
      const isGroup = jid.endsWith('@g.us');
      const isLid = jid.endsWith('@lid');

      let cleanPhone = null;
      if (!isGroup) {
        if (contact.phoneNumber) {
          cleanPhone = extractCleanPhone(contact.phoneNumber);
        } else if (!isLid) {
          cleanPhone = extractCleanPhone(jid);
        }
      }

      if (contact.lid && (contact.phoneNumber || (!isLid && jid))) {
        const pnJid = contact.phoneNumber || jid;
        await CustomerModel.storeLidMapping(salespersonId, contact.lid, pnJid);
      }

      // Priority: contact.name > contact.verifiedName > contact.notify
      const rawName = contact.name || contact.verifiedName || contact.notify || null;
      const displayName = CustomerModel.sanitizeDisplayName(rawName, cleanPhone, jid);

      if (displayName || cleanPhone) {
        try {
          const customer = await CustomerModel.upsert({
            salespersonId,
            whatsappId: jid,
            phoneNumber: cleanPhone,
            displayName,
            contactType: isGroup ? 'group' : 'individual',
            lidJid: isLid ? jid : (contact.lid || null),
          });

          if (displayName && cleanPhone) {
            await CustomerModel.updateDisplayNameByPhone(salespersonId, cleanPhone, displayName);
          }

          if (customer) {
            await ConversationModel.findOrCreate(salespersonId, customer.id);
            if (displayName) {
              messageEvents.emit('customer:updated', {
                type: 'customer_updated',
                salespersonId,
                customerId: customer.id,
                data: customer,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (err) {
          // Silently continue
        }
      }
    }
  }

  /**
   * Process Baileys 'groups.upsert' and 'groups.update' events
   * @param {Object} context
   * @param {Array} groups
   */
  static async handleGroupsUpdate(context, groups) {
    if (!Array.isArray(groups)) return;
    const { salespersonId } = context;

    for (const group of groups) {
      if (!group || !group.id || !group.id.endsWith('@g.us')) continue;
      const groupJid = group.id;
      const groupSubject = CustomerModel.sanitizeDisplayName(group.subject, null, groupJid);

      if (groupSubject) {
        groupSubjectCache.set(groupJid, groupSubject);
        try {
          const updated = await CustomerModel.updateGroupSubject(salespersonId, groupJid, groupSubject);
          if (updated) {
            console.log(
              `[Identity Resolution][${groupJid}] Updated group subject: "${groupSubject}"`
            );
            messageEvents.emit('customer:updated', {
              type: 'customer_updated',
              salespersonId,
              customerId: updated.id,
              data: updated,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn('[MessageHandler] Error handling group update:', err.message);
        }
      }
    }
  }

  /**
   * Process Baileys 'lid-mapping.update' event
   * @param {Object} context
   * @param {Object} mapping { lid, pn }
   */
  static async handleLidMappingUpdate(context, mapping) {
    if (!mapping || !mapping.lid || !mapping.pn) return;
    const { salespersonId } = context;

    console.log(
      `[Identity Resolution] Received lid-mapping.update: LID ${mapping.lid} -> Phone ${mapping.pn}`
    );

    await CustomerModel.storeLidMapping(salespersonId, mapping.lid, mapping.pn);

    // If an existing customer has this LID as their whatsapp_id, link their phone number
    const cleanPhone = extractCleanPhone(mapping.pn);
    if (cleanPhone) {
      try {
        const lidCustomer = await CustomerModel.findBySalespersonAndWhatsAppId(salespersonId, mapping.lid);
        if (lidCustomer && !lidCustomer.phone_number) {
          await CustomerModel.upsert({
            salespersonId,
            whatsappId: mapping.lid,
            phoneNumber: cleanPhone,
            displayName: lidCustomer.display_name,
            contactType: 'individual',
            lidJid: mapping.lid,
          });
        }
      } catch (err) {
        // Continue
      }
    }
  }

  /**
   * Access the message events bus
   */
  static getEventBus() {
    return messageEvents;
  }
}

module.exports = MessageHandler;
