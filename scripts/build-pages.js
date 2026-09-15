const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.pages');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.writeFileSync(path.join(out, 'js/config.js'), "window.BEATLOOM_CONFIG = { mode: 'local-bridge', apiBase: 'http://127.0.0.1:3000' };\n");
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('GitHub Pages ready in .pages/; audio, database and access keys stay on this computer.');
