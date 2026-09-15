const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Nguồn yêu cầu không hợp lệ.' });
    } catch { return res.status(403).json({ error: 'Nguồn yêu cầu không hợp lệ.' }); }
  }
  next();
});
app.use(express.json({ limit: '256kb' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'BEATLOOM', version: '1.2.0' }));
app.use('/api/songs', require('./routes/songs'));
app.use('/api/playlists', require('./routes/playlists'));
const imports = require('./routes/imports');
app.use('/api/imports', imports.router);
app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy API.' }));
app.use('/uploads', express.static(uploadDir, { dotfiles: 'deny' }));
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
