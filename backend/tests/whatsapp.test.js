/**
 * Automated Verification Test Suite for WhatsApp Monitor (Phase 3: QR Connection Interface)
 */
const http = require('http');
const app = require('../src/app');
const config = require('../src/config/env');
const db = require('../src/config/db');
const connectionManager = require('../src/services/whatsapp/ConnectionManager');
const DemoWhatsAppProvider = require('../src/services/whatsapp/DemoWhatsAppProvider');

function makeRequest(server, options, postData) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            json = body;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        });
      }
    );

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runPhase3Tests() {
  console.log('--- Starting Phase 3 WhatsApp QR Connection Interface Verification Suite ---');
  await db.testConnection();

  // Configure ConnectionManager with Demo provider for Phase 3 backward compatibility testing
  connectionManager.setProvider(new DemoWhatsAppProvider());

  const server = app.listen(0);
  let failed = 0;
  let passed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} ${details}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate as Admin to acquire JWT token
    const loginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { username: config.adminSeed.username, password: config.adminSeed.password }
    );
    assert('Admin login succeeds', loginRes.status === 200);
    const token = loginRes.body?.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Create an active salesperson for connection testing
    const uniquePhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
    const addSalespersonRes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST', headers: authHeaders },
      {
        name: 'Carlos Rivera',
        phone_number: uniquePhone,
        email: 'carlos.r@company.com',
      }
    );
    assert('Registered active test salesperson', addSalespersonRes.status === 201);
    const salespersonId = addSalespersonRes.body?.data?.id;

    // 3. Create a deactivated/inactive salesperson
    const inactivePhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
    const addInactiveRes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST', headers: authHeaders },
      {
        name: 'Inactive Rep',
        phone_number: inactivePhone,
      }
    );
    const inactiveId = addInactiveRes.body?.data?.id;
    // Deactivate it
    await makeRequest(
      server,
      { path: `/api/salespersons/${inactiveId}`, method: 'PATCH', headers: authHeaders },
      { is_active: false }
    );

    // 4. Test unauthorized request
    const unauthRes = await makeRequest(
      server,
      { path: `/api/whatsapp/connect/${salespersonId}`, method: 'POST' }
    );
    assert('POST /api/whatsapp/connect without token returns 401', unauthRes.status === 401);

    const unauthStatusRes = await makeRequest(
      server,
      { path: `/api/whatsapp/status/${salespersonId}`, method: 'GET' }
    );
    assert('GET /api/whatsapp/status without token returns 401', unauthStatusRes.status === 401);

    // 5. Test invalid UUID parameter
    const invalidUUIDRes = await makeRequest(
      server,
      { path: '/api/whatsapp/connect/not-a-valid-uuid', method: 'POST', headers: authHeaders }
    );
    assert('POST /api/whatsapp/connect/not-a-valid-uuid returns 400', invalidUUIDRes.status === 400);

    // 6. Test non-existent salesperson ID (valid UUID)
    const randomUUID = '11111111-2222-3333-4444-555555555555';
    const notFoundRes = await makeRequest(
      server,
      { path: `/api/whatsapp/connect/${randomUUID}`, method: 'POST', headers: authHeaders }
    );
    assert('POST /api/whatsapp/connect with non-existent UUID returns 404', notFoundRes.status === 404);

    // 7. Inactive salesperson cannot connect
    const inactiveConnectRes = await makeRequest(
      server,
      { path: `/api/whatsapp/connect/${inactiveId}`, method: 'POST', headers: authHeaders }
    );
    assert('POST /api/whatsapp/connect for inactive salesperson returns 400', inactiveConnectRes.status === 400);
    assert('Error explains inactive status', inactiveConnectRes.body?.message?.includes('inactive'));

    // 8. Connection initialization for active salesperson
    const connectRes = await makeRequest(
      server,
      { path: `/api/whatsapp/connect/${salespersonId}`, method: 'POST', headers: authHeaders }
    );
    assert('POST /api/whatsapp/connect for active salesperson returns 200', connectRes.status === 200);
    assert('Connection status is "Waiting for QR Scan"', connectRes.body?.data?.status === 'Waiting for QR Scan');

    // 9. Demo provider clearly reports DEMO
    assert('Response explicitly flags isDemo = true', connectRes.body?.data?.isDemo === true);
    assert('Response explicitly names provider = "demo"', connectRes.body?.data?.provider === 'demo');
    assert('Response indicates isRealConnection = false', connectRes.body?.data?.isRealConnection === false);
    assert('Response contains QR code payload', typeof connectRes.body?.data?.qrCode === 'string');
    assert('Response contains QR expiration timestamp', typeof connectRes.body?.data?.qrExpiresAt === 'string');

    // 10. Status retrieval endpoint
    const statusRes = await makeRequest(
      server,
      { path: `/api/whatsapp/status/${salespersonId}`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/whatsapp/status returns 200', statusRes.status === 200);
    assert('Status matches "Waiting for QR Scan"', statusRes.body?.data?.status === 'Waiting for QR Scan');
    assert('Status includes salesperson name and phone', statusRes.body?.data?.salespersonName === 'Carlos Rivera');
    assert('Status reports supportsQRRefresh = true', statusRes.body?.data?.supportsQRRefresh === true);

    // 11. QR Code retrieval endpoint
    const qrRes = await makeRequest(
      server,
      { path: `/api/whatsapp/qr/${salespersonId}`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/whatsapp/qr returns 200', qrRes.status === 200);
    assert('QR endpoint returns QR string', typeof qrRes.body?.data?.qrCode === 'string');
    assert('QR endpoint returns isExpired = false', qrRes.body?.data?.isExpired === false);

    // 12. Refresh QR code endpoint
    const refreshRes = await makeRequest(
      server,
      { path: `/api/whatsapp/refresh-qr/${salespersonId}`, method: 'POST', headers: authHeaders }
    );
    assert('POST /api/whatsapp/refresh-qr returns 200', refreshRes.status === 200);
    assert('Refreshed QR code contains new timestamp', typeof refreshRes.body?.data?.qrCode === 'string');
    assert('Refreshed QR maintains "Waiting for QR Scan" status', refreshRes.body?.data?.status === 'Waiting for QR Scan');

    // 13. Disconnect operation
    const disconnectRes = await makeRequest(
      server,
      { path: `/api/whatsapp/disconnect/${salespersonId}`, method: 'POST', headers: authHeaders }
    );
    assert('POST /api/whatsapp/disconnect returns 200', disconnectRes.status === 200);
    assert('Status after disconnect is "Disconnected"', disconnectRes.body?.data?.status === 'Disconnected');

    // 14. Verify status after disconnect
    const postDiscStatus = await makeRequest(
      server,
      { path: `/api/whatsapp/status/${salespersonId}`, method: 'GET', headers: authHeaders }
    );
    assert('Post-disconnect status is "Disconnected" or "Not Connected"', ['Disconnected', 'Not Connected'].includes(postDiscStatus.body?.data?.status));
    assert('Post-disconnect QR code is cleared (null)', postDiscStatus.body?.data?.qrCode === null);

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
    console.log(`--- Phase 3 Test Results: ${passed} Passed, ${failed} Failed ---`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase3Tests();

