const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const http = require('node:http');
const rawGet = (url, headers = {}) => new Promise((resolve, reject) => { http.get(url, { headers }, response => { response.resume(); response.on('end', () => resolve(response)); }).on('error', reject); });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beatloom-pages-'));
const token = 'test-only-connection-key-'.repeat(3);
const origin = 'https://hngnh3110.github.io';
const pagesUrl = `${origin}/BeatLoom/`;
process.env.DATA_DIR = path.join(root, 'data');
process.env.UPLOAD_DIR = path.join(root, 'uploads');
process.env.IMPORT_DIR = path.join(root, 'imports');
process.env.BEATLOOM_ACCESS_TOKEN = token;
const app = require('../server');
const db = require('../db');
let server, base, browser, song;
const auth = { Authorization: `Bearer ${token}`, Origin: origin };
function wav() {
  const buffer = Buffer.alloc(44 + 16000 * 4);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(buffer.length - 44, 40);
  for (let i = 44; i < buffer.length; i += 2) buffer.writeInt16LE(Math.sin(i / 16) * 1000, i);
  return buffer;
}
before(async () => {
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  const form = new FormData(); form.append('files', new Blob([wav()]), 'Kết nối thử.wav');
  const response = await fetch(`${base}/api/songs/upload`, { method: 'POST', headers: auth, body: form });
  assert.equal(response.status, 201); song = (await response.json()).uploaded[0];
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});
after(async () => {
  await browser?.close();
  await require('../routes/imports').service.shutdown();
  await new Promise(resolve => server.close(resolve));
  db.close(); fs.rmSync(root, { recursive: true, force: true });
});
test('Pages origin must authenticate; other origins and pairing-key reads are rejected', async () => {
  assert.equal((await fetch(`${base}/api/songs`, { headers: { Origin: origin } })).status, 401);
  assert.equal((await fetch(`${base}/api/songs`, { headers: auth })).status, 200);
  assert.equal((await fetch(`${base}/api/songs`, { headers: { ...auth, Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/connection`, { headers: { Origin: origin } })).status, 403);
  assert.equal((await rawGet(`${base}/api/connection`, { Host: 'untrusted.example' })).statusCode, 403);
  const preflight = await fetch(`${base}/api/songs`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Private-Network': 'true', 'Access-Control-Request-Method': 'PATCH' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
  const pair = await rawGet(`${base}/connect?redirect=https://untrusted.example`);
  assert.ok(pair.headers.location.startsWith(pagesUrl + '#beatloom-key='));
});
test('private media signatures enforce access, expiry and byte-range playback', async () => {
  assert.equal((await fetch(`${base}/uploads/${song.filename}`, { headers: { Origin: origin } })).status, 401);
  const media = await (await fetch(`${base}/api/media/${song.id}`, { headers: auth })).json();
  const response = await fetch(base + media.path, { headers: { Origin: origin, Range: 'bytes=0-43' } });
  assert.equal(response.status, 206); assert.equal((await response.arrayBuffer()).byteLength, 44);
  const expired = new URL(media.path, base); expired.searchParams.set('expires', '1');
  assert.equal((await fetch(expired)).status, 401);
  const tampered = new URL(media.path, base); tampered.searchParams.set('signature', 'wrong');
  assert.equal((await fetch(tampered)).status, 401);
});
test('HTTPS Pages frontend connects to loopback, uploads, plays, persists pairing, and explains disconnection', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.grantPermissions(['local-network-access'], { origin });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = [], missing = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${origin}/**`, async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/BeatLoom/')) { missing.push(url.pathname); return route.fulfill({ status: 404, body: '' }); }
    const relative = url.pathname.slice('/BeatLoom/'.length) || 'index.html';
    if (relative === 'js/config.js') return route.fulfill({ contentType: 'application/javascript', body: `window.BEATLOOM_CONFIG = ${JSON.stringify({ mode: 'local-bridge', apiBase: base })};` });
    const file = path.join(__dirname, '../public', relative);
    if (!fs.existsSync(file)) { missing.push(relative); return route.fulfill({ status: 404, body: '' }); }
    return route.fulfill({ path: file });
  });
  try {
    await page.goto(pagesUrl); await page.locator('#main[aria-busy="false"]').waitFor();
    assert.equal(await page.locator('#connection-panel').isVisible(), true);
    assert.equal(await page.locator('#connection-link').getAttribute('href'), base + '/connect');
    // Playwright does not intercept the destination of an HTTP redirect.
    // Fetch its fixed destination first so the test uses the staged Pages files.
    const redirect = await rawGet(base + '/connect');
    await page.goto(redirect.headers.location);
    await page.waitForFunction(() => document.querySelector('#library-count')?.textContent === '1');
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.locator('#connection-panel').isVisible(), false);
    await page.locator('.track-title').click();
    await page.waitForFunction(() => !document.querySelector('#audio').paused && document.querySelector('#audio').currentTime > .1);
    await page.locator('#play').click();
    await page.locator('#file-input').setInputFiles({ name: 'Tải từ Pages.wav', mimeType: 'audio/wav', buffer: wav() });
    await page.waitForFunction(() => document.querySelector('#library-count').textContent === '2');
    await page.locator('[data-action="favorite"]').first().click();
    await page.waitForFunction(() => document.querySelector('#favorite-count').textContent === '1');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#library-count').textContent === '2');
    assert.equal(await page.locator('#favorite-count').textContent(), '1');
    await page.locator('#youtube-open').click();
    await page.waitForFunction(() => !document.querySelector('#youtube-submit').disabled);
    await page.locator('#youtube-close').click();
    await page.screenshot({ path: '.test-results/pages-connected.png' });
    await page.route(`${base}/api/**`, route => route.abort());
    await page.evaluate(() => window.Beatloom.api('/api/songs').catch(() => {}));
    assert.equal(await page.locator('#connection-panel').isVisible(), true);
    assert.match(await page.locator('#connection-message').textContent(), /Start BEATLOOM/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: '.test-results/pages-disconnected-mobile.png' });
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  } finally { await context.close(); }
});
