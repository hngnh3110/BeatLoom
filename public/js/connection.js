(() => {
  'use strict';
  const config = window.BEATLOOM_CONFIG || {};
  const base = config.apiBase || location.origin;
  const bridge = config.mode === 'local-bridge';
  const storageKey = `beatloom-access:${base}`;
  const $ = id => document.getElementById(id);
  let token = '';
  try { token = sessionStorage.getItem(storageKey) || ''; } catch { /* In-memory pairing still works. */ }
  function receivePairing() {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (!bridge || !fragment.has('beatloom-key')) return false;
    token = fragment.get('beatloom-key');
    history.replaceState(null, '', location.pathname + location.search);
    try { sessionStorage.setItem(storageKey, token); } catch { /* Storage is optional. */ }
    return true;
  }
  receivePairing();
  window.addEventListener('hashchange', () => { if (receivePairing()) location.reload(); });
  const unavailable = 'Mở Start BEATLOOM.command trên máy tính này, rồi bấm Kết nối máy tính. Nếu dùng Safari, bấm Mở bản trên máy. Với Chrome, chọn Cho phép nếu trình duyệt hỏi quyền truy cập mạng cục bộ.';
  function status(connected, message = '') {
    $('connection-panel').hidden = connected;
    $('connection-message').textContent = message || unavailable;
    $('connection-status').textContent = connected ? 'Máy tính đã kết nối' : 'Kết nối máy tính';
    $('connection-status').classList.toggle('connected', connected);
  }
  $('connection-status').hidden = !bridge;
  $('connection-link').href = new URL('/connect', base).href;
  $('connection-local').href = base;
  $('connection-status').addEventListener('click', () => { $('connection-panel').hidden = !$('connection-panel').hidden; });
  const ready = bridge ? Promise.resolve() : fetch(new URL('/api/connection', base), { cache: 'no-store' })
    .then(async response => { if (response.ok) token = (await response.json()).token || ''; })
    .catch(() => {});
  const headers = () => token ? { Authorization: `Bearer ${token}` } : {};
  async function api(route, method = 'GET', body) {
    await ready;
    let response;
    try {
      response = await fetch(new URL(route, base), { method, headers: { ...headers(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    } catch {
      status(false);
      throw new Error('Chưa kết nối được máy chủ BEATLOOM trên máy tính này.');
    }
    if (response.status === 401) {
      status(false, 'Bấm Kết nối máy tính để cho phép trang này sử dụng thư viện và bộ chuyển đổi đang chạy trên máy của bạn.');
      throw new Error('Hãy kết nối máy tính trước khi sử dụng thư viện.');
    }
    let data;
    try { data = await response.json(); } catch { throw new Error('Máy chủ trả về dữ liệu không hợp lệ. Hãy mở lại Start BEATLOOM.command.'); }
    if (!response.ok) throw new Error(data.error || 'Không thể thực hiện yêu cầu.');
    status(true);
    return data;
  }
  const mediaCache = new Map();
  async function mediaUrl(song, download = false) {
    const cached = mediaCache.get(song.id);
    if (!download && cached && cached.until > Date.now()) return cached.url;
    const result = await api(`/api/media/${encodeURIComponent(song.id)}${download ? '?download=1' : ''}`);
    const url = new URL(result.path, base).href;
    if (!download) mediaCache.set(song.id, { url, until: Date.now() + 23 * 60 * 60 * 1000 });
    return url;
  }
  async function upload(files, progress) {
    await ready;
    return new Promise((resolve, reject) => {
      const form = new FormData();
      files.forEach(file => form.append('files', file));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', new URL('/api/songs/upload', base));
      for (const [key, value] of Object.entries(headers())) xhr.setRequestHeader(key, value);
      xhr.timeout = 30 * 60 * 1000;
      xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
      xhr.onload = () => {
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status === 401) status(false);
          if (xhr.status >= 400) throw new Error(result.error || 'Tải nhạc thất bại.');
          resolve(result);
        } catch (error) { reject(error); }
      };
      xhr.onerror = xhr.ontimeout = () => { status(false); reject(new Error('Mất kết nối hoặc quá thời gian tải. Hãy kiểm tra thư viện trước khi thử lại.')); };
      xhr.send(form);
    });
  }
  $('connection-retry').addEventListener('click', async () => {
    const button = $('connection-retry'); button.disabled = true;
    try { await api('/api/songs'); location.reload(); } catch { /* The connection panel explains recovery. */ }
    finally { button.disabled = false; }
  });
  window.Beatloom = { api, upload, mediaUrl, ready, bridge };
})();
