const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const pagesUrl = 'https://hngnh3110.github.io/BeatLoom/';
function localToken() {
  const file = path.join(__dirname, '.logs', 'connection.key');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(file, require('node:crypto').randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return fs.readFileSync(file, 'utf8').trim();
}
const accessToken = process.env.BEATLOOM_ACCESS_TOKEN || (require.main === module ? localToken() : '');
const access = require('./services/access')({ token: accessToken, origins: [new URL(pagesUrl).origin, ...(process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)] });
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.disable('x-powered-by');
function localPageOnly(req, res, next) {
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname);
  const site = req.get('Sec-Fetch-Site');
  let sameOrigin = !req.get('Origin');
  try { if (req.get('Origin')) sameOrigin = new URL(req.get('Origin')).host === req.get('host'); } catch { /* Reject invalid origin. */ }
  if (!local || !sameOrigin || site && !['same-origin', 'none'].includes(site)) return res.sendStatus(403);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}
app.get('/api/connection', localPageOnly, (req, res) => res.json({ token: accessToken }));
// Only navigate to the fixed, trusted Pages URL. Secrets travel in the fragment,
// which is removed by the client and is never sent to GitHub's HTTP server.
app.get('/connect', (req, res, next) => {
  // A top-level link from GitHub is expected, but fetches may not read this route.
  if (req.get('Sec-Fetch-Mode') && req.get('Sec-Fetch-Mode') !== 'navigate') return res.sendStatus(403);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) return res.sendStatus(403);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.redirect(303, `${pagesUrl}#beatloom-key=${encodeURIComponent(accessToken)}`);
});
app.use(access.cors);
app.use(express.json({ limit: '256kb' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'BEATLOOM', version: '1.3.0', authentication: !!accessToken }));
app.use('/api', access.authorize);
app.get('/api/media/:id', (req, res) => {
  const song = require('./db').prepare('SELECT filename FROM songs WHERE id=?').get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Không tìm thấy bài hát.' });
  res.json({ path: access.mediaPath(song.filename) + (req.query.download === '1' ? (accessToken ? '&' : '?') + 'download=1' : '') });
});
app.use('/api/songs', require('./routes/songs'));
app.use('/api/playlists', require('./routes/playlists'));
const imports = require('./routes/imports');
app.use('/api/imports', imports.router);
app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy API.' }));
app.use('/uploads', access.media, (req, res, next) => {
  if (req.query.download === '1') {
    let filename;
    try { filename = decodeURIComponent(req.path.slice(1)); } catch { return res.sendStatus(400); }
    const song = require('./db').prepare('SELECT title, format FROM songs WHERE filename=?').get(filename);
    if (song) res.attachment(`${song.title}.${song.format.toLowerCase()}`);
  }
  next();
}, express.static(uploadDir, { dotfiles: 'deny' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? 'Yêu cầu không hợp lệ.' : 'Máy chủ gặp lỗi. Vui lòng thử lại.' });
});
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = app.listen(port, host, () => console.log(`BEATLOOM đang chạy tại http://${host}:${port}`));
  server.on('error', err => { console.error(`Không thể chạy BEATLOOM: ${err.message}`); process.exit(1); });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
    await imports.service.shutdown();
    server.close(() => process.exit(0));
  });
}
module.exports = app;
