-- WhatsApp Monitor: Phase 2 Migration - Salespersons Management
-- Target: PostgreSQL 12+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS salespersons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    email VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    connection_status VARCHAR(30) NOT NULL DEFAULT 'Not Connected' 
        CHECK (connection_status IN ('Not Connected', 'Pending', 'Connected', 'Disconnected', 'Error')),
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique index to prevent duplicate active phone numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_salespersons_phone_unique 
    ON salespersons(phone_number) 
    WHERE deleted_at IS NULL;

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_salespersons_name ON salespersons(name);
CREATE INDEX IF NOT EXISTS idx_salespersons_status ON salespersons(is_active, connection_status);

-- Trigger to automatically update updated_at on record update
DROP TRIGGER IF EXISTS trg_salespersons_updated_at ON salespersons;
CREATE TRIGGER trg_salespersons_updated_at
BEFORE UPDATE ON salespersons
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

