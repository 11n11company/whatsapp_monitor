# WhatsApp Monitor - Database Documentation (Phase 1 through 8)

This directory contains the database schema, migrations, and seed data for the WhatsApp Monitor platform.

## Database Engine
- **Engine**: PostgreSQL 12+ (supports `pgcrypto` / `gen_random_uuid()`)
- **Driver**: `pg` (node-postgres)
- **Tables**: `admin_users`, `salespersons`, `whatsapp_sessions`, `customers`, `conversations`, `media_attachments`, `messages`

---

## Schema Overview

### 1. `admin_users` (Phase 1)
Stores the single authorized administrator account with secure bcrypt-hashed credentials.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Unique identifier |
| `username` | `VARCHAR(50)` | `UNIQUE, NOT NULL` | Login username |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | Bcrypt hashed password (cost factor 10+) |
| `email` | `VARCHAR(100)` | `UNIQUE` | Admin contact email |
| `full_name` | `VARCHAR(100)` | | Display name of the admin |
| `role` | `VARCHAR(20)` | `NOT NULL, DEFAULT 'admin'` | System role (restricted to 'admin') |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` | Active account status |
| `last_login` | `TIMESTAMPTZ` | | Timestamp of last successful login |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Account creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Auto-updated via trigger |

---

### 2. `salespersons` (Phase 2 & Phase 8)
Stores monitored sales agents, their normalized phone numbers, and WhatsApp connection states.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Unique UUID |
| `name` | `VARCHAR(100)` | `NOT NULL` | Salesperson full name |
| `phone_number` | `VARCHAR(30)` | `NOT NULL` | Normalized E.164 phone number (+country code) |
| `email` | `VARCHAR(100)` | | Optional email address |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` | Monitoring active/paused state |
| `connection_status` | `VARCHAR(30)` | `NOT NULL, DEFAULT 'Not Connected'` | Connection status: 'Not Connected', 'Pending', 'Initializing', 'Waiting for QR Scan', 'QR Expired', 'Connecting', 'Connected', 'Disconnected', 'Error' |
| `deleted_at` | `TIMESTAMPTZ` | | Soft deletion timestamp (null for active records) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Registration timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Auto-updated via trigger |

---

### 3. `whatsapp_sessions` (Phase 3 & 4)
Stores connection session metadata, pairing QR code expiration timestamps, and provider information.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Unique session UUID |
| `salesperson_id` | `UUID` | `NOT NULL, UNIQUE, REFERENCES salespersons(id)` | Foreign key to salesperson |
| `status` | `VARCHAR(30)` | `NOT NULL, DEFAULT 'Not Connected'` | Lifecycle status |
| `provider` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'baileys'` | Provider adapter name ('baileys' or 'demo') |
| `is_demo` | `BOOLEAN` | `NOT NULL, DEFAULT FALSE` | Evaluation demo flag |
| `qr_code` | `TEXT` | | Temporary pairing QR string |
| `qr_expires_at` | `TIMESTAMPTZ` | | QR expiration timestamp (60s) |
| `last_connected_at` | `TIMESTAMPTZ` | | Timestamp of device link |
| `last_disconnected_at` | `TIMESTAMPTZ` | | Timestamp of disconnect |
| `error_message` | `TEXT` | | Error details if status = 'Error' |
| `metadata` | `JSONB` | `DEFAULT '{}'::jsonb` | Extensible provider telemetry |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Session creation |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Auto-updated via trigger |

---

### 4. `customers` (Phase 5 & 6)
Stores customer profiles discovered from WhatsApp conversations, scoped per salesperson.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Customer UUID |
| `salesperson_id` | `UUID` | `NOT NULL, REFERENCES salespersons(id)` | Scoped salesperson relationship |
| `whatsapp_id` | `VARCHAR(100)` | `NOT NULL` | WhatsApp identifier (e.g. `phone@s.whatsapp.net`) |
| `phone_number` | `VARCHAR(30)` | | Extracted E.164 phone number |
| `display_name` | `VARCHAR(255)` | | WhatsApp pushName or phone number |
| `profile_picture_url` | `TEXT` | | Optional profile picture |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Customer discovery timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Auto-updated via trigger |

**Constraint**: `UNIQUE (salesperson_id, whatsapp_id)` (A customer contacting multiple salespersons creates separate records scoped to each rep).

---

### 5. `conversations` (Phase 5 & 6)
Stores active conversation threads between a salesperson and a customer.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Conversation UUID |
| `salesperson_id` | `UUID` | `NOT NULL, REFERENCES salespersons(id)` | Salesperson ID |
| `customer_id` | `UUID` | `NOT NULL, REFERENCES customers(id)` | Customer ID |
| `last_message_at` | `TIMESTAMPTZ` | | Timestamp of latest message |
| `last_message_preview` | `TEXT` | | Preview snippet of latest message |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Thread creation |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Auto-updated via trigger |

**Constraint**: `UNIQUE (salesperson_id, customer_id)`.

---

### 6. `media_attachments` (Phase 5 & 6)
Metadata and audit catalog for private media attachments (images, video, audio, documents).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Media attachment UUID |
| `file_name` | `VARCHAR(255)` | `NOT NULL` | Original file name |
| `file_path` | `VARCHAR(500)` | `NOT NULL` | Private disk storage filename |
| `mime_type` | `VARCHAR(100)` | `NOT NULL` | MIME type (e.g. `application/pdf`, `image/jpeg`) |
| `file_size_bytes` | `BIGINT` | `DEFAULT 0` | File size in bytes |
| `checksum` | `VARCHAR(64)` | | SHA-256 hash for deduplication |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Ingestion timestamp |

---

### 7. `messages` (Phase 5 & 6)
Stores individual WhatsApp messages (incoming and outgoing) chronologically.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Message UUID |
| `conversation_id` | `UUID` | `NOT NULL, REFERENCES conversations(id)` | Conversation thread |
| `salesperson_id` | `UUID` | `NOT NULL, REFERENCES salespersons(id)` | Monitored salesperson |
| `customer_id` | `UUID` | `NOT NULL, REFERENCES customers(id)` | Identified customer |
| `whatsapp_message_id` | `VARCHAR(255)` | `NOT NULL` | WhatsApp message ID from Baileys |
| `direction` | `VARCHAR(20)` | `NOT NULL, CHECK (direction IN ('incoming', 'outgoing'))` | Direction of message |
| `message_type` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'text'` | Message type (`text`, `image`, `audio`, etc.) |
| `message_text` | `TEXT` | | Text body or media caption |
| `media_id` | `UUID` | `REFERENCES media_attachments(id)` | Optional media attachment |
| `message_timestamp` | `TIMESTAMPTZ` | `NOT NULL` | WhatsApp message sent timestamp |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Ingestion timestamp |

**Constraint**: `UNIQUE (salesperson_id, whatsapp_message_id)` to prevent duplicate insertions across network retries.

---

## Phase 6 & 7 Query Patterns & Indexing

1. **Active Session Recovery on Startup (Phase 7)**:
   ```sql
   SELECT ws.*, s.name as salesperson_name, s.phone_number as salesperson_phone, s.is_active as salesperson_is_active
   FROM whatsapp_sessions ws
   JOIN salespersons s ON s.id = ws.salesperson_id
   WHERE ws.status IN ('Connected', 'Connecting') 
     AND s.is_active = TRUE 
     AND s.deleted_at IS NULL
   ORDER BY ws.last_connected_at DESC NULLS LAST;
   ```

2. **Media Deduplication Lookup by SHA-256 Checksum (Phase 7)**:
   ```sql
   SELECT id, file_name, file_path, mime_type, file_size_bytes, checksum, created_at
   FROM media_attachments
   WHERE checksum = $1
   LIMIT 1;
   ```
   *Optimized with index*: `CREATE INDEX idx_media_attachments_checksum ON media_attachments(checksum);`

3. **Chronological Message Retrieval & Pagination**:
   ```sql
   SELECT m.*, med.file_name, med.mime_type, med.file_size_bytes
   FROM messages m
   LEFT JOIN media_attachments med ON med.id = m.media_id
   WHERE m.conversation_id = $1
   ORDER BY m.message_timestamp ASC, m.created_at ASC
   LIMIT $2 OFFSET $3;
   ```
   *Optimized with index*: `CREATE INDEX idx_messages_conversation ON messages(conversation_id, message_timestamp ASC);`

4. **Multi-Salesperson Customer Isolation**:
   Strictly verified at application and database level to prevent customer data leaks between representatives.


**Constraint**: `UNIQUE (salesperson_id, customer_id)`.

---

### 6. `media_attachments` (Phase 5)
Prepares metadata for private media attachments (images, video, audio, documents).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Media attachment UUID |
| `file_name` | `VARCHAR(255)` | `NOT NULL` | Original file name |
| `file_path` | `VARCHAR(500)` | `NOT NULL` | Private disk storage filename |
| `mime_type` | `VARCHAR(100)` | `NOT NULL` | MIME type (e.g. `application/pdf`, `image/jpeg`) |
| `file_size_bytes` | `BIGINT` | `DEFAULT 0` | File size in bytes |
| `checksum` | `VARCHAR(64)` | | SHA-256 hash for deduplication |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Ingestion timestamp |

---

### 7. `messages` (Phase 5)
Stores individual WhatsApp messages (incoming and outgoing) chronologically.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Message UUID |
| `conversation_id` | `UUID` | `NOT NULL, REFERENCES conversations(id)` | Conversation thread |
| `salesperson_id` | `UUID` | `NOT NULL, REFERENCES salespersons(id)` | Monitored salesperson |
| `customer_id` | `UUID` | `NOT NULL, REFERENCES customers(id)` | Identified customer |
| `whatsapp_message_id` | `VARCHAR(255)` | `NOT NULL` | WhatsApp message ID from Baileys |
| `direction` | `VARCHAR(20)` | `NOT NULL, CHECK (direction IN ('incoming', 'outgoing'))` | Direction of message |
| `message_type` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'text'` | Message type (`text`, `image`, `audio`, etc.) |
| `message_text` | `TEXT` | | Text body or media caption |
| `media_id` | `UUID` | `REFERENCES media_attachments(id)` | Optional media attachment |
| `message_timestamp` | `TIMESTAMPTZ` | `NOT NULL` | WhatsApp message sent timestamp |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Ingestion timestamp |

**Constraint**: `UNIQUE (salesperson_id, whatsapp_message_id)` to prevent duplicate insertions across network retries.

---

## How to Apply Migrations

### Method 1: Using Backend Migration Runner
From the `backend` folder:
```bash
# Run complete schema migration
npm run migrate

# Seed the default admin user
npm run seed

# Reset or change administrator credentials
npm run admin:reset
# Or with custom credentials:
node src/scripts/resetAdminPassword.js <username> <new_password>

# Purge all test data (truncates operational tables, keeps admin)
npm run clean:data
```

### Method 2: Direct PostgreSQL CLI
```bash
# Complete schema
psql -d whatsapp_monitor -f database/schema.sql

# Or incremental migrations
psql -d whatsapp_monitor -f database/migrations/002_create_salespersons.sql
psql -d whatsapp_monitor -f database/migrations/003_create_whatsapp_sessions.sql
psql -d whatsapp_monitor -f database/migrations/004_create_customers_conversations_messages.sql
psql -d whatsapp_monitor -f database/migrations/005_update_salespersons_status_constraint.sql

# Run seed
psql -d whatsapp_monitor -f database/seed.sql
```
