const crypto = require('node:crypto');

module.exports = function createAccess({ token = '', origins = [] } = {}) {
  const digest = value => crypto.createHash('sha256').update(value).digest();
  const matches = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
  const signature = (filename, expires) => crypto.createHmac('sha256', token).update(`${filename}\n${expires}`).digest('hex');
  const cors = (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const origin = req.get('Origin');
    if (origin) {
      let same = false;
      try { same = new URL(origin).host === req.get('host'); } catch { /* Reject malformed origins. */ }
      if (!same && !origins.includes(origin)) return res.status(403).json({ error: 'Nguồn yêu cầu không hợp lệ.' });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Range');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Disposition');
      if (req.get('Access-Control-Request-Private-Network') === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
  const authorize = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (token && !matches(req.get('Authorization') || '', `Bearer ${token}`)) return res.status(401).json({ error: 'Hãy kết nối máy chủ bằng khóa truy cập của bạn.' });
    next();
  };
  const media = (req, res, next) => {
    if (!token) return next();
    const expires = String(req.query.expires || '');
    const filename = req.path.slice(1);
    let decoded;
    try { decoded = decodeURIComponent(filename); } catch { return res.sendStatus(400); }
    const now = Math.floor(Date.now() / 1000);
    if (!/^\d+$/.test(expires) || Number(expires) <= now || Number(expires) > now + 86400 || !matches(String(req.query.signature || ''), signature(decoded, expires))) return res.sendStatus(401);
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  };
  const mediaPath = filename => {
    const url = `/uploads/${encodeURIComponent(filename)}`;
    if (!token) return url;
    const expires = String(Math.floor(Date.now() / 1000) + 86400);
    return `${url}?expires=${expires}&signature=${signature(filename, expires)}`;
  };
  return { cors, authorize, media, mediaPath };
};
