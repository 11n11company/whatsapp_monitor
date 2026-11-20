/**
 * Automated Verification Test Suite for WhatsApp Monitor (Phase 2: Salespersons Management)
 */
const http = require('http');
const app = require('../src/app');
const config = require('../src/config/env');
const db = require('../src/config/db');

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

async function runPhase2Tests() {
  console.log('--- Starting Phase 2 Salesperson Management Verification Suite ---');
  await db.testConnection();

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
    // 1. Authenticate as Admin to obtain JWT token
    const loginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { username: config.adminSeed.username, password: config.adminSeed.password }
    );
    assert('Admin login succeeds', loginRes.status === 200);
    const token = loginRes.body?.token;
    assert('JWT token acquired', typeof token === 'string');

    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Unauthorized request test
    const unauthRes = await makeRequest(server, { path: '/api/salespersons', method: 'GET' });
    assert('GET /api/salespersons without token returns 401', unauthRes.status === 401);

    const unauthPostRes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST' },
      { name: 'Hacker', phone_number: '+15550009999' }
    );
    assert('POST /api/salespersons without token returns 401', unauthPostRes.status === 401);

    // 3. Validation failure: Invalid phone number format
    const badPhoneRes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST', headers: authHeaders },
      { name: 'Invalid Phone Rep', phone_number: '123' }
    );
    assert('POST /api/salespersons with invalid phone number returns 400', badPhoneRes.status === 400);

    // 4. Validation failure: Missing name
    const badNameRes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST', headers: authHeaders },
      { name: '', phone_number: '+15552349999' }
    );
    assert('POST /api/salespersons with empty name returns 400', badNameRes.status === 400);

    // 5. Add salesperson with normalization
    // Input has formatting: "+1 (555) 901-2345"
    const addRes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST', headers: authHeaders },
      {
        name: 'Jessica Adams',
        phone_number: '+1 (555) 901-2345',
        email: 'jessica.a@company.com',
      }
    );
    assert('POST /api/salespersons returns 201 Created', addRes.status === 201);
    assert('Salesperson created with normalized phone "+15559012345"', addRes.body?.data?.phone_number === '+15559012345');
    assert('Salesperson has valid UUID id', typeof addRes.body?.data?.id === 'string' && addRes.body?.data?.id.length > 20);
    assert('Default connection status is "Not Connected"', addRes.body?.data?.connection_status === 'Not Connected');
    assert('Default is_active is true', addRes.body?.data?.is_active === true);

    const newSalespersonId = addRes.body?.data?.id;

    // 6. Duplicate phone number rejection
    // Try to register another salesperson with the same number in different format: "15559012345"
    const dupRes = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'POST', headers: authHeaders },
      {
        name: 'Duplicate Rep',
        phone_number: '15559012345', // Normalizes to '+15559012345'
        email: 'dup@company.com',
      }
    );
    assert('POST /api/salespersons with duplicate phone returns 409 Conflict', dupRes.status === 409);
    assert('Duplicate error returns DUPLICATE_PHONE_NUMBER code', dupRes.body?.code === 'DUPLICATE_PHONE_NUMBER');

    // 7. Get salesperson by ID
    const getSingleRes = await makeRequest(
      server,
      { path: `/api/salespersons/${newSalespersonId}`, method: 'GET', headers: authHeaders }
    );
    assert('GET /api/salespersons/:id returns 200', getSingleRes.status === 200);
    assert('Fetched record matches created name', getSingleRes.body?.data?.name === 'Jessica Adams');

    // 8. Edit salesperson (Update name, email, and connection_status)
    const updateRes = await makeRequest(
      server,
      { path: `/api/salespersons/${newSalespersonId}`, method: 'PATCH', headers: authHeaders },
      {
        name: 'Jessica Adams-Taylor',
        connection_status: 'Pending',
      }
    );
    assert('PATCH /api/salespersons/:id returns 200', updateRes.status === 200);
    assert('Updated name persists', updateRes.body?.data?.name === 'Jessica Adams-Taylor');
    assert('Updated connection status is "Pending"', updateRes.body?.data?.connection_status === 'Pending');

    // 9. List salespersons with search
    const searchRes = await makeRequest(
      server,
      { path: '/api/salespersons?search=Adams-Taylor', method: 'GET', headers: authHeaders }
    );
    assert('GET /api/salespersons?search=Adams-Taylor returns 200', searchRes.status === 200);
    assert('Search finds updated salesperson', searchRes.body?.data?.some((s) => s.id === newSalespersonId));

    // 10. Deactivate salesperson (Soft deletion)
    const deleteRes = await makeRequest(
      server,
      { path: `/api/salespersons/${newSalespersonId}`, method: 'DELETE', headers: authHeaders }
    );
    assert('DELETE /api/salespersons/:id returns 200', deleteRes.status === 200);
    assert('Deactivated salesperson has is_active = false', deleteRes.body?.data?.is_active === false);
    assert('Deactivated salesperson connection_status = Disconnected', deleteRes.body?.data?.connection_status === 'Disconnected');

    // 11. Verify deactivated salesperson is not returned in active list
    const postDeleteList = await makeRequest(
      server,
      { path: '/api/salespersons', method: 'GET', headers: authHeaders }
    );
    const stillActive = postDeleteList.body?.data?.find((s) => s.id === newSalespersonId);
    assert('Soft-deleted salesperson is excluded from active listings', !stillActive);

    // 12. Invalid UUID parameter format rejection
    const invalidUUIDRes = await makeRequest(
      server,
      { path: '/api/salespersons/not-a-valid-uuid', method: 'GET', headers: authHeaders }
    );
    assert('GET /api/salespersons/invalid-id returns 400', invalidUUIDRes.status === 400);

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
    console.log(`--- Phase 2 Test Results: ${passed} Passed, ${failed} Failed ---`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase2Tests();

