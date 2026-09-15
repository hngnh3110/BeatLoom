const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');
const metadataModule = import('music-metadata');
const db = require('../db');
const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const allowed = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.webm']);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, nanoid() + path.extname(file.originalname).toLowerCase())
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024, files: 50, fields: 0 },
  fileFilter: (req, file, cb) => cb(allowed.has(path.extname(file.originalname).toLowerCase()) ? null : new Error('Định dạng không hỗ trợ. Chọn MP3, FLAC, WAV, OGG, M4A, AAC, OPUS hoặc WEBM.'), true)
});
router.get('/', (req, res) => res.json(db.prepare('SELECT * FROM songs ORDER BY uploaded_at DESC, rowid DESC').all()));
router.post('/upload', (req, res) => {
  upload.array('files', 50)(req, res, async err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Mỗi file không được vượt quá 200 MB.' : err.message });
    if (!req.files?.length) return res.status(400).json({ error: 'Hãy chọn ít nhất một file nhạc.' });
    const uploaded = [], errors = [];
    for (const file of req.files) {
      try {
        const mm = await metadataModule;
        const meta = await mm.parseFile(file.path, { duration: true, skipCovers: true });
        if (!meta.format.codec || !Number.isFinite(meta.format.duration) || meta.format.duration <= 0) throw new Error('File âm thanh bị hỏng hoặc không có thời lượng hợp lệ.');
        const bytes = Buffer.from(file.originalname, 'latin1');
        const decoded = bytes.toString('utf8');
        const original = !decoded.includes('\uFFFD') && Buffer.from(decoded).equals(bytes) ? decoded : file.originalname;
        const song = {
          id: nanoid(), title: (meta.common.title || path.basename(original, path.extname(original))).slice(0, 300),
          artist: (meta.common.artist || 'Chưa rõ nghệ sĩ').slice(0, 300), album: (meta.common.album || 'Chưa có album').slice(0, 300),
          filename: file.filename, original_name: original, format: path.extname(original).slice(1).toUpperCase(),
          duration: meta.format.duration, filesize: file.size
        };
        db.prepare(`INSERT INTO songs (id,title,artist,album,filename,original_name,format,duration,filesize)
          VALUES (@id,@title,@artist,@album,@filename,@original_name,@format,@duration,@filesize)`).run(song);
        uploaded.push(db.prepare('SELECT * FROM songs WHERE id = ?').get(song.id));
      } catch (error) {
        fs.rmSync(file.path, { force: true });
        errors.push({ file: file.originalname, error: 'Không đọc được âm thanh. File có thể bị hỏng hoặc sai định dạng.' });
      }
    }
    res.status(uploaded.length ? 201 : 400).json({ uploaded, errors, ...(uploaded.length ? {} : { error: 'Không có file âm thanh hợp lệ.' }) });
  });
});
router.patch('/:id', (req, res) => {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Không tìm thấy bài hát.' });
  const body = req.body || {};
  for (const field of ['title', 'artist', 'album']) {
    if (field in body) {
      if (typeof body[field] !== 'string' || !body[field].trim() || body[field].trim().length > 300) return res.status(400).json({ error: 'Thông tin bài hát phải có từ 1 đến 300 ký tự.' });
      song[field] = body[field].trim();
    }
  }
  if ('favorite' in body) {
    if (typeof body.favorite !== 'boolean') return res.status(400).json({ error: 'Trạng thái yêu thích không hợp lệ.' });
    song.favorite = Number(body.favorite);
  }
  db.prepare('UPDATE songs SET title=@title,artist=@artist,album=@album,favorite=@favorite WHERE id=@id').run(song);
  res.json(song);
});
router.post('/:id/played', (req, res) => {
  const result = db.prepare("UPDATE songs SET play_count=play_count+1,last_played_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Không tìm thấy bài hát.' });
  res.json(db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id));
});
router.delete('/:id', (req, res) => {
  const song = db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Không tìm thấy bài hát.' });
  fs.rmSync(path.join(UPLOAD_DIR, song.filename), { force: true });
  db.prepare('DELETE FROM songs WHERE id=?').run(req.params.id);
  res.json({ success: true });
});
module.exports = router;
