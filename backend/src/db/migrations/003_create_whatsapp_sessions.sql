-- WhatsApp Monitor: Phase 3 Migration - WhatsApp Connection Sessions & QR Metadata
-- Target: PostgreSQL 12+

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
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_whatsapp_sessions_salesperson UNIQUE (salesperson_id)
);

-- Index for status filtering and lookup
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON whatsapp_sessions(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_salesperson ON whatsapp_sessions(salesperson_id);

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trg_whatsapp_sessions_updated_at ON whatsapp_sessions;
CREATE TRIGGER trg_whatsapp_sessions_updated_at
BEFORE UPDATE ON whatsapp_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

