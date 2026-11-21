-- WhatsApp Monitor: Phase 5 Migration
-- Tables: customers, conversations, media_attachments, messages
-- Target: PostgreSQL 12+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. Customers Table (Phase 5)
-- ==========================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salesperson_id UUID NOT NULL REFERENCES salespersons(id) ON DELETE CASCADE,
    whatsapp_id VARCHAR(100) NOT NULL,
    phone_number VARCHAR(30),
    display_name VARCHAR(255),
    profile_picture_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customers_salesperson_whatsapp UNIQUE (salesperson_id, whatsapp_id)
);

-- Indices for customer lookups and sorting
CREATE INDEX IF NOT EXISTS idx_customers_salesperson_id ON customers(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_whatsapp ON customers(whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_customers_salesperson_created ON customers(salesperson_id, created_at DESC);

-- Trigger for customer updated_at
DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 2. Conversations Table (Phase 5)
-- ==========================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salesperson_id UUID NOT NULL REFERENCES salespersons(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    last_message_at TIMESTAMP WITH TIME ZONE,
    last_message_preview TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_conversations_salesperson_customer UNIQUE (salesperson_id, customer_id)
);

-- Indices for conversation lookups and chronological ordering
CREATE INDEX IF NOT EXISTS idx_conversations_salesperson ON conversations(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(salesperson_id, last_message_at DESC NULLS LAST);

-- Trigger for conversation updated_at
DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 3. Media Attachments Table (Phase 5)
-- ==========================================
CREATE TABLE IF NOT EXISTS media_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT DEFAULT 0,
    checksum VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_attachments_checksum ON media_attachments(checksum);

-- ==========================================
-- 4. Messages Table (Phase 5)
-- ==========================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    salesperson_id UUID NOT NULL REFERENCES salespersons(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    whatsapp_message_id VARCHAR(255) NOT NULL,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    message_type VARCHAR(50) NOT NULL DEFAULT 'text',
    message_text TEXT,
    media_id UUID REFERENCES media_attachments(id) ON DELETE SET NULL,
    message_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_messages_salesperson_whatsapp_msg UNIQUE (salesperson_id, whatsapp_message_id)
);

-- Indices for message history lookups and duplicate prevention
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, message_timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_messages_salesperson_customer ON messages(salesperson_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(message_timestamp DESC);

