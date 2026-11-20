/**
 * Phase 13: Complete Mobile Responsive Design and Progressive Web App (PWA) Verification Suite
 */

const fs = require('fs');
const path = require('path');

let passedTests = 0;
let failedTests = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  [PASS] ${description}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${description}`);
    failedTests++;
  }
}

console.log('\n======================================================================');
console.log('  Phase 13: Mobile Responsive Design & PWA Verification Suite');
console.log('======================================================================\n');

// Paths
const projectRoot = path.resolve(__dirname, '..', '..');
const frontendPublic = path.join(projectRoot, 'frontend', 'public');
const frontendDist = path.join(projectRoot, 'frontend', 'dist');
const frontendSrc = path.join(projectRoot, 'frontend', 'src');

// -------------------------------------------------------------------------
// PART 1: PWA Web App Manifest Verification
// -------------------------------------------------------------------------
console.log('--- PART 1: Web App Manifest & Branding Configuration ---');
const manifestPath = path.join(frontendPublic, 'manifest.webmanifest');
assert('manifest.webmanifest exists in public/', fs.existsSync(manifestPath));

let manifest = null;
try {
  const content = fs.readFileSync(manifestPath, 'utf8');
  manifest = JSON.parse(content);
  assert('manifest.webmanifest contains valid JSON', true);
} catch (e) {
  assert('manifest.webmanifest contains valid JSON', false);
}

if (manifest) {
  assert('Application name is "WhatsApp Enterprise Monitor"', manifest.name === 'WhatsApp Enterprise Monitor');
  assert('Short name is "WhatsApp Monitor"', manifest.short_name === 'WhatsApp Monitor');
  assert('Theme color matches WhatsApp deep green "#075E54"', manifest.theme_color?.toLowerCase() === '#075e54');
  assert('Background color is "#F0F2F5"', manifest.background_color?.toLowerCase() === '#f0f2f5');
  assert('Display mode is "standalone"', manifest.display === 'standalone');
  assert('Start URL is "/"', manifest.start_url === '/');
  assert('Scope is "/"', manifest.scope === '/');
  
  // Icon sizes
  const icon192 = manifest.icons?.find((i) => i.sizes === '192x192' && i.type === 'image/png');
  const icon512 = manifest.icons?.find((i) => i.sizes === '512x512' && i.type === 'image/png');
  const iconMaskable = manifest.icons?.find((i) => i.purpose?.includes('maskable'));

  assert('Manifest declares 192x192 PNG icon', Boolean(icon192));
  assert('Manifest declares 512x512 PNG icon', Boolean(icon512));
  assert('Manifest declares maskable icon', Boolean(iconMaskable));
}

// -------------------------------------------------------------------------
// PART 2: Application Icons & Binary Integrity Verification
// -------------------------------------------------------------------------
console.log('\n--- PART 2: Icon Assets & Graphic Fidelity ---');
const iconsDir = path.join(frontendPublic, 'icons');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const icon192File = path.join(iconsDir, 'icon-192.png');
assert('icon-192.png exists', fs.existsSync(icon192File));
if (fs.existsSync(icon192File)) {
  const buf = fs.readFileSync(icon192File);
  assert('icon-192.png has valid PNG binary signature', buf.subarray(0, 8).equals(pngSignature));
  assert('icon-192.png has non-trivial size (>1KB)', buf.length > 1000);
}

const icon512File = path.join(iconsDir, 'icon-512.png');
assert('icon-512.png exists', fs.existsSync(icon512File));
if (fs.existsSync(icon512File)) {
  const buf = fs.readFileSync(icon512File);
  assert('icon-512.png has valid PNG binary signature', buf.subarray(0, 8).equals(pngSignature));
  assert('icon-512.png has high-resolution size (>5KB)', buf.length > 5000);
}

const iconMaskableFile = path.join(iconsDir, 'icon-maskable.png');
assert('icon-maskable.png exists', fs.existsSync(iconMaskableFile));
if (fs.existsSync(iconMaskableFile)) {
  const buf = fs.readFileSync(iconMaskableFile);
  assert('icon-maskable.png has valid PNG binary signature', buf.subarray(0, 8).equals(pngSignature));
}

const svg512File = path.join(iconsDir, 'icon-512.svg');
assert('Scalable vector icon-512.svg exists', fs.existsSync(svg512File));

// -------------------------------------------------------------------------
// PART 3: Service Worker Security & Offline Policy
// -------------------------------------------------------------------------
console.log('\n--- PART 3: Service Worker Security & Caching Guard ---');
const swPath = path.join(frontendPublic, 'sw.js');
assert('sw.js exists in public/', fs.existsSync(swPath));

if (fs.existsSync(swPath)) {
  const swCode = fs.readFileSync(swPath, 'utf8');

  // Strict Security Checks:
  assert('Service worker explicitly bypasses /api/ endpoints', swCode.includes('/api/'));
  assert('Service worker explicitly bypasses SSE live streams', swCode.includes('live-stream') || swCode.includes('text/event-stream'));
  assert('Service worker explicitly bypasses Authorization headers', swCode.includes('Authorization'));
  assert('Service worker ignores non-GET requests', swCode.includes("request.method !== 'GET'"));
  assert('Service worker pre-caches offline fallback page', swCode.includes('/offline.html'));
  assert('Service worker implements clients.claim() for instant updates', swCode.includes('clients.claim()'));
  assert('Service worker implements skipWaiting()', swCode.includes('skipWaiting()'));
}

// Offline fallback HTML verification
const offlinePath = path.join(frontendPublic, 'offline.html');
assert('offline.html exists in public/', fs.existsSync(offlinePath));
if (fs.existsSync(offlinePath)) {
  const html = fs.readFileSync(offlinePath, 'utf8');
  assert('offline.html includes clear offline notice', html.includes('No Internet Connection'));
  assert('offline.html contains security explanation that chat logs are not cached offline', html.includes('never stored in unencrypted offline browser caches'));
  assert('offline.html has retry connection button', html.includes('Retry Connection'));
}

// -------------------------------------------------------------------------
// PART 4: HTML Head, Meta Tags, and Safe-Area Support
// -------------------------------------------------------------------------
console.log('\n--- PART 4: Viewport, Safe-Area & PWA Meta Tags ---');
const indexHtmlPath = path.join(projectRoot, 'frontend', 'index.html');
assert('frontend/index.html exists', fs.existsSync(indexHtmlPath));

if (fs.existsSync(indexHtmlPath)) {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  assert('index.html contains viewport-fit=cover for iPhone notch and home-bar', html.includes('viewport-fit=cover'));
  assert('index.html links to manifest.webmanifest', html.includes('manifest.webmanifest'));
  assert('index.html includes theme-color "#075E54"', html.includes('#075E54') && html.includes('theme-color'));
  assert('index.html includes apple-mobile-web-app-capable', html.includes('apple-mobile-web-app-capable'));
  assert('index.html includes apple-touch-icon', html.includes('apple-touch-icon'));
}

// -------------------------------------------------------------------------
// PART 5: Conversation Logs Mobile Redesign Architecture
// -------------------------------------------------------------------------
console.log('\n--- PART 5: Conversation Logs Mobile & Desktop Architecture ---');
const convPagePath = path.join(frontendSrc, 'pages', 'ConversationsPage.jsx');
assert('ConversationsPage.jsx exists', fs.existsSync(convPagePath));

if (fs.existsSync(convPagePath)) {
  const code = fs.readFileSync(convPagePath, 'utf8');

  assert('Implements mobileView state for switching list/chat', code.includes('mobileView'));
  assert('Provides Back button to return to conversation list on mobile', code.includes('setMobileView(\'list\')'));
  assert('Hides conversation list on mobile when chat is active', code.includes("mobileView === 'list' ? 'flex flex-1' : 'hidden lg:flex'"));
  assert('Hides chat on mobile when in conversation list view', code.includes("mobileView === 'chat' ? 'flex' : 'hidden lg:flex'"));
  assert('Provides separate customer details drawer/modal on mobile', code.includes('mobileDetailsOpen') && code.includes('setMobileDetailsOpen(true)'));
  assert('Preserves 3-column desktop layout with lg:flex', code.includes('lg:flex-row') && code.includes('hidden lg:flex'));
  assert('Maintains touch-friendly targets of at least 44px', code.includes('min-h-[44px]'));
  assert('Handles background resume with visibilitychange', code.includes('visibilitychange'));
  assert('Maintains upward pagination for older messages', code.includes('handleLoadOlder'));
  assert('Strictly enforces read-only mode without message compose inputs', !code.includes('<textarea') && code.includes('Read-Only'));
}

// -------------------------------------------------------------------------
// PART 6: Salesperson Management Mobile Cards & 44px Touch Targets
// -------------------------------------------------------------------------
console.log('\n--- PART 6: Salesperson Management Responsiveness ---');
const spPagePath = path.join(frontendSrc, 'pages', 'SalespersonsPage.jsx');
assert('SalespersonsPage.jsx exists', fs.existsSync(spPagePath));

if (fs.existsSync(spPagePath)) {
  const code = fs.readFileSync(spPagePath, 'utf8');

  assert('Contains responsive mobile card view (< md:)', code.includes('md:hidden') && code.includes('filteredSalespersons.map'));
  assert('Preserves desktop table view (md: and above)', code.includes('hidden md:block') && code.includes('<table'));
  assert('Ensures action buttons meet minimum 44px touch targets', code.includes('min-h-[44px]'));
  assert('Salesperson actions fit without horizontal overflow', code.includes('grid grid-cols-3 gap-2'));
}

// -------------------------------------------------------------------------
// PART 7: Clean Streamlined Navigation (Customers Section Removed)
// -------------------------------------------------------------------------
console.log('\n--- PART 7: Clean Streamlined Navigation ---');
const sidebarPath = path.join(frontendSrc, 'components', 'layout', 'Sidebar.jsx');
const appPath = path.join(frontendSrc, 'App.jsx');
assert('Sidebar.jsx exists', fs.existsSync(sidebarPath));
assert('App.jsx exists', fs.existsSync(appPath));

if (fs.existsSync(sidebarPath) && fs.existsSync(appPath)) {
  const sidebarCode = fs.readFileSync(sidebarPath, 'utf8');
  const appCode = fs.readFileSync(appPath, 'utf8');

  assert('Sidebar navigation excludes obsolete Customers section', !sidebarCode.includes("to: '/customers'"));
  assert('App routes redirect /customers to /conversations', appCode.includes('path="customers"') && appCode.includes('Navigate to="/conversations"'));
}

// -------------------------------------------------------------------------
// PART 8: PWA Install Banner & Standalone Mode Support
// -------------------------------------------------------------------------
console.log('\n--- PART 8: Install Experience & Standalone Detection ---');
const bannerPath = path.join(frontendSrc, 'components', 'common', 'PWAInstallBanner.jsx');
assert('PWAInstallBanner.jsx exists', fs.existsSync(bannerPath));

if (fs.existsSync(bannerPath)) {
  const code = fs.readFileSync(bannerPath, 'utf8');

  assert('Listens for beforeinstallprompt event', code.includes('beforeinstallprompt'));
  assert('Detects standalone display-mode', code.includes('(display-mode: standalone)'));
  assert('Provides iOS Safari instructions for Add to Home Screen', code.includes('isIosSafari') && code.includes('Add to Home Screen'));
  assert('Provides dismissible option', code.includes('handleDismiss'));
}

// -------------------------------------------------------------------------
// PART 9: Production Build Directory Verification
// -------------------------------------------------------------------------
console.log('\n--- PART 9: Production Bundle Deployment Integrity ---');
assert('dist/ directory exists', fs.existsSync(frontendDist));
assert('dist/index.html exists', fs.existsSync(path.join(frontendDist, 'index.html')));
assert('dist/manifest.webmanifest exists', fs.existsSync(path.join(frontendDist, 'manifest.webmanifest')));
assert('dist/sw.js exists', fs.existsSync(path.join(frontendDist, 'sw.js')));
assert('dist/offline.html exists', fs.existsSync(path.join(frontendDist, 'offline.html')));
assert('dist/icons/icon-192.png exists', fs.existsSync(path.join(frontendDist, 'icons', 'icon-192.png')));
assert('dist/icons/icon-512.png exists', fs.existsSync(path.join(frontendDist, 'icons', 'icon-512.png')));
assert('dist/icons/icon-maskable.png exists', fs.existsSync(path.join(frontendDist, 'icons', 'icon-maskable.png')));

console.log('\n======================================================================');
console.log(`  Phase 13 Test Summary: Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('======================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

