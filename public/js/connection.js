(() => {
  'use strict';
  const config = window.BEATLOOM_CONFIG || {};
  let base = config.apiBase || location.origin;
  // A fresh QR can update the temporary tunnel without republishing Pages.
  if (config.mode === 'remote' && location.origin === 'https://hngnh3110.github.io') {
    const endpoint = new URLSearchParams(location.hash.slice(1)).get('beatloom-server');
    const valid = value => /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(value || '');
    try {
      if (valid(endpoint)) sessionStorage.setItem('beatloom-remote-server', endpoint);
      const stored = sessionStorage.getItem('beatloom-remote-server');
      if (valid(stored)) base = stored;
    } catch { /* The current QR works even when storage is unavailable. */ }
    if (valid(endpoint)) base = endpoint;
  }
  const bridge = config.mode === 'local-bridge';
  const remote = config.mode === 'remote';
  const storageKey = `beatloom-access:${base}`;
  const $ = id => document.getElementById(id);
  let token = '';
  try { token = sessionStorage.getItem(storageKey) || ''; } catch { /* In-memory pairing still works. */ }
  function receivePairing() {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (!(bridge || remote) || !fragment.has('beatloom-key')) return false;
    token = fragment.get('beatloom-key');
    history.replaceState(null, '', location.pathname + location.search);
    try { sessionStorage.setItem(storageKey, token); } catch { /* Storage is optional. */ }
    return true;
  }
  receivePairing();
  window.addEventListener('hashchange', () => {
    if (remote && new URLSearchParams(location.hash.slice(1)).has('beatloom-server')) { location.reload(); return; }
    if (receivePairing()) location.reload();
  });
  const unavailable = remote ? 'Máy Mac phải đang bật, có Internet và đang chạy Start BEATLOOM Remote.command. Nếu kết nối đã khởi động lại, hãy quét mã QR mới trên Mac.' : 'Mở Start BEATLOOM.command trên máy tính này, rồi bấm Kết nối máy tính. Nếu dùng Safari, bấm Mở bản trên máy. Với Chrome, chọn Cho phép nếu trình duyệt hỏi quyền truy cập mạng cục bộ.';
  function status(connected, message = '') {
    $('connection-panel').hidden = connected;
    $('connection-message').textContent = message || unavailable;
    $('connection-status').textContent = connected ? (remote ? 'Mac đã kết nối' : 'Máy tính đã kết nối') : (remote ? 'Đăng nhập' : 'Kết nối máy tính');
    $('remote-login').hidden = !remote || connected;
    $('remote-logout').hidden = !remote || !token;
    $('connection-status').classList.toggle('connected', connected);
  }
  $('connection-status').hidden = !(bridge || remote);
  if (remote) {
    $('connection-title').textContent = 'Kết nối thư viện BEATLOOM';
    $('connection-link').hidden = true;
    $('connection-local').hidden = true;
  }
  $('connection-link').href = new URL('/connect', base).href;
  $('connection-local').href = base;
  $('connection-status').addEventListener('click', () => { $('connection-panel').hidden = !$('connection-panel').hidden; });
  const ready = (bridge || remote) ? Promise.resolve() : fetch(new URL('/api/connection', base), { cache: 'no-store' })
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
      throw new Error('Chưa kết nối được máy chủ BEATLOOM.');
    }
    if (response.status === 401) {
      status(false, remote ? 'Quét mã QR trong mục Thiết bị khác trên Mac, hoặc nhập khóa truy cập để mở thư viện.' : 'Bấm Kết nối máy tính để cho phép trang này sử dụng thư viện và bộ chuyển đổi đang chạy trên máy của bạn.');
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
  $('remote-login').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('remote-submit'); button.disabled = true;
    $('remote-login-error').textContent = '';
    try {
      const candidate = $('remote-key').value.trim();
      const response = await fetch(new URL('/api/songs', base), { headers: { Authorization: `Bearer ${candidate}` }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(response.status === 401 ? 'Khóa truy cập không đúng.' : 'Chưa kết nối được máy Mac.');
      token = candidate;
      try { sessionStorage.setItem(storageKey, token); } catch { /* Optional storage. */ }
      $('remote-key').value = '';
      location.reload();
    } catch (error) { $('remote-login-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('remote-logout').addEventListener('click', () => {
    try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
    token = ''; location.reload();
  });
  $('remote-open').hidden = bridge || remote;
  $('remote-open').addEventListener('click', async () => {
    $('remote-dialog').showModal();
    $('remote-sharing').hidden = true;
    $('remote-detail').textContent = 'Đang kiểm tra đường kết nối…';
    try {
      const response = await fetch('/api/remote-access', { cache: 'no-store' });
      if (!response.ok) throw new Error('Không đọc được kết nối trên Mac.');
      const result = await response.json();
      $('remote-detail').textContent = result.available ? 'Quét mã bằng điện thoại để mở thư viện. Giữ Mac bật và có Internet trong khi sử dụng.' : 'Mở Start BEATLOOM Remote.command trên Mac rồi mở lại mục này để lấy mã QR.';
      if (result.available) {
        $('remote-qr').src = result.qr; $('remote-link').value = result.link;
        $('remote-sharing').hidden = false;
      }
    } catch (error) { $('remote-detail').textContent = error.message; }
  });
  $('remote-close').addEventListener('click', () => $('remote-dialog').close());
  $('remote-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('remote-link').value); $('remote-copy').textContent = 'Đã sao chép'; }
    catch { $('remote-link').select(); $('remote-copy').textContent = 'Nhấn ⌘C để sao chép'; }
  });
  window.Beatloom = { api, upload, mediaUrl, ready, bridge, remote };
})();
