const assert = require('assert');
const Migrator = require('../src/db/migrator');
const AdminUserModel = require('../src/models/adminUserModel');
const WhatsAppSessionModel = require('../src/models/whatsappSessionModel');
const db = require('../src/config/db');

console.log('--- Starting Migration Execution & Repeatability Verification Suite ---');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res
        .then(() => {
          console.log(`  [PASS] ${name}`);
          passedTests++;
        })
        .catch((err) => {
          console.error(`  [FAIL] ${name}: ${err.message}`);
          process.exitCode = 1;
        });
    }
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runSuite() {
  const conn = await db.testConnection();
  if (!conn.connected) {
    console.warn('[SKIP] Local PostgreSQL not connected. Skipping live DB migration tests.');
    return;
  }

  // 1. Test initial or incremental migration execution
  await runTest('Migrator.runMigrations executes successfully', async () => {
    const res = await Migrator.runMigrations();
    assert(res.success === true, 'Migration result must be successful');
  });

  // 2. Test migration repeatability (idempotence)
  await runTest('Migrator.runMigrations is repeatable and idempotent', async () => {
    const secondRun = await Migrator.runMigrations();
    assert(secondRun.success === true, 'Second migration run must succeed without errors');
  });

  // 3. Verify all 8 required application tables exist
  await runTest('All required application tables exist in PostgreSQL schema', async () => {
    const ver = await Migrator.verifySchema();
    const expectedTables = [
      'admin_users',
      'salespersons',
      'whatsapp_sessions',
      'customers',
      'conversations',
      'messages',
      'media_attachments',
      'lid_mappings',
    ];

    for (const table of expectedTables) {
      assert(ver.existingTables.includes(table), `Table "${table}" must exist in database schema`);
    }
    assert.strictEqual(ver.missingTables.length, 0, `No required tables should be missing, but found: ${ver.missingTables.join(', ')}`);
  });

  // 4. Test admin seeding
  await runTest('Migrator.seedAdmin seeds or verifies admin account', async () => {
    const seedRes = await Migrator.seedAdmin();
    assert(typeof seedRes.count === 'number' && seedRes.count >= 1, 'Admin count must be at least 1');
  });

  // 5. Test admin seed repeatability (does not duplicate or overwrite)
  await runTest('Migrator.seedAdmin is repeatable and preserves existing admin', async () => {
    const secondSeed = await Migrator.seedAdmin();
    assert.strictEqual(secondSeed.seeded, false, 'Second seed must skip insertion');
    const adminCount = await AdminUserModel.countAdmins();
    assert.strictEqual(adminCount, 1, 'Admin count must strictly remain 1');
  });

  // 6. Test AdminUserModel queries admin_users
  await runTest('AdminUserModel can query admin_users successfully', async () => {
    const admin = await AdminUserModel.findByUsername('admin');
    assert(admin !== null, 'Admin user record must be retrievable from database');
    assert.strictEqual(admin.role, 'admin', 'Admin user must have role admin');
  });

  // 7. Test WhatsAppSessionModel queries whatsapp_sessions
  await runTest('WhatsAppSessionModel can query whatsapp_sessions successfully', async () => {
    const activeSessions = await WhatsAppSessionModel.findActiveSessions();
    assert(Array.isArray(activeSessions), 'findActiveSessions must return an array');
  });

  console.log(`--- Migration Test Results: ${passedTests}/${totalTests} Passed ---`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
  process.exit(0);
}

runSuite().catch((err) => {
  console.error('[Fatal Error in Migration Test Suite]:', err);
  process.exit(1);
});
