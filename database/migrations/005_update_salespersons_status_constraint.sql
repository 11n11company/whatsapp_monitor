-- WhatsApp Monitor: Phase 8 Migration - Expand salespersons connection_status constraint
-- Target: PostgreSQL 12+

ALTER TABLE salespersons DROP CONSTRAINT IF EXISTS salespersons_connection_status_check;
ALTER TABLE salespersons ADD CONSTRAINT salespersons_connection_status_check 
    CHECK (connection_status IN ('Not Connected', 'Pending', 'Initializing', 'Waiting for QR Scan', 'QR Expired', 'Connecting', 'Connected', 'Disconnected', 'Error'));

