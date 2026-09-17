'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, '.logs');
const stateFile = path.join(dir, 'remote.json');
fs.mkdirSync(dir, { recursive: true });
const read = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } };
const alive = state => {
  if (!Number.isInteger(state.pid) || state.pid < 2) return false;
  try { return execFileSync('/bin/ps', ['-p', String(state.pid), '-o', 'args='], { encoding: 'utf8' }).includes(__filename + ' daemon'); } catch { return false; }
};
const save = state => {
  fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(stateFile + '.tmp', stateFile);
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const action = process.argv[2];
  if (action === 'stop') {
    const old = read();
    if (alive(old)) {
      process.kill(old.pid, 'SIGTERM');
      for (let i = 0; i < 50 && alive(old); i++) await delay(100);
      if (alive(old)) throw new Error('Kết nối chưa dừng; xem .logs/remote.log.');
    }
    console.log('Đã tắt truy cập từ xa.');
    return;
  }
  if (action === 'start') {
    let state = read();
    if (!alive(state)) {
      const health = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(3000) }).then(r => r.json());
      if (health.app !== 'BEATLOOM' || !health.remote || !health.authentication) throw new Error('Hãy dừng và mở lại BEATLOOM phiên bản mới trước.');
      const log = fs.openSync(path.join(dir, 'remote.log'), 'a');
      const child = spawn(process.execPath, [__filename, 'daemon'], { cwd: root, detached: true, stdio: ['ignore', log, log] });
      child.unref(); fs.closeSync(log);
      state = { pid: child.pid };
    }
    for (let i = 0; i < 90; i++) {
      await delay(500);
      const current = read();
      if (current.pid === state.pid && current.status === 'running' && alive(current)) {
        console.log(`Đã mở kết nối: ${current.url}\nMở http://127.0.0.1:3000 → Thiết bị khác để lấy mã QR riêng.\nGiữ Mac bật, kết nối Internet và mở nắp máy. Link có thể đổi khi khởi động lại.`);
        return;
      }
      if (!alive(state)) throw new Error('Không mở được kết nối. Xem .logs/remote.log.');
    }
    throw new Error('Kết nối đang khởi động chậm. Xem .logs/remote.log và thử mở lại.');
  }
  if (action !== 'daemon') throw new Error('Dùng: node scripts/remote.js start|stop');
  const binary = ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared'].find(file => fs.existsSync(file));
  if (!binary) throw new Error('Cần cài cloudflared: brew install cloudflared');
  const state = { pid: process.pid, status: 'starting', startedAt: new Date().toISOString(), url: '' };
  save(state);
  const awake = spawn('/usr/bin/caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
  const child = spawn(binary, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:3001'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let registered = false, stopping = false, buffer = '';
  function output(chunk) {
    process.stdout.write(chunk);
    buffer = (buffer + chunk.toString()).slice(-8192);
    const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) state.url = match[0];
    if (buffer.includes('Registered tunnel connection')) registered = true;
    if (registered && state.url && state.status !== 'running') { state.status = 'running'; save(state); }
  }
  child.stdout.on('data', output); child.stderr.on('data', output);
  function stop() {
    if (stopping) return;
    stopping = true; state.status = 'stopped'; save(state);
    child.kill('SIGTERM'); awake.kill('SIGTERM');
    setTimeout(() => { child.kill('SIGKILL'); process.exit(0); }, 5000).unref();
  }
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, stop);
  awake.on('error', error => console.error(error.message));
  child.on('error', error => { console.error(error.message); stop(); });
  child.on('exit', code => { state.status = 'stopped'; save(state); awake.kill(); process.exit(stopping ? 0 : code || 1); });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
