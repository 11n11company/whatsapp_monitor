# WhatsApp Connection Provider Architecture (Phase 4: Real Baileys Integration)

This directory houses the replaceable connection adapter architecture and real Baileys WebSocket connection provider for WhatsApp Monitor.

## Architectural Overview

```text
ConnectionManager (Singleton Orchestrator)
        │
        ▼
WhatsAppProvider (Abstract Interface)
        │
        ├── BaileysWhatsAppProvider (Real Provider: Multi-Device WebSocket)
        │       ├── sessionCrypto.js (AES-256-GCM Authenticated Encryption)
        │       ├── encryptedAuthState.js (Multi-File Encrypted Auth Storage)
        │       └── MessageHandler.js (Read-Only Event Ingestion & Normalizer)
        │
        └── DemoWhatsAppProvider (Safe Evaluation Adapter for Testing)
```

### Components:
1. **`WhatsAppProvider.js`**: Abstract base class enforcing standard connection lifecycle (`initiateConnection`, `getConnectionStatus`, `getQRCode`, `refreshQRCode`, `disconnect`).
2. **`BaileysWhatsAppProvider.js`**: Production-ready real WhatsApp Web multi-device adapter using `@whiskeysockets/baileys`.
   - Handles real pairing QR generation and updates.
   - Manages independent WebSocket connections per salesperson.
   - Detects connection opening, closure (with exponential backoff reconnection), and user logouts.
   - Synchronizes live connection status with PostgreSQL.
3. **`sessionCrypto.js`**: Cryptographic module enforcing AES-256-GCM authenticated encryption for all WhatsApp session credentials stored on disk.
   - Uses a 32-byte master key loaded from `SESSION_ENCRYPTION_KEY`.
   - Unique 12-byte IV per encrypted item with 16-byte authentication tag.
4. **`encryptedAuthState.js`**: Multi-file auth state adapter for Baileys that automatically encrypts all credentials at rest (`.enc` files in `backend/storage/sessions/<salespersonId>/`).
5. **`MessageHandler.js`**: Purely read-only message capture handler:
   - Subscribes to Baileys `messages.upsert` events.
   - Normalizes messages (extracts text, captions, timestamps, remote JID).
   - Distinguishes outgoing salesperson messages (`isFromMe = true`) from incoming customer messages (`isFromMe = false`).
   - Dispatches normalized events to the internal event bus.
   - **No message sending or mutation methods exist**.
6. **`DemoWhatsAppProvider.js`**: Safe demonstration provider that showcases the connection state machine without connecting to real WhatsApp servers.
7. **`ConnectionManager.js`**: Singleton orchestrator managing multi-agent sessions, selecting providers via `WHATSAPP_PROVIDER` (`baileys` or `demo`), and gracefully shutting down on process exit.

---

## Technical & Account Risk Assessment: Unofficial QR-Based Libraries

> [!CAUTION]
> **CRITICAL COMPLIANCE NOTICE REGARDING UNOFFICIAL LIBRARIES (Baileys, Puppeteer, whatsapp-web.js)**
> 
> Unofficial libraries reverse-engineer the WhatsApp Web WebSocket protocol. Organizations considering these libraries must understand the severe operational and account risks:

1. **Meta Terms of Service Violations & Account Bans**:
   - Meta actively detects and terminates phone numbers running unauthorized automated or headless WhatsApp clients.
   - Using unofficial libraries risks permanent bans for sales representatives' corporate phone numbers.
2. **Protocol Instability**:
   - Meta regularly updates the WhatsApp Web multi-device protocol, encryption handshakes, and cryptographic keys without notice.
   - Reverse-engineered libraries frequently break for days or weeks after upstream updates.
3. **Session Invalidation**:
   - Multi-device sessions established through web reverse-engineering are routinely de-authenticated by Meta after 14 days of phone inactivity or during background integrity audits.
4. **Security & Data Privacy**:
   - Storing session keys locally poses exposure risks. To mitigate this, WhatsApp Monitor encrypts all session files with AES-256-GCM.
5. **No Official Support**:
   - Unofficial libraries offer zero SLAs and are not affiliated with Meta Platforms, Inc.

### Recommended Production Approach:
For enterprise production environments where zero downtime and 100% compliance are mandated, integrating with the **Meta WhatsApp Business Cloud API** or an official Business Solution Provider (BSP) using Webhooks is strongly recommended.

