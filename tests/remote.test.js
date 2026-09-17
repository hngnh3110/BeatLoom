const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beatloom-remote-'));
process.env.DATA_DIR = path.join(root, 'data');
process.env.UPLOAD_DIR = path.join(root, 'uploads');
process.env.IMPORT_DIR = path.join(root, 'imports');
const token = process.env.BEATLOOM_ACCESS_TOKEN = 'isolated-remote-key-'.repeat(4);
const app = require('../server');
let server, local, base, browser;
before(async () => {
  server = await new Promise(resolve => { const s = app.remoteApp.listen(0, '127.0.0.1', () => resolve(s)); });
  local = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});
after(async () => {
  await browser?.close(); await require('../routes/imports').service.shutdown();
  await Promise.all([server, local].map(s => new Promise(resolve => s.close(resolve))));
  require('../db').close(); fs.rmSync(root, { recursive: true, force: true });
});
test('remote listener blocks pairing secrets even with forged local headers', async () => {
  for (const route of ['/api/connection', '/api/remote-access', '/connect']) {
    const status = await new Promise((resolve, reject) => {
      http.get(base + route, { headers: { Host: 'localhost', Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate', 'X-Forwarded-Host': 'localhost' } }, r => { r.resume(); r.on('end', () => resolve(r.statusCode)); }).on('error', reject);
    });
    assert.equal(status, 403, route);
  }
  const config = await fetch(base + '/js/config.js').then(r => r.text());
  assert.match(config, /"mode":"remote"/); assert.ok(!config.includes(token));
  assert.equal((await fetch(base + '/api/songs')).status, 401);
  assert.equal((await fetch(base + '/api/songs', { headers: { Authorization: `Bearer ${token}` } })).status, 200);
  const pair = await fetch(`http://127.0.0.1:${local.address().port}/api/connection`).then(r => r.json());
  assert.equal(pair.token, token);
});
test('mobile remote login rejects wrong key, preserves session and logs out', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('#remote-login').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#connection-link').isVisible(), false);
  assert.equal(await page.locator('#remote-open').isVisible(), false);
  await page.fill('#remote-key', 'wrong'); await page.click('#remote-submit');
  await page.waitForFunction(() => document.querySelector('#remote-login-error').textContent.includes('không đúng'));
  await page.fill('#remote-key', token); await page.click('#remote-submit');
  await page.waitForFunction(() => document.querySelector('#connection-status').classList.contains('connected'));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#connection-status').classList.contains('connected'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.click('#connection-status'); await page.click('#remote-logout');
  await page.locator('#remote-login').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  await context.close();
});
test('QR fragment pairs directly and is removed from browser address', async () => {
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(base + '/#beatloom-key=' + encodeURIComponent(token));
  await page.waitForFunction(() => document.querySelector('#connection-status').classList.contains('connected'));
  assert.equal(new URL(page.url()).hash, '');
  await context.close();
});
test('Pages accepts a new QR tunnel, remembers it and replaces an older session endpoint', async () => {
  const context = await browser.newContext();
  const origin = 'https://hngnh3110.github.io';
  const first = 'https://first-test.trycloudflare.com';
  const second = 'https://second-test.trycloudflare.com';
  let hits = 0;
  await context.route(origin + '/BeatLoom/**', route => {
    const relative = new URL(route.request().url()).pathname.replace('/BeatLoom/', '') || 'index.html';
    if (relative === 'js/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.BEATLOOM_CONFIG={mode:'remote',apiBase:'https://old-test.trycloudflare.com'};` });
    return route.fulfill({ path: path.join(__dirname, '../public', relative) });
  });
  for (const endpoint of [first, second]) await context.route(endpoint + '/**', async route => {
    hits++;
    const response = await route.fetch({ url: base + new URL(route.request().url()).pathname });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  const link = endpoint => origin + '/BeatLoom/#beatloom-server=' + encodeURIComponent(endpoint) + '&beatloom-key=' + encodeURIComponent(token);
  await page.goto(link(first));
  await page.waitForFunction(() => document.querySelector('#connection-status').classList.contains('connected'));
  assert.equal(new URL(page.url()).hash, '');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#connection-status').classList.contains('connected'));
  await page.evaluate(url => { location.href = url; }, link(second));
  await page.waitForFunction(endpoint => sessionStorage.getItem('beatloom-remote-server') === endpoint && document.querySelector('#connection-status').classList.contains('connected'), second);
  assert.equal(new URL(page.url()).hash, ''); assert.ok(hits >= 3);
  await context.close();
});
