-- WhatsApp Monitor: Phase 1 Seed Data
-- Authorized Default Admin User

INSERT INTO admin_users (username, password_hash, email, full_name, role, is_active)
VALUES (
    'admin',
    '$2a$10$0G2pW1.nva0iihq6NmYFSOQS5.bABlIPqQB5n94fqTFBBB2ZE03Pu',
    'admin@whatsappmonitor.local',
    'Super Admin',
    'admin',
    true
)
ON CONFLICT (username) DO NOTHING;
