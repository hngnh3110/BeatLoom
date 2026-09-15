const router = require('express').Router();
const { nanoid } = require('nanoid');
const db = require('../db');
const find = id => db.prepare('SELECT * FROM playlists WHERE id=?').get(id);
const validName = name => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 80;
router.get('/', (req, res) => res.json(db.prepare(`SELECT p.*, COUNT(ps.song_id) AS song_count
  FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id=p.id GROUP BY p.id ORDER BY p.created_at DESC, p.rowid DESC`).all()));
router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!validName(name)) return res.status(400).json({ error: 'Tên danh sách phải có từ 1 đến 80 ký tự.' });
  const id = nanoid();
  db.prepare('INSERT INTO playlists (id,name) VALUES (?,?)').run(id,name.trim());
  res.status(201).json(find(id));
});
router.use('/:id', (req, res, next) => {
  if (!find(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy danh sách phát.' });
  next();
});
router.get('/:id', (req, res) => res.json({ ...find(req.params.id), songs: db.prepare(`SELECT s.*, ps.position FROM playlist_songs ps
  JOIN songs s ON s.id=ps.song_id WHERE ps.playlist_id=? ORDER BY ps.position`).all(req.params.id) }));
router.put('/:id', (req, res) => {
  const { name } = req.body || {};
  if (!validName(name)) return res.status(400).json({ error: 'Tên danh sách phải có từ 1 đến 80 ký tự.' });
  db.prepare('UPDATE playlists SET name=? WHERE id=?').run(name.trim(),req.params.id);
  res.json(find(req.params.id));
});
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM playlists WHERE id=?').run(req.params.id);
  res.json({ success: true });
});
router.post('/:id/songs', (req, res) => {
  const body = req.body || {};
  const ids = body.songIds ?? [body.songId];
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => typeof id !== 'string')) return res.status(400).json({ error: 'Danh sách bài hát không hợp lệ.' });
  if (ids.some(id => !db.prepare('SELECT id FROM songs WHERE id=?').get(id))) return res.status(404).json({ error: 'Không tìm thấy một hoặc nhiều bài hát.' });
  const added = db.transaction(() => {
    let position = db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS next FROM playlist_songs WHERE playlist_id=?').get(req.params.id).next;
    let count = 0;
    for (const id of new Set(ids)) count += db.prepare('INSERT OR IGNORE INTO playlist_songs VALUES (?,?,?)').run(req.params.id,id,position++).changes;
    return count;
  })();
  res.json({ success: true, added });
});
router.delete('/:id/songs/:songId', (req, res) => {
  const result = db.prepare('DELETE FROM playlist_songs WHERE playlist_id=? AND song_id=?').run(req.params.id,req.params.songId);
  if (!result.changes) return res.status(404).json({ error: 'Bài hát không có trong danh sách này.' });
  res.json({ success: true });
});
router.put('/:id/reorder', (req, res) => {
  const { songIds } = req.body || {};
  const existing = db.prepare('SELECT song_id FROM playlist_songs WHERE playlist_id=?').all(req.params.id).map(row => row.song_id);
  if (!Array.isArray(songIds) || songIds.length !== existing.length || new Set(songIds).size !== existing.length || songIds.some(id => !existing.includes(id))) return res.status(400).json({ error: 'Thứ tự phải chứa đúng và đủ các bài hát, không trùng lặp.' });
  db.transaction(() => songIds.forEach((id,index) => db.prepare('UPDATE playlist_songs SET position=? WHERE playlist_id=? AND song_id=?').run(index,req.params.id,id)))();
  res.json({ success: true });
});
module.exports = router;
