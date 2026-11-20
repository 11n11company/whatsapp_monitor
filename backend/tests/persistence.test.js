/**
 * Database Persistence Verification Test across server lifecycles
 */
const http = require('http');
const app = require('../src/app');
const config = require('../src/config/env');
const db = require('../src/config/db');

function makeRequest(port, options, postData) {
  return new Promise((resolve, reject) => {
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

async function testPersistence() {
  console.log('--- Testing Persistence Across Server Restarts ---');
  await db.testConnection();

  // 1. Start Server Instance #1
  const server1 = app.listen(0);
  const port1 = server1.address().port;

  const loginRes = await makeRequest(port1, { path: '/api/auth/login', method: 'POST' }, {
    username: config.adminSeed.username,
    password: config.adminSeed.password,
  });
  const token = loginRes.body?.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  const testPhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
  const addRes = await makeRequest(port1, { path: '/api/salespersons', method: 'POST', headers: authHeaders }, {
    name: 'Persistent Agent',
    phone_number: testPhone,
    email: 'persistent@example.com',
  });

  const createdId = addRes.body?.data?.id;
  console.log(`  [Instance 1] Created salesperson ID: ${createdId} with phone: ${testPhone}`);

  // Shutdown Server Instance #1
  await new Promise((resolve) => server1.close(resolve));
  console.log('  [Instance 1] Closed successfully.');

  // 2. Start Server Instance #2 (Simulating server restart)
  const server2 = app.listen(0);
  const port2 = server2.address().port;
  console.log('  [Instance 2] Spun up new HTTP listener.');

  const fetchRes = await makeRequest(port2, { path: `/api/salespersons/${createdId}`, method: 'GET', headers: authHeaders });

  let passed = true;
  if (fetchRes.status === 200 && fetchRes.body?.data?.id === createdId) {
    console.log('  [PASS] Salesperson persisted and retrieved successfully on new server instance!');
  } else {
    console.error('  [FAIL] Failed to retrieve persisted salesperson on restart');
    passed = false;
  }

  await new Promise((resolve) => server2.close(resolve));

  process.exit(passed ? 0 : 1);
}

testPersistence().catch((err) => {
  console.error(err);
  process.exit(1);
});

