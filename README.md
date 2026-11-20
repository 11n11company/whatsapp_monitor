# WhatsApp Monitor – Enterprise Multi-Salesperson Monitoring

A full-stack WhatsApp monitoring and compliance platform built with React, Vite, Tailwind CSS, Express.js, and PostgreSQL.

---

## 1. Project Overview

**WhatsApp Monitor** enables organizations to monitor salesperson-to-customer interactions on WhatsApp with enterprise-grade access control, audit logging, and supervisory compliance.

### Development Roadmap
- **Phase 1: Project Foundation** *(Completed & Verified)*: Security architecture, single-admin authorization, JWT sessions, Helmet hardening, rate limiting, and PostgreSQL `admin_users`.
- **Phase 2: Salesperson Management** *(Completed & Verified)*: PostgreSQL `salespersons` schema, UUID keys, phone normalization (E.164), duplicate number rejection, soft-deletion/deactivation, connection states, and responsive frontend management console.
- **Phase 3: WhatsApp QR Connection Interface** *(Completed & Verified)*: Modular connection adapter architecture, safe `DemoWhatsAppProvider`, pairing QR code modal, expiration countdown, status polling, disconnect controls, and PostgreSQL `whatsapp_sessions`.
- **Phase 4: Real WhatsApp Business QR Connection** *(Completed & Verified)*: Real QR-based WhatsApp Web pairing using `@whiskeysockets/baileys`, AES-256-GCM encrypted session credentials at rest, independent multi-agent WhatsApp sessions, exponential backoff reconnection, incoming/outgoing message ingestion handler, and strictly read-only supervisory constraints.
- **Phase 5: Customer Management & WhatsApp Message Storage** *(Completed & Verified)*: Scoped customer discovery per salesperson, conversation thread tracking, idempotent message storage (incoming & outgoing), private media storage preparation, customer & conversation REST APIs, and read-only supervisory audit feeds.
- **Phase 6: Admin WhatsApp Chat Viewer** *(Completed & Verified)*: Professional 3-section layout (salesperson & thread selector, chronological message stream with incoming/outgoing styling & date separators, right-hand customer metadata and media gallery), customer isolation on salesperson switch, message pagination ("Load older messages"), authenticated media streaming with lightbox viewer (image, HTML5 video player, audio player, document download), cross-salesperson security guard (`CROSS_SALESPERSON_FORBIDDEN`), real-time Server-Sent Events (SSE) live-stream, and 100% strict read-only enforcement.
- **Phase 7: Real-time Reliability and WhatsApp Media Integration** *(Completed & Verified)*: Backend restart session recovery (`recoverSessions`), short-lived scoped media access tickets (`createMediaTicket`, `verifyMediaTicket`), SSE auto-reconnect with `retry: 3000` and heartbeats, client leak prevention, message deduplication cache, database retry resilience (`persistMessageWithRetry`), 100MB file limit & strict MIME allowlist, path traversal mitigation, and concurrent 5+ salesperson session independence.
- **Phase 8: Production Readiness, Real WhatsApp Testing & Security Audit** *(Completed & Verified)*: Real PostgreSQL connectivity verification with check constraint expansion (`005_update_salespersons_status_constraint.sql`), production fail-safe (in-memory fallback strictly disabled in production), automated production security audit test suite (`productionAudit.test.js`), production CORS enforcement, Content Security Policy media streaming directives, production environment template (`.env.production.example`), secret validators, graceful shutdown lifecycle handling, and complete enterprise deployment guide.
- **Phase 9: One-Salesperson Live Pilot Preparation** *(Completed & Verified)*: Single authorized salesperson pilot workflow hardening, accurate connection state telemetry (no premature "Connected" claims), credential path resolution bugfix (`creds.enc`), seeder password log sanitization, camelCase/snake_case validation tolerance, 45-test pilot verification suite (`pilotVerification.test.js`), and comprehensive human pilot manual checklist.

---

## 2. Technology Stack

### Frontend
- **Framework**: React 18 with Vite
- **Styling**: Tailwind CSS (customized WhatsApp brand palette)
- **Routing**: React Router v6
- **HTTP Client**: Axios (with JWT interceptors)
- **QR Engine**: `qrcode` library for rendering pairing data
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js
- **Web Framework**: Express.js
- **Database**: PostgreSQL with `pg` (node-postgres)
- **Authentication**: JSON Web Tokens (`jsonwebtoken`)
- **Password Security**: `bcryptjs` (10 salt rounds)
- **Validation**: E.164 phone normalization, UUID validators, sanitizers
- **Security & Utilities**: `helmet`, `cors`, `dotenv`, `express-rate-limit`, `morgan`

---

## 3. Project Structure

```text
whatsapp-monitor/
├── .env.example                          # Master environment template
├── .env.production.example               # Production environment template
├── .gitignore                            # Git exclusion rules (node_modules, .env, dist, storage/)
├── README.md                             # Project documentation
│
├── database/                             # PostgreSQL Database & Migrations
│   ├── schema.sql                        # Complete schema (7 tables: admin_users, salespersons, whatsapp_sessions, customers, conversations, media_attachments, messages)
│   ├── seed.sql                          # Default authorized admin seed
│   ├── README.md                         # Database architecture guide (Phase 1-8)
│   └── migrations/
│       ├── 002_create_salespersons.sql       # Phase 2: Salespersons table migration
│       ├── 003_create_whatsapp_sessions.sql  # Phase 3: WhatsApp sessions migration
│       ├── 004_create_customers_conversations_messages.sql # Phase 5: Customers, conversations, media & messages migration
│       └── 005_update_salespersons_status_constraint.sql   # Phase 8: Expanded connection_status constraint
│
├── backend/                              # Independent Express.js REST API
│   ├── .env.example                      # Backend environment template
│   ├── .env.production.example           # Backend production environment template
│   ├── .env                              # Local dev environment
│   ├── package.json                      # Backend dependencies & test scripts
│   ├── storage/                          # Local encrypted session storage (Git ignored)
│   │   ├── media/                        # On-demand media attachments
│   │   └── sessions/                     # AES-256-GCM encrypted credentials per rep
│   ├── tests/
│   │   ├── auth.test.js                  # Phase 1: 17 authentication & health tests
│   │   ├── salespersons.test.js          # Phase 2: 25 salesperson CRUD & security tests
│   │   ├── persistence.test.js           # Server lifecycle & persistence test
│   │   ├── whatsapp.test.js              # Phase 3: 29 QR connection & demo tests
│   │   ├── baileys.test.js               # Phase 4: 38 real Baileys, crypto & multi-rep tests
│   │   ├── messages.test.js              # Phase 5: 58 customer, conversation, media & message tests
│   │   ├── chatViewer.test.js            # Phase 6: 75 chat viewer, SSE, media streaming & isolation tests
│   │   ├── reliability.test.js           # Phase 7: 49 real-time reliability, media security & recovery tests
│   │   ├── productionAudit.test.js       # Phase 8: 37 production readiness, PostgreSQL & security audit tests
│   │   └── pilotVerification.test.js     # Phase 9: 45 one-salesperson pilot verification tests
│   └── src/
│       ├── config/
│       │   ├── env.js                    # Validated environment configuration (AES keys)
│       │   └── db.js                     # PostgreSQL pool & resilient query layer
│       ├── controllers/
│       │   ├── authController.js         # Login, /me, and logout
│       │   ├── dashboardController.js    # Overview metrics with live salesperson counts
│       │   ├── salespersonController.js  # Salesperson CRUD & soft-delete controllers
│       │   ├── whatsappController.js     # WhatsApp QR & connection lifecycle endpoints
│       │   ├── customerController.js     # Phase 5 & 6: Customer queries & cross-rep ownership
│       │   ├── conversationController.js # Phase 5 & 6: Paginated chronological messages
│       │   └── mediaController.js        # Phase 5 & 6: Private authenticated media streaming (Range support)
│       ├── middleware/
│       │   ├── authMiddleware.js         # JWT verification & admin guard (header & query support)
│       │   ├── errorHandler.js           # 404 & centralized error handler
│       │   ├── validateMiddleware.js     # Login payload validation
│       │   ├── validateSalesperson.js    # Salesperson input validation
│       │   └── validateUUID.js           # Route UUID format validation
│       ├── models/
│       │   ├── adminUserModel.js         # Parameterized admin SQL operations
│       │   ├── salespersonModel.js       # Parameterized salespersons SQL operations
│       │   ├── whatsappSessionModel.js   # Parameterized session & QR metadata operations
│       │   ├── customerModel.js          # Parameterized customer SQL operations
│       │   ├── conversationModel.js      # Parameterized conversation SQL operations
│       │   ├── messageModel.js           # Parameterized message SQL operations
│       │   └── mediaModel.js             # Parameterized media metadata SQL operations
│       ├── routes/
│       │   ├── authRoutes.js             # /api/auth endpoints
│       │   ├── dashboardRoutes.js        # /api/dashboard endpoints
│       │   ├── healthRoutes.js           # /api/health endpoint
│       │   ├── salespersonRoutes.js      # /api/salespersons CRUD endpoints
│       │   ├── whatsappRoutes.js         # /api/whatsapp connection & SSE live-stream
│       │   ├── customerRoutes.js         # /api/customers endpoints
│       │   ├── conversationRoutes.js     # /api/conversations endpoints
│       │   └── mediaRoutes.js            # /api/media private streaming endpoints
│       ├── services/
│       │   ├── whatsapp/
│       │   │   ├── WhatsAppProvider.js        # Base provider interface
│       │   │   ├── BaileysWhatsAppProvider.js # Phase 4: Real WhatsApp Web provider
│       │   │   ├── sessionCrypto.js           # Phase 4: AES-256-GCM authenticated encryption
│       │   │   ├── encryptedAuthState.js      # Phase 4: Multi-file encrypted credentials
│       │   │   ├── MessageHandler.js          # Phase 4: Read-only incoming/outgoing message ingestion
│       │   │   ├── DemoWhatsAppProvider.js    # Safe evaluation adapter (isDemo: true)
│       │   │   ├── ConnectionManager.js       # Multi-agent session orchestrator
│       │   │   └── README.md                  # Provider guide, crypto & risk disclosure
│       │   └── media/
│       │       └── mediaService.js            # Private disk media storage & streaming
│       ├── utils/
│       │   └── phoneUtils.js             # E.164 normalization & validation
│       ├── scripts/
│       │   ├── migrate.js                # Schema migration runner
│       │   └── seed.js                   # Seed runner for initial admin
│       ├── app.js                        # Express app setup (Helmet, CORS)
│       └── server.js                     # HTTP server startup & graceful shutdown
│
└── frontend/                             # React + Vite Single Page Application
    ├── .env.example                      # Frontend environment template
    ├── .env                              # Frontend local configuration
    ├── package.json                      # Frontend dependencies & scripts
    ├── index.html                        # Application entry point
    ├── vite.config.js                    # Vite setup with /api proxy
    ├── tailwind.config.js                # Custom WhatsApp theme configuration
    ├── postcss.config.js                 # PostCSS configuration
    └── src/
        ├── App.jsx                       # Root application router
        ├── main.jsx                      # React DOM bootstrap
        ├── index.css                     # Tailwind base & custom styles
        ├── context/
        │   └── AuthContext.jsx           # Global authentication provider
        ├── services/
        │   └── api.js                    # Axios API service (auth, salespersons, whatsapp, media)
        ├── components/
        │   ├── common/
        │   │   ├── ProtectedRoute.jsx    # Session verification & route guard
        │   │   ├── StatCard.jsx          # Metrics card with DEMO badge
        │   │   └── DemoBadge.jsx         # Visual demo indicator pill
        │   ├── layout/
        │   │   ├── DashboardLayout.jsx   # Top header, health indicator, outlet
        │   │   └── Sidebar.jsx           # WhatsApp-styled navigation
        │   ├── salespersons/
        │   │   ├── ConnectionStatusBadge.jsx  # Status badge component
        │   │   ├── SalespersonModal.jsx       # Add/Edit salesperson modal
        │   │   ├── DeactivateConfirmModal.jsx # Deactivation confirmation modal
        │   │   └── WhatsAppConnectModal.jsx   # Phase 3: WhatsApp QR connection modal
        │   └── chat/
        │       ├── MessageBubble.jsx          # Phase 6: WhatsApp-styled message bubble
        │       └── MediaViewerModal.jsx       # Phase 6: Private media lightbox (img, video, audio, doc)
        └── pages/
            ├── LoginPage.jsx               # Admin login screen
            ├── DashboardOverviewPage.jsx   # Metrics overview screen
            ├── SalespersonsPage.jsx        # Salesperson management & QR linking console
            ├── CustomersPage.jsx           # Customers directory
            ├── ConversationsPage.jsx       # Phase 6: 3-section read-only WhatsApp chat viewer
            └── SettingsPage.jsx            # Admin credentials & security
```

---

## 4. Default Admin Credentials

> [!IMPORTANT]
> Administrative privileges are restricted to a single authorized administrator account.

- **Username**: `admin`
- **Password**: `Admin@WhatsApp2025!`
- **Role**: `admin`
- **Email**: `admin@whatsappmonitor.local`

*(Configurable via `.env`)*

---

## 5. WhatsApp Connection Architecture (Phase 4: Real Baileys Integration)

### Connection Lifecycle States
1. **`Not Connected`**: Salesperson is registered but pairing has not been initiated.
2. **`Initializing`**: Session initialization request dispatched to provider adapter.
3. **`Waiting for QR Scan`**: Pairing QR code generated and active on screen (60s countdown).
4. **`QR Expired`**: Pairing code exceeded timeout window without being scanned; requires refresh.
5. **`Connecting`**: Handshake detected on phone; awaiting session authorization.
6. **`Connected`**: Device linked (reported strictly when Baileys receives `connection === 'open'`).
7. **`Disconnected`**: Session terminated by admin or disconnected on device.
8. **`Error`**: Provider encounter error.

### Connection API Reference
All endpoints require **Admin Authentication** (`Authorization: Bearer <token>`) and validate the salesperson UUID.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/whatsapp/connect/:salespersonId` | Initiate connection workflow (requires active salesperson) |
| `GET` | `/api/whatsapp/status/:salespersonId` | Query connection state, provider metadata, and timeout |
| `GET` | `/api/whatsapp/qr/:salespersonId` | Fetch current active pairing QR data |
| `POST` | `/api/whatsapp/refresh-qr/:salespersonId` | Regenerate expired QR code |
| `POST` | `/api/whatsapp/disconnect/:salespersonId` | Terminate session and unbind device |

---

## 6. Multi-Agent Security, Reconnection & Message Ingestion

### Cryptographic Storage Security at Rest
- Credentials for each salesperson are persisted separately under `backend/storage/sessions/<salespersonId>/`.
- Session credentials are encrypted at rest using **AES-256-GCM** authenticated encryption with a 12-byte initialization vector and 16-byte authentication tag per file.
- The master key is loaded strictly from the `SESSION_ENCRYPTION_KEY` environment variable (32-byte hex/passphrase) and is never hardcoded.
- Credentials and private keys are never exposed in API responses, logs, or commits.
- When an admin clicks Disconnect, session files on disk are completely and securely unlinked.

### Multi-Agent Independent Sessions
- Supports simultaneous, independent WhatsApp connections for multiple sales representatives.
- Each salesperson possesses an independent Baileys socket, dedicated auth directory, and separate connection lifecycle state.
- Verified in automated tests with 5 simultaneous active salesperson connections running concurrently without cross-talk or interference.

### Connection Resiliency & Reconnection Logic
- Socket closures are analyzed using Baileys Boom error status codes.
- Logouts (`401 Disconnected`) immediately transition the session to `Disconnected` and securely purge credentials.
- Temporary network disconnects (e.g. `515 Restart Required`, network drops) trigger automatic reconnection using **exponential backoff** (max 5 retries: 2s, 4s, 8s, 16s, 32s).
- Infinite reconnection loops are strictly prevented.

### Strictly Read-Only Admin Monitoring
- WhatsApp Monitor is designed strictly for supervisory audit and compliance.
- No endpoints or socket methods exist for sending, editing, deleting, or forwarding WhatsApp messages.
- An incoming/outgoing message ingestion handler (`MessageHandler.js`) listens to Baileys `messages.upsert` events:
  - Rep messages (`isFromMe = true`) and customer messages (`isFromMe = false`) are accurately classified.
  - Normalized payload extracts timestamp, JID, conversation text, and media captions for Phase 5 audit viewing.

### Switching Active Providers
Set in `backend/.env`:
```env
# Real WhatsApp Web Provider (Default for Phase 4)
WHATSAPP_PROVIDER=baileys
SESSION_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Or switch to Safe Demo Provider for simulated environments
# WHATSAPP_PROVIDER=demo
```

### Unofficial QR-Based Libraries Risk Disclosure
Unofficial reverse-engineered libraries (e.g. Baileys, whatsapp-web.js) pose inherent operational risks:
1. **Meta Account Bans**: Violates Meta Terms of Service; automated usage risks permanent number bans.
2. **Protocol Breaking**: WhatsApp Web protocol updates can disrupt unofficial libraries unexpectedly.
3. **Session Revocation**: Meta routinely de-authenticates unofficial sessions during security audits.

*For production compliance, an official WhatsApp Business Cloud API integration is recommended.*


---

## 7. Customer & Conversation APIs (Phase 5)

All endpoints require **Admin Authentication** (`Authorization: Bearer <token>`).

### Customer Management Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/salespersons/:salespersonId/customers` | List paginated customers for a salesperson (supports `?search=`, `?page=`, `?limit=`) |
| `GET` | `/api/customers/:customerId` | Fetch customer profile, phone number, and assigned salesperson details |
| `GET` | `/api/customers/:customerId/conversations` | List conversation threads associated with this customer |

### Conversation History & Message Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/salespersons/:salespersonId/customers/:customerId/conversation` | Securely fetch conversation thread with strict salesperson-customer ownership verification |
| `GET` | `/api/conversations/:conversationId/messages` | Fetch chronologically ordered messages (`?page=`, `?limit=`, `?salespersonId=`) |
| `GET` | `/api/media/:mediaId` | Stream private media attachment with Range request support (header or `?token=`) |
| `GET` | `/api/whatsapp/live-stream` | Real-time Server-Sent Events (SSE) stream for instant incoming message broadcast |

---

## 8. Admin WhatsApp Chat Viewer Architecture (Phase 6)

### Professional Three-Section Layout
1. **Left Section (Salesperson & Thread Navigation)**:
   - Salesperson selector dropdown showing name and active WhatsApp phone number.
   - Live search input filtering customer threads by name or phone number.
   - Customer conversation list showing name, phone number, last message snippet, last active time, and thread count.
   - Clear visual selection indicator highlighting active conversation.
2. **Middle Section (WhatsApp Message Stream)**:
   - Conversation header displaying customer display name, phone number, and assigned representative.
   - Chronological message history with smart auto-scroll management.
   - "Load older messages" pagination button preserving chronological scroll positions.
   - WhatsApp-styled message bubbles:
     - **Incoming** (white `#FFFFFF`, left-aligned): customer messages.
     - **Outgoing** (WhatsApp green `#D9FDD3`, right-aligned): monitored salesperson messages.
   - Formatted timestamps, WhatsApp double-check delivery indicators, and date separators (`Today`, `Yesterday`, or formatted date).
   - Strict read-only supervisory footer reminding the administrator of compliance observation mode.
3. **Right Section (Customer Details & Media Gallery)**:
   - Customer profile card with WhatsApp JID and first contact date.
   - Assigned salesperson card with contact information.
   - Shared attachments gallery indexing documents, images, and audio clips shared in the conversation with one-click lightbox preview.

### Strict Salesperson Switching & Multi-Tenancy Isolation
- When the administrator selects a different salesperson from the dropdown:
  1. The previously selected customer is immediately cleared.
  2. The message stream is emptied.
  3. The customer list is re-fetched strictly for the newly selected salesperson.
- **Cross-Salesperson Security Barrier**:
  Attempting to load a customer or conversation belonging to Salesperson A while specifying Salesperson B in the URL or query parameters immediately triggers HTTP `403 Forbidden` with error code `CROSS_SALESPERSON_FORBIDDEN`.

### Private Media Lightbox
- Authenticated media viewer modal supporting:
  - High-resolution image preview lightbox with zoom.
  - HTML5 video player with seek controls and range streaming.
  - Native audio player for voice notes and audio clips.
  - Secure document download trigger.
- Zero public URLs; all streams require administrator JWT authentication.

### Real-time Live Updates via Server-Sent Events (SSE)
- Frontend establishes an SSE connection to `GET /api/whatsapp/live-stream?ticket=<ticket>`.
- When Baileys ingests an incoming or outgoing message, `MessageHandler` emits `message:persisted` over the event bus.
- The SSE stream pushes the new message payload to the admin browser, updating thread previews and appending new bubbles live without disrupting scroll position.

---

## 9. Real-Time Reliability, Media Integration & Session Recovery (Phase 7)

### Multi-Session Startup Recovery
- On backend bootstrap, `ConnectionManager.recoverSessions()` queries all active sessions from PostgreSQL.
- Sockets are safely restored using stored AES-256-GCM encrypted credentials on disk.
- Corrupted credentials or deleted session files are handled gracefully without crashing the server.
- Duplicate socket creation is strictly prevented if an active socket already exists in memory.
- Tested and verified with 5 simultaneous mock salesperson sessions.

### Scoped Media & Stream Access Tokens (Zero Token Leakage in URLs)
- Long-lived administrative JWTs are **never exposed in query strings**.
- To stream media or connect to SSE, frontend requests short-lived, narrowly scoped tickets:
  - `POST /api/media/:mediaId/ticket`: Issues 5-minute single-media scoped ticket (`scope: 'media_stream'`).
  - `POST /api/whatsapp/live-stream/ticket`: Issues 2-minute stream connection ticket (`scope: 'sse_stream'`).
- **Ticket Boundary Enforcement**:
  - A media ticket for Media A cannot be used to stream Media B (`403 MEDIA_TICKET_MISMATCH`).
  - Scoped tickets cannot access application REST endpoints (`403 SCOPED_TOKEN_RESTRICTED`).
  - Expired tickets are rejected immediately (`401 MEDIA_TICKET_EXPIRED`).
  - Media streaming operations are logged without exposing any tickets or authentication tokens.

### Media Validation, Deduplication & Storage Guardrails
- **MIME Allowlist**: Strictly validates incoming attachments against permitted media types (JPEG, PNG, WebP, GIF, MP4, QuickTime, WebM, OGG, Opus, MP3, AAC, PDF, Word, Excel, CSV, Plain Text).
- **File Size Ceiling**: Enforces a strict 100MB limit (`104,857,600` bytes). Oversized files are rejected with `FILE_TOO_LARGE`.
- **Deduplication**: Automatically calculates SHA-256 checksums to reuse existing on-disk files, eliminating duplicate storage.
- **Path Traversal Shield**: Strictly verifies all file paths stay within `storage/media/` and rejects directory traversal attempts (`../../`).

### Real-Time Ingestion Resilience & Database Retries
- **Deduplication Memory Cache**: Tracks recent `salespersonId:messageId` keys to safely discard duplicate WhatsApp events.
- **Transient Error Retry**: `MessageHandler.persistMessageWithRetry` automatically retries database operations up to 3 times with exponential backoff.
- **Missing Payload Safety**: Handles empty or unexpected message structures gracefully with `[Empty message]` placeholders without throwing uncaught exceptions.
- **SSE Auto-Reconnection & Leak Guard**: Sends `retry: 3000` to browser `EventSource`, dispatches `: heartbeat\n\n` comments every 15s, and cleans up event listeners on client disconnect.

---

## 10. How to Run the Project

### Step 1: Database Setup (PostgreSQL)
Apply migrations from the `backend/` directory:
```powershell
cd d:\11n11company\whatsapp-monitor\backend

# Run migrations (creates admin_users, salespersons, and whatsapp_sessions tables)
npm run migrate

# Seed the default admin user
npm run seed
```

### Step 2: Start the Backend Server
```powershell
cd d:\11n11company\whatsapp-monitor\backend
npm run dev
```
The API starts on: **`http://localhost:5000`**

### Step 3: Start the Frontend Application
```powershell
cd d:\11n11company\whatsapp-monitor\frontend
npm run dev
```
The application opens on: **`http://localhost:5173`**

---

## 11. Automated Verification Suite

Run all verification tests across Phases 1 through 8 against PostgreSQL:
```powershell
cd d:\11n11company\whatsapp-monitor\backend
npm test
```

### Complete Test Coverage Breakdown:
- **Phase 1 Test Suite (`tests/auth.test.js`)**: 17 passed (health check, admin validation, invalid passwords, JWT issuance, protected routes, logout).
- **Phase 2 Test Suite (`tests/salespersons.test.js`)**: 25 passed (add salesperson, phone normalization, duplicate rejection, get by ID, edit salesperson, search query, soft-deactivation, exclusion of deleted records, invalid UUID rejection).
- **Persistence Suite (`tests/persistence.test.js`)**: 1 passed (persistence verification across server shutdown and restart).
- **Phase 3 Test Suite (`tests/whatsapp.test.js`)**: 29 passed (unauthorized connection requests, invalid UUID rejection, inactive salesperson block, connection initialization, demo provider labeling, QR retrieval, QR refresh, disconnect).
- **Phase 4 Test Suite (`tests/baileys.test.js`)**: 38 passed (AES-256-GCM encryption at rest, creds obfuscation on disk, Baileys event transitions, QR generation, connection open/close, 5 independent salesperson sessions concurrently, message capture normalization, read-only safety, credential protection).
- **Phase 5 Test Suite (`tests/messages.test.js`)**: 58 passed (incoming/outgoing message ingestion, customer discovery, pushName preservation, multi-salesperson customer isolation, duplicate message prevention, customer listing with pagination & search, conversation messages chronologically, media upload & authenticated streaming, read-only mutation blocks).
- **Phase 6 Test Suite (`tests/chatViewer.test.js`)**: 75 passed (salesperson selection, customer isolation on switch, conversation opening, incoming left & outgoing right direction, chronological ASC sorting, pagination without duplicate keys, media streaming & Range requests, cross-salesperson 403 access prevention, UUID 400 validation, 404 non-existent, empty conversations, unsupported message types, real-time SSE live updates, and strict read-only guarantee).
- **Phase 7 Test Suite (`tests/reliability.test.js`)**: 49 passed (SSE auto-reconnect & client cleanup, duplicate event deduplication, 5 simultaneous salesperson sessions, backend restart session recovery, incoming & outgoing SSE live updates, short-lived media tickets, media ticket expiration, scoped ticket boundary restrictions, HTTP Range 206 requests, 100MB file limit, MIME allowlist, path traversal prevention, database retry resilience, and strict read-only guarantee).
- **Phase 8 Test Suite (`tests/productionAudit.test.js`)**: 37 passed (real PostgreSQL connectivity, 7 tables schema verification, check constraints for all connection statuses, production fail-safe in-memory disablement, production secret validators, AES-256-GCM tamper rejection, Helmet headers & CSP media-src directives, rate-limiting headers, strict read-only 404 checks across write routes, and graceful connection draining).
- **Phase 9 Test Suite (`tests/pilotVerification.test.js`)**: 45 passed (single pilot salesperson lifecycle, Baileys QR generation, zero pre-pairing "Connected" claims, QR refresh, disconnect recovery, incoming/outgoing message ingestion, media ticket streaming, and read-only enforcement).
- **Total: 374 tests passed, 0 failed (100% Pass Rate).**

### Frontend Production Build:
```powershell
cd d:\11n11company\whatsapp-monitor\frontend
npm run build
```
Compiled with 0 errors (1,655 modules transformed into optimized production bundle).

---

## 12. Production Deployment Guide

### System Requirements
- **Node.js**: 18.16.0+ (Tested on Node v24.19.0)
- **PostgreSQL**: 12+ (Tested on PostgreSQL 16)
- **Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 recommended) or Windows Server
- **Reverse Proxy**: NGINX / Caddy with HTTPS (TLS 1.3) and WebSocket/SSE buffering disabled

### PostgreSQL Setup & Configuration
1. **Create Database and Application User**:
   ```sql
   CREATE DATABASE whatsapp_monitor;
   CREATE USER whatsapp_app_user WITH ENCRYPTED PASSWORD 'your_strong_password_here';
   GRANT ALL PRIVILEGES ON DATABASE whatsapp_monitor TO whatsapp_app_user;
   ```
2. **Execute Migrations**:
   ```bash
   cd backend
   npm run migrate
   ```
3. **Execute Seed (First Time Setup)**:
   ```bash
   npm run seed
   ```

4. **Change or Reset Administrator Credentials**:
   ```bash
   # Reset using credentials configured in backend/.env:
   npm run admin:reset

   # Or reset with custom username and password directly:
   node src/scripts/resetAdminPassword.js <username> <new_password>
   ```

5. **Purge Test Data (Optional)**:
   ```bash
   # Truncates all operational test tables and empties storage/ while keeping the admin account
   npm run clean:data
   ```

### PostgreSQL Backup & Restore Procedure
- **Automated Backup (pg_dump)**:
  ```bash
  pg_dump -h <host> -U whatsapp_app_user -d whatsapp_monitor -F c -b -v -f /backups/whatsapp_monitor_$(date +%Y%m%d_%H%M%S).dump
  ```
- **Database Restore (pg_restore)**:
  ```bash
  pg_restore -h <host> -U whatsapp_app_user -d whatsapp_monitor -v -c /backups/whatsapp_monitor_backup.dump
  ```
- **Encrypted WhatsApp Sessions Backup**:
  The `backend/storage/sessions/` directory contains AES-256-GCM encrypted credentials. Back up this directory alongside the matching `SESSION_ENCRYPTION_KEY` environment secret:
  ```bash
  tar -czf /backups/whatsapp_sessions_$(date +%Y%m%d).tar.gz backend/storage/sessions/
  ```

### Production HTTPS & Reverse Proxy (NGINX Example)
Because Server-Sent Events (SSE) and HTTP Range audio/video streaming require persistent streaming without buffering, configure NGINX with:
```nginx
server {
    listen 443 ssl http2;
    server_name whatsapp-monitor.yourcompany.com;

    ssl_certificate /etc/letsencrypt/live/whatsapp-monitor.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/whatsapp-monitor.yourcompany.com/privkey.pem;

    # Frontend Static SPA
    location / {
        root /var/www/whatsapp-monitor/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API & SSE Stream
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for real-time SSE live-stream
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 13. Real WhatsApp Manual Testing Protocol

Follow this exact protocol when testing with a real physical WhatsApp Business device:

### Step-by-Step Pairing Flow
1. **Pre-flight Check**:
   - Ensure `WHATSAPP_PROVIDER=baileys` in `backend/.env`.
   - Start the backend and frontend.
   - Log into the dashboard as administrator (`http://localhost:5173`).
2. **Salesperson Selection**:
   - Navigate to the **Salespersons** tab.
   - Click **Add Salesperson** and enter the salesperson's real name and phone number (E.164 format).
3. **Initiate Pairing**:
   - Click **Connect WhatsApp** for that salesperson.
   - The connection modal opens in `Initializing` state, then displays the real dynamic QR code with a 60-second expiration countdown.
4. **Physical Device Scan**:
   - Open WhatsApp Business on the test smartphone.
   - Tap **Settings** (or three dots) → **Linked Devices** → **Link a Device**.
   - Authenticate device biometrics and scan the QR code on the screen.
5. **Pairing Confirmation**:
   - The UI automatically updates from `Waiting for QR Scan` → `Connecting` → `Connected`.
   - The salesperson's status badge in the dashboard turns green (`Connected`).
6. **QR Expiry & Refresh Test**:
   - On a separate test salesperson, click **Connect WhatsApp** and intentionally wait 60 seconds without scanning.
   - Confirm status changes to `QR Expired` with a clear message and a clickable **Refresh QR** button.
   - Click **Refresh QR** and confirm a new valid QR code is generated.
7. **Disconnection Test**:
   - In the modal or salesperson row, click **Disconnect**.
   - Confirm the status transitions to `Disconnected` and the socket is closed cleanly.
8. **Server Restart Recovery Test**:
   - While a salesperson is `Connected`, restart the backend service (`Ctrl+C`, then `npm start`).
   - Check backend logs: `[Baileys][<Rep Name>] Session recovered successfully from stored credentials.`
   - Refresh the admin dashboard: verify the salesperson automatically displays `Connected` without requiring a new QR scan.

### Real Message & Media Verification Checklist
With the salesperson account linked:
- [ ] **Customer Ingestion**: Have an external phone send a WhatsApp text message to the salesperson. Verify that the new customer appears in the customer roster and the message text appears on the left (white/gray bubble).
- [ ] **Salesperson Outgoing**: Send a reply from the physical salesperson phone. Verify that the message appears live on the right (green bubble) without page refresh.
- [ ] **Image Attachment**: Send an image in the chat. Click the image in the admin chat viewer; verify it displays clearly in the lightbox modal.
- [ ] **Video Attachment**: Send an MP4 video. Verify the HTML5 video player streams the video and supports seeking (HTTP Range requests).
- [ ] **Voice Note / Audio**: Send an audio message. Verify the built-in audio player plays the clip.
- [ ] **PDF Document**: Send a PDF. Verify the document download/view button opens the document securely using a scoped ticket.

---

## 14. Unofficial Baileys Linked-Device Approach: Risks & Limitations

Organizations deploying this solution must understand the technical characteristics and operating constraints of the unofficial WhatsApp Web multi-device protocol:

1. **Strict Read-Only Enforcement**:
   - The WhatsApp Monitor platform is exclusively a compliance and monitoring interface.
   - There are **no capabilities to compose, send, reply to, edit, delete, or forward messages**.
2. **14-Day Inactivity Device Unlinking**:
   - Under WhatsApp's standard multi-device protocol, if the primary mobile phone remains disconnected from the internet for more than 14 consecutive days, WhatsApp automatically revokes all linked device sessions. When this occurs, a fresh QR scan is required.
3. **Primary Phone Dependent Operations**:
   - The primary phone must remain in good standing and maintain periodic internet access.
4. **Historical Message Sync Scope**:
   - Baileys captures all live real-time incoming and outgoing traffic from the moment of connection onward.
   - Syncing pre-existing historical conversations from months or years past depends on the amount of history WhatsApp Web pushes during initial device bootstrap and is not guaranteed for arbitrary deep archives.
5. **Protocol Version Updates**:
   - WhatsApp periodically updates its Web client handshake protocols. Running in production requires maintaining `@whiskeysockets/baileys` up to date to prevent pairing disruptions.
#   w h a t s a p p _ m o n i t o r  
 