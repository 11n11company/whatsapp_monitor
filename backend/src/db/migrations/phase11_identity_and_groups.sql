-- Phase 11: WhatsApp Customer Identity Resolution and Real-Time Message Synchronization
-- Target: PostgreSQL 12+

-- 1. Extend customers table for group conversations, LID support, and contact update timestamps
ALTER TABLE customers 
    ADD COLUMN IF NOT EXISTS contact_type VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (contact_type IN ('individual', 'group')),
    ADD COLUMN IF NOT EXISTS group_subject VARCHAR(255),
    ADD COLUMN IF NOT EXISTS last_contact_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS lid_jid VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_customers_contact_type ON customers(salesperson_id, contact_type);
CREATE INDEX IF NOT EXISTS idx_customers_lid_jid ON customers(salesperson_id, lid_jid);

-- 2. Extend messages table with group participant metadata
ALTER TABLE messages 
    ADD COLUMN IF NOT EXISTS participant_jid VARCHAR(100),
    ADD COLUMN IF NOT EXISTS participant_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_messages_participant ON messages(conversation_id, participant_jid);

-- 3. Dedicated LID Mappings table for pairing WhatsApp Privacy LIDs to phone numbers
CREATE TABLE IF NOT EXISTS lid_mappings (
    salesperson_id UUID NOT NULL REFERENCES salespersons(id) ON DELETE CASCADE,
    lid_jid VARCHAR(100) NOT NULL,
    phone_jid VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (salesperson_id, lid_jid)
);

CREATE INDEX IF NOT EXISTS idx_lid_mappings_phone ON lid_mappings(salesperson_id, phone_jid);

-- 4. Clean up any existing dirty records where raw JIDs were saved as display_name
UPDATE customers 
SET display_name = NULL 
WHERE display_name LIKE '%@s.whatsapp.net' 
   OR display_name LIKE '%@g.us' 
   OR display_name LIKE '%@lid'
   OR display_name LIKE '%@c.us';

-- 5. Correctly classify any existing group records
UPDATE customers 
SET contact_type = 'group' 
WHERE whatsapp_id LIKE '%@g.us';

