const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.pages');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
let remote = '';
try { remote = JSON.parse(fs.readFileSync(path.join(root, 'public/remote-server.json'), 'utf8')).url || ''; } catch { /* Local bridge remains supported. */ }
if (remote && !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(remote)) throw new Error('Invalid remote server URL');
const config = remote ? { mode: 'remote', apiBase: remote } : { mode: 'local-bridge', apiBase: 'http://127.0.0.1:3000' };
fs.writeFileSync(path.join(out, 'js/config.js'), `window.BEATLOOM_CONFIG = ${JSON.stringify(config)};\n`);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('GitHub Pages ready in .pages/; audio, database and access keys stay on this computer.');
