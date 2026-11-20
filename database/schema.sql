-- WhatsApp Monitor: Complete Database Schema (Phase 1 & Phase 2)
-- Target: PostgreSQL 12+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. Admin Users Table (Phase 1)
-- ==========================================
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    full_name VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast username lookup during authentication
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on record update
DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON admin_users;
CREATE TRIGGER trg_admin_users_updated_at
BEFORE UPDATE ON admin_users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 2. Salespersons Table (Phase 2)
-- ==========================================
CREATE TABLE IF NOT EXISTS salespersons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    email VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    connection_status VARCHAR(30) NOT NULL DEFAULT 'Not Connected' 
        CHECK (connection_status IN ('Not Connected', 'Pending', 'Initializing', 'Waiting for QR Scan', 'QR Expired', 'Connecting', 'Connected', 'Disconnected', 'Error')),
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique index to prevent duplicate active phone numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_salespersons_phone_unique 
    ON salespersons(phone_number) 
    WHERE deleted_at IS NULL;

-- Indices for search & filtering
CREATE INDEX IF NOT EXISTS idx_salespersons_name ON salespersons(name);
CREATE INDEX IF NOT EXISTS idx_salespersons_status ON salespersons(is_active, connection_status);

-- Trigger for salesperson updated_at
DROP TRIGGER IF EXISTS trg_salespersons_updated_at ON salespersons;
CREATE TRIGGER trg_salespersons_updated_at
BEFORE UPDATE ON salespersons
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ==========================================
-- 3. WhatsApp Sessions Table (Phase 3)
-- ==========================================
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salesperson_id UUID NOT NULL REFERENCES salespersons(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'Not Connected' 
        CHECK (status IN ('Not Connected', 'Initializing', 'Waiting for QR Scan', 'QR Expired', 'Connecting', 'Connected', 'Disconnected', 'Error')),
    provider VARCHAR(50) NOT NULL DEFAULT 'demo',
    is_demo BOOLEAN NOT NULL DEFAULT TRUE,
    qr_code TEXT,
    qr_expires_at TIMESTAMP WITH TIME ZONE,
    last_connected_at TIMESTAMP WITH TIME ZONE,
    last_disconnected_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    sync_status VARCHAR(50) DEFAULT 'Waiting for device pairing',
    sync_progress JSONB DEFAULT '{"messagesProcessed": 0, "customersDiscovered": 0, "startDate": null, "endDate": null, "lastSyncAt": null, "error": null}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_whatsapp_sessions_salesperson UNIQUE (salesperson_id)
);

ALTER TABLE whatsapp_sessions
    ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'Waiting for device pairing',
    ADD COLUMN IF NOT EXISTS sync_progress JSONB DEFAULT '{"messagesProcessed": 0, "customersDiscovered": 0, "startDate": null, "endDate": null, "lastSyncAt": null, "error": null}'::jsonb;

-- Indices for sessions
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON whatsapp_sessions(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_salesperson ON whatsapp_sessions(salesperson_id);

-- Trigger for whatsapp_sessions updated_at
DROP TRIGGER IF EXISTS trg_whatsapp_sessions_updated_at ON whatsapp_sessions;
CREATE TRIGGER trg_whatsapp_sessions_updated_at
BEFORE UPDATE ON whatsapp_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ==========================================
-- 4. Customers Table (Phase 5)
-- ==========================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salesperson_id UUID NOT NULL REFERENCES salespersons(id) ON DELETE CASCADE,
    whatsapp_id VARCHAR(100) NOT NULL,
    phone_number VARCHAR(30),
    display_name VARCHAR(255),
    contact_type VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (contact_type IN ('individual', 'group')),
    group_subject VARCHAR(255),
    lid_jid VARCHAR(100),
    profile_picture_url TEXT,
    last_contact_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customers_salesperson_whatsapp UNIQUE (salesperson_id, whatsapp_id)
);

ALTER TABLE customers 
    ADD COLUMN IF NOT EXISTS contact_type VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (contact_type IN ('individual', 'group')),
    ADD COLUMN IF NOT EXISTS group_subject VARCHAR(255),
    ADD COLUMN IF NOT EXISTS last_contact_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS lid_jid VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_customers_salesperson_id ON customers(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_whatsapp ON customers(whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_customers_contact_type ON customers(salesperson_id, contact_type);
CREATE INDEX IF NOT EXISTS idx_customers_lid_jid ON customers(salesperson_id, lid_jid);
CREATE INDEX IF NOT EXISTS idx_customers_salesperson_created ON customers(salesperson_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 5. Conversations Table (Phase 5)
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

CREATE INDEX IF NOT EXISTS idx_conversations_salesperson ON conversations(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(salesperson_id, last_message_at DESC NULLS LAST);

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 6. Media Attachments Table (Phase 5)
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
-- 7. Messages Table (Phase 5)
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
    participant_jid VARCHAR(100),
    participant_name VARCHAR(100),
    message_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_messages_salesperson_whatsapp_msg UNIQUE (salesperson_id, whatsapp_message_id)
);

ALTER TABLE messages 
    ADD COLUMN IF NOT EXISTS participant_jid VARCHAR(100),
    ADD COLUMN IF NOT EXISTS participant_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, message_timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_messages_conv_ts ON messages(conversation_id, message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_salesperson_customer ON messages(salesperson_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_salesperson_ts ON messages(salesperson_id, message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_participant ON messages(conversation_id, participant_jid);

-- ==========================================
-- 8. WhatsApp LID Mappings Table (Phase 11)
-- ==========================================
CREATE TABLE IF NOT EXISTS lid_mappings (
    salesperson_id UUID NOT NULL REFERENCES salespersons(id) ON DELETE CASCADE,
    lid_jid VARCHAR(100) NOT NULL,
    phone_jid VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (salesperson_id, lid_jid)
);

CREATE INDEX IF NOT EXISTS idx_lid_mappings_phone ON lid_mappings(salesperson_id, phone_jid);
