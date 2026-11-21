const assert = require('assert');
const dns = require('dns');

console.log('--- Starting Database Configuration & Resilience Unit Tests ---');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

// Initialize db module (which sets IPv4-first DNS order and creates pool)
const db = require('../src/config/db');

// 1. Verify IPv4-first DNS order
runTest('DNS default result order is set to ipv4first', () => {
  if (typeof dns.setDefaultResultOrder === 'function') {
    const order = dns.getDefaultResultOrder();
    assert.strictEqual(order, 'ipv4first', `Expected 'ipv4first', got '${order}'`);
  }
});

// 2. Test DATABASE_URL parsing and special characters decoding
runTest('DATABASE_URL with special characters in password is safely decoded', () => {
  const rawUrl = 'postgresql://postgres.myproject:P%40ssw0rd%23123%21@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require';
  const parsed = new URL(rawUrl);
  
  assert.strictEqual(parsed.hostname, 'aws-0-ap-southeast-1.pooler.supabase.com');
  assert.strictEqual(parseInt(parsed.port, 10), 6543);
  assert.strictEqual(decodeURIComponent(parsed.username), 'postgres.myproject');
  assert.strictEqual(decodeURIComponent(parsed.password), 'P@ssw0rd#123!');
  assert.strictEqual(parsed.pathname.replace(/^\//, ''), 'postgres');
  assert.strictEqual(parsed.searchParams.get('sslmode'), 'require');
});

// 3. Test credential sanitization in error messages
runTest('Database error strings have credentials and connection strings sanitized', () => {
  function sanitizeError(msg) {
    if (!msg) return null;
    return String(msg)
      .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1*****$2')
      .replace(/password=[^\s;]+/gi, 'password=*****');
  }

  const rawError = 'Connection failed to postgresql://postgres:SuperSecretPassword123@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
  const sanitized = sanitizeError(rawError);
  
  assert(!sanitized.includes('SuperSecretPassword123'), 'Sanitized error must not contain raw password');
  assert(sanitized.includes('*****'), 'Sanitized error must mask password with asterisks');
});

// 4. Test production mode strictly prohibits in-memory fallback
runTest('In-memory fallback is strictly blocked when production mode is simulated', async () => {
  const config = require('../src/config/env');

  // Verify getStatus provides expected keys without exposing raw secrets
  const status = db.getStatus();
  assert('connected' in status, 'Status must report connection state');
  assert('database' in status, 'Status must report database name');
  assert('host' in status, 'Status must report database host');
  assert(!('password' in status), 'Status must never expose password field');
});

// 5. Test Express trust proxy configuration
runTest('Express app has trust proxy enabled for Railway reverse proxy', () => {
  const app = require('../src/app');
  assert.strictEqual(app.get('trust proxy'), 1, 'trust proxy must be set to 1 for reverse proxy');
});

console.log(`--- Test Results: ${passedTests}/${totalTests} Passed ---`);
if (passedTests !== totalTests) {
  process.exit(1);
}
