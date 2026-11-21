-- Phase 12: Fast WhatsApp QR Pairing and Last 3 Days Priority Synchronization
-- Target: PostgreSQL 12+

-- 1. Extend whatsapp_sessions with sync status and progress tracking
ALTER TABLE whatsapp_sessions
    ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'Waiting for device pairing',
    ADD COLUMN IF NOT EXISTS sync_progress JSONB DEFAULT '{"messagesProcessed": 0, "customersDiscovered": 0, "startDate": null, "endDate": null, "lastSyncAt": null, "error": null}'::jsonb;

-- 2. Add performance indexes for timestamp-based history queries and conversation pagination
CREATE INDEX IF NOT EXISTS idx_messages_salesperson_ts 
    ON messages(salesperson_id, message_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_ts 
    ON messages(conversation_id, message_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_last_msg 
    ON conversations(salesperson_id, last_message_at DESC NULLS LAST);

