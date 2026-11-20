/**
 * Automated Verification Test Suite for WhatsApp Monitor (Phase 1)
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

async function runTests() {
  console.log('--- Starting Phase 1 Backend Verification Suite ---');
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
    // 1. Health check
    const healthRes = await makeRequest(server, { path: '/api/health', method: 'GET' });
    assert('GET /api/health returns 200', healthRes.status === 200);
    assert('Health returns status ok', healthRes.body?.status === 'ok');

    // 2. Login validation failure
    const emptyLoginRes = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {});
    assert('POST /api/auth/login with empty body returns 400', emptyLoginRes.status === 400);

    // 3. Login invalid credentials
    const badLoginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { username: 'admin', password: 'WrongPassword123' }
    );
    assert('POST /api/auth/login with invalid password returns 401', badLoginRes.status === 401);

    // 4. Login successful with seeded credentials
    const goodLoginRes = await makeRequest(
      server,
      { path: '/api/auth/login', method: 'POST' },
      { username: config.adminSeed.username, password: config.adminSeed.password }
    );
    assert('POST /api/auth/login with valid credentials returns 200', goodLoginRes.status === 200);
    assert('Login response returns JWT token', typeof goodLoginRes.body?.token === 'string');
    assert('Login response returns user info without password hash', goodLoginRes.body?.user && !goodLoginRes.body?.user.password_hash);

    const token = goodLoginRes.body?.token;

    // 5. Protected route without token
    const noTokenRes = await makeRequest(server, { path: '/api/auth/me', method: 'GET' });
    assert('GET /api/auth/me without token returns 401', noTokenRes.status === 401);

    // 6. Protected route with valid token
    const authMeRes = await makeRequest(
      server,
      {
        path: '/api/auth/me',
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert('GET /api/auth/me with valid Bearer token returns 200', authMeRes.status === 200);
    assert('Auth me profile contains username', authMeRes.body?.user?.username === config.adminSeed.username);

    // 7. Dashboard overview metrics
    const dashRes = await makeRequest(
      server,
      {
        path: '/api/dashboard/overview',
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert('GET /api/dashboard/overview returns 200', dashRes.status === 200);
    assert('Dashboard overview returns database-driven stats', Boolean(dashRes.body?.data?.overview));
    assert('Dashboard has totalSalespersons', typeof dashRes.body?.data?.overview?.totalSalespersons?.value === 'number');
    assert('Dashboard has connectedAccounts', typeof dashRes.body?.data?.overview?.connectedAccounts?.value === 'number');
    assert('Dashboard has totalCustomers', typeof dashRes.body?.data?.overview?.totalCustomers?.value === 'number');
    assert('Dashboard has totalConversations', typeof dashRes.body?.data?.overview?.totalConversations?.value === 'number');

    // 8. Logout endpoint
    const logoutRes = await makeRequest(
      server,
      {
        path: '/api/auth/logout',
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert('POST /api/auth/logout returns 200', logoutRes.status === 200);

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
    console.log(`--- Test Results: ${passed} Passed, ${failed} Failed ---`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();

