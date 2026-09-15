(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const paths = {
    youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3V9Z"/>',
    wave: '<path d="M4 9v6m4-10v14m4-16v18m4-16v14m4-10v6"/>',
    library: '<rect x="3" y="4" width="5" height="16" rx="1"/><path d="M12 4v16m4-15 4 14"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    play: '<path d="m9 5 11 7-11 7V5Z"/>',
    pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    sort: '<path d="M4 6h16M4 12h11M4 18h6"/>',
    music: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    shuffle: '<path d="M3 7h3l12 10h3m-4-4 4 4-4 4M3 17h3l3-3m4-4 5-3h3m-4-4 4 4-4 4"/>',
    previous: '<path d="M5 5v14M19 5 8 12l11 7V5Z"/>',
    next: '<path d="M19 5v14M5 5l11 7-11 7V5Z"/>',
    repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
    volume: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
    queue: '<path d="M3 6h18M3 12h12M3 18h9m5-3 5 3-5 3v-6Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    up: '<path d="m5 14 7-7 7 7"/>',
    down: '<path d="m5 10 7 7 7-7"/>',
    minus: '<path d="M5 12h14"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.music}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = value => Number.isFinite(value) && value >= 0 ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';
  const normalize = str => String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const coverTone = song => 28 + [...song.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 12;
  const cover = song => `<span class="cover" style="--cover-tone:${coverTone(song)}%">${icon('music')}</span>`;
  const audio = $('audio');
  let songs = [], playlists = [], view = 'library', playlist = null, displayed = [];
  let queue = [], baseQueue = [], position = -1, currentId = null, shuffle = false, repeat = 'off';
  let uploading = false, navigation = 0, playRequest = 0, restoreTime = null, lastSave = 0;
  let dialogAction = null, lastFocus = null, draggingId = null, previousVolume = .75;
  let audioContext = null, analyser = null, frequencyData = null, visualFrame = null;
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem('beatloom-player') || localStorage.getItem('sonara-player') || '{}') || {}; } catch { /* Storage is optional. */ }
  const songById = id => songs.find(song => song.id === id);
  const currentSong = () => songById(currentId);
  function toast(message, error = false) {
    const item = document.createElement('div'); item.className = `toast${error ? ' error' : ''}`;
    item.textContent = message; $('toasts').append(item); setTimeout(() => item.remove(), error ? 6500 : 3500);
  }
  async function api(url, method = 'GET', body) {
    const response = await fetch(url, { method, headers: body ? {'Content-Type':'application/json'} : {}, ...(body ? {body:JSON.stringify(body)} : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không thể thực hiện yêu cầu.');
    return data;
  }
  const safely = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(error => toast(error.message, true));
  function savePlayer() {
    try { localStorage.setItem('beatloom-player', JSON.stringify({ volume:audio.volume, muted:audio.muted, shuffle, repeat, currentId, queue, baseQueue, position, time:audio.currentTime || 0 })); } catch { /* Private mode may disable persistence. */ }
  }
  function updateSong(updated) {
    songs = songs.map(song => song.id === updated.id ? updated : song);
    if (playlist) playlist.songs = playlist.songs.map(song => song.id === updated.id ? updated : song);
    renderNav(); renderTracks(); renderNow(); renderQueue();
  }
  async function refresh() {
    const [library, lists] = await Promise.all([api('/api/songs'), api('/api/playlists')]);
    songs = library; playlists = lists;
    if (view === 'playlist' && playlist) playlist = await api(`/api/playlists/${playlist.id}`);
    renderNav(); renderView(); renderNow(); renderQueue();
  }
  function renderNav() {
    $('library-count').textContent = songs.length;
    $('favorite-count').textContent = songs.filter(s => s.favorite).length;
    document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
    $('playlists').innerHTML = playlists.length ? playlists.map(p => `<button class="playlist-item${view === 'playlist' && playlist?.id === p.id ? ' active' : ''}" data-playlist="${esc(p.id)}"><span class="playlist-icon">${icon('music')}</span><span>${esc(p.name)}</span><small>${p.song_count}</small></button>`).join('') : '<p class="playlist-hint">Tạo một danh sách cho<br>mỗi tâm trạng của bạn.</p>';
  }
  async function navigate(type, id) {
    const token = ++navigation;
    const detail = type === 'playlist' ? await api(`/api/playlists/${id}`) : null;
    if (token !== navigation) return;
    view = type; playlist = detail; $('search').value = ''; $('sort').value = 'default';
    $('sidebar').classList.remove('open'); renderNav(); renderView();
  }
  function sourceSongs() {
    if (view === 'favorites') return songs.filter(s => s.favorite);
    if (view === 'recent') return songs.filter(s => s.last_played_at).sort((a,b) => b.last_played_at.localeCompare(a.last_played_at));
    if (view === 'playlist') return (playlist?.songs || []).map(s => songById(s.id)).filter(Boolean);
    return [...songs];
  }
  function renderView() {
    const names = {library:'Thư viện của bạn', favorites:'Bài hát yêu thích', recent:'Nghe gần đây', playlist:playlist?.name};
    const desc = {library:'Tất cả những giai điệu bạn muốn giữ lại.', favorites:'Những bản nhạc luôn có một vị trí đặc biệt.', recent:'Trở lại với những giai điệu vừa lắng nghe.', playlist:'Một danh sách, một tâm trạng. Sắp xếp bằng nút mũi tên hoặc kéo thả.'};
    $('view-title').firstChild.textContent = names[view];
    $('view-description').textContent = desc[view]; $('breadcrumb-view').textContent = view === 'library' ? 'Thư viện' : names[view];
    $('hero').hidden = view !== 'library';
    for (const id of ['rename-playlist','delete-playlist','playlist-add']) $(id).hidden = view !== 'playlist';
    $('sort').options[0].textContent = view === 'playlist' ? 'Thứ tự danh sách' : view === 'recent' ? 'Vừa nghe gần đây' : 'Mới thêm gần đây';
    renderTracks();
  }
  function actionButton(action, glyph, label, extra = '') {
    return `<button class="icon-button ${extra}" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}">${icon(glyph)}</button>`;
  }
  function renderTracks() {
    const source = sourceSongs(), query = normalize($('search').value.trim());
    displayed = source.filter(s => !query || normalize(`${s.title} ${s.artist} ${s.album}`).includes(query));
    const sort = $('sort').value;
    if (sort === 'title' || sort === 'artist') displayed.sort((a,b) => a[sort].localeCompare(b[sort], 'vi'));
    if (sort === 'duration') displayed.sort((a,b) => a.duration - b.duration);
    $('view-count').textContent = source.length;
    $('library-summary').textContent = `${displayed.length} bài hát · ${Math.round(displayed.reduce((sum,s) => sum+s.duration,0)/60)} phút`;
    $('play-all').disabled = !displayed.length; $('hero-play').disabled = !songs.length;
    $('tracks').innerHTML = displayed.map((song,index) => {
      const reorder = view === 'playlist' && !query && sort === 'default';
      return `<div class="track-row${song.id === currentId ? ' current' : ''}" data-id="${esc(song.id)}" tabindex="0" role="group" aria-label="${esc(song.title)} — ${esc(song.artist)}" ${reorder ? 'draggable="true"' : ''}>
      <span class="track-index"><span class="track-number">${song.id === currentId && !audio.paused ? '♫' : index+1}</span><span class="mini-play">${icon('play')}</span></span>
      <span class="track-info">${cover(song)}<span class="track-info-text"><span class="track-title">${esc(song.title)}</span><span class="track-artist">${esc(song.artist)}</span></span></span>
      <span class="album-col">${esc(song.album)}</span><span class="format-col"><span class="format-tag">${esc(song.format)}</span></span><span class="duration-col">${time(song.duration)}</span>
      <span class="track-actions">${actionButton('favorite','heart',song.favorite ? 'Bỏ yêu thích' : 'Yêu thích',`favorite${song.favorite ? ' active' : ''}`)}${reorder ? actionButton('up','up','Đưa bài lên trước') + actionButton('down','down','Đưa bài xuống sau') : actionButton('add','plus','Thêm vào danh sách phát','row-add') + actionButton('edit','edit','Sửa thông tin bài hát','row-edit')}${actionButton(view === 'playlist' ? 'remove' : 'delete',view === 'playlist' ? 'minus' : 'trash',view === 'playlist' ? 'Bỏ khỏi danh sách phát' : 'Xóa bài hát')}</span></div>`;
    }).join('');
    $('empty-state').hidden = !!displayed.length;
    const empty = query ? ['Không tìm thấy bài hát phù hợp.', 'Thử tìm tên bài, nghệ sĩ hoặc album khác.'] : view === 'favorites' ? ['Giữ lại những giai điệu bạn yêu.', 'Bấm trái tim bên cạnh bài hát để thêm vào đây.'] : view === 'recent' ? ['Giai điệu tiếp theo đang chờ bạn.', 'Những bài đã phát sẽ xuất hiện tại đây.'] : view === 'playlist' ? ['Danh sách này đang chờ những giai điệu.', 'Thêm bài hát từ thư viện để bắt đầu.'] : ['Mọi bộ sưu tập đều bắt đầu từ một bài hát.', 'Thêm những bản nhạc đầu tiên và để BEATLOOM lo phần còn lại.'];
    $('empty-title').textContent = empty[0]; $('empty-description').textContent = empty[1];
    $('empty-action').innerHTML = icon(query ? 'close' : view === 'playlist' ? 'plus' : view === 'library' ? 'upload' : 'library') + (query ? 'Xóa tìm kiếm' : view === 'playlist' ? 'Thêm bài hát' : view === 'library' ? 'Chọn file nhạc' : 'Đến thư viện');
  }
  function renderNow() {
    const song = currentSong();
    $('now-title').textContent = song?.title || 'Sẵn sàng cho một giai điệu?'; $('now-artist').textContent = song?.artist || 'Chọn bài hát để bắt đầu';
    $('now-cover').style.setProperty('--cover-tone',`${song ? coverTone(song) : 35}%`);
    $('now-favorite').disabled = !song; $('now-favorite').classList.toggle('active',!!song?.favorite);
    $('now-favorite').title = song?.favorite ? 'Bỏ yêu thích bài đang phát' : 'Yêu thích bài đang phát';
    $('now-favorite').setAttribute('aria-pressed',String(!!song?.favorite));
    $('play').innerHTML = icon(audio.paused ? 'play' : 'pause'); $('play').title = audio.paused ? 'Phát' : 'Tạm dừng';
    document.body.classList.toggle('is-playing', !audio.paused);
    $('shuffle').classList.toggle('active',shuffle); $('shuffle').setAttribute('aria-pressed', String(shuffle));
    $('repeat').classList.toggle('active',repeat !== 'off'); $('repeat').classList.toggle('one',repeat === 'one'); $('repeat').setAttribute('aria-pressed',String(repeat !== 'off'));
    $('repeat').title = `Lặp lại: ${repeat === 'off' ? 'tắt' : repeat === 'one' ? 'một bài' : 'toàn bộ'}`;
    $('mute').innerHTML = icon(audio.muted || audio.volume === 0 ? 'muted' : 'volume'); $('mute').title = audio.muted ? 'Bật tiếng' : 'Tắt tiếng';
    $('volume').value = audio.muted ? 0 : Math.round(audio.volume*100); $('volume').style.setProperty('--progress', `${$('volume').value}%`);
    $('play').disabled = !song && !displayed.length; $('previous').disabled = $('next').disabled = !queue.length;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
      if (song && 'MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({title:song.title,artist:song.artist,album:song.album});
      else navigator.mediaSession.metadata = null;
    }
  }
  function renderQueue() {
    $('queue-summary').textContent = queue.length ? `${queue.length} bài hát · ${position+1} / ${queue.length}${shuffle ? ' · Xáo trộn' : ''}` : 'Chọn một bài hát để bắt đầu.';
    $('queue-list').innerHTML = queue.map((id,index) => {
      const song = songById(id); if (!song) return '';
      return `<button class="queue-item${index === position ? ' active' : ''}" data-position="${index}">${cover(song)}<span class="queue-info"><span class="track-title">${esc(song.title)}</span><span class="track-artist">${esc(song.artist)}</span></span><small>${time(song.duration)}</small></button>`;
    }).join('');
  }
  function randomize(ids) {
    const array = [...ids];
    for (let i = array.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [array[i],array[j]] = [array[j],array[i]]; }
    return array;
  }
  function startList(list, id = list[0]?.id) {
    if (!list.length || !id) return;
    baseQueue = list.map(s => s.id); queue = shuffle ? [id,...randomize(baseQueue.filter(i => i !== id))] : [...baseQueue];
    return playAt(queue.indexOf(id));
  }
  async function prepareAudio() {
    try {
      if (!audioContext) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        audioContext = new Context();
        const source = audioContext.createMediaElementSource(audio);
        analyser = audioContext.createAnalyser(); analyser.fftSize = 128;
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser); analyser.connect(audioContext.destination);
      }
      if (audioContext.state === 'suspended') await audioContext.resume();
    } catch { /* Audio playback remains available without the visualizer. */ }
  }
  function drawSpectrum() {
    cancelAnimationFrame(visualFrame);
    if (!analyser || audio.paused || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    analyser.getByteFrequencyData(frequencyData);
    document.querySelectorAll('.audio-bars i').forEach((bar,index) => {
      const slice = frequencyData.slice(index*8,index*8+8);
      const amplitude = slice.reduce((sum,value) => sum+value,0)/slice.length;
      bar.style.height = `${Math.max(3,amplitude/255*22)}px`;
    });
    visualFrame = requestAnimationFrame(drawSpectrum);
  }
  document.addEventListener('visibilitychange', drawSpectrum);
  async function playAt(index) {
    const song = songById(queue[index]); if (!song) return;
    const request = ++playRequest; position = index; currentId = song.id; restoreTime = null;
    audio.src = `/uploads/${encodeURIComponent(song.filename)}`; $('seek').value = 0; $('seek').style.setProperty('--progress','0%'); $('elapsed').textContent = '0:00'; $('duration').textContent = time(song.duration);
    renderTracks(); renderNow(); renderQueue(); savePlayer();
    try {
      await prepareAudio();
      if (request !== playRequest) return;
      await audio.play();
      if (request !== playRequest) return;
      const updated = await api(`/api/songs/${song.id}/played`, 'POST'); updateSong(updated);
    } catch (error) {
      if (request === playRequest && error.name !== 'AbortError') toast(error.name === 'NotAllowedError' ? 'Bấm Phát để bắt đầu nghe nhạc.' : 'Không thể phát bài hát. Thử file MP3 hoặc WAV nếu trình duyệt không hỗ trợ định dạng này.',true);
    }
  }
  async function togglePlayback() {
    if (!currentSong()) return startList(displayed);
    if (audio.paused) { try { await prepareAudio(); await audio.play(); } catch { toast('Không thể phát file âm thanh này.',true); } }
    else audio.pause();
  }
  function next(auto = false) {
    if (!queue.length) return;
    if (auto && repeat === 'one') return playAt(position);
    if (position+1 < queue.length) return playAt(position+1);
    if (!auto || repeat === 'all') return playAt(0);
    renderNow(); savePlayer();
  }
  function previous() { if (audio.currentTime > 3) {audio.currentTime=0; return;} if (queue.length) return playAt((position-1+queue.length)%queue.length); }
  function toggleQueue(force) {
    const open = typeof force === 'boolean' ? force : $('queue-panel').hidden;
    $('queue-panel').hidden = !open; $('queue-toggle').setAttribute('aria-expanded',String(open)); $('queue-toggle').classList.toggle('active',open); renderQueue();
  }
  function showDialog(title, content, submitLabel, action) {
    lastFocus = document.activeElement; dialogAction = action;
    $('dialog-title').textContent = title; $('dialog-content').innerHTML = content; $('dialog-submit').textContent = submitLabel;
    $('dialog-submit').disabled = false; $('dialog-error').textContent = '';
    $('dialog').showModal(); ($('dialog-content').querySelector('input:not(:disabled)') || $('dialog-submit')).focus();
  }
  function closeDialog() { $('dialog').close(); dialogAction = null; lastFocus?.focus(); }
  $('dialog').addEventListener('close', () => { lastFocus?.focus(); });
  $('dialog-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!dialogAction) return; $('dialog-submit').disabled = true; $('dialog-error').textContent = '';
    try { await dialogAction(new FormData($('dialog-form'))); closeDialog(); }
    catch (error) { $('dialog-error').textContent = error.message; }
    finally { $('dialog-submit').disabled = false; }
  });
  $('dialog-close').onclick = $('dialog-cancel').onclick = closeDialog;
  $('dialog').addEventListener('click',event => { if (event.target === $('dialog')) { const r=$('dialog').getBoundingClientRect(); if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) closeDialog(); } });
  function createPlaylist() {
    showDialog('Danh sách phát mới','<label class="field">Tên danh sách<input name="name" placeholder="Ví dụ: Một chiều bình yên" maxlength="80" required autocomplete="off"></label>','Tạo danh sách',async data => {
      const result=await api('/api/playlists','POST',{name:data.get('name')}); await refresh(); await navigate('playlist',result.id); toast('Đã tạo danh sách phát.');
    });
  }
  function addToPlaylist(songId) {
    if (!playlists.length) { createPlaylist(); toast('Tạo danh sách, sau đó thêm bài hát từ thư viện.'); return; }
    showDialog('Thêm vào danh sách phát',`<div class="picker">${playlists.map((p,i) => `<label class="picker-row"><input type="radio" name="playlist" value="${esc(p.id)}" ${i===0?'checked':''}><span>${esc(p.name)}</span></label>`).join('')}</div>`,'Thêm bài hát',async data => {
      const result = await api(`/api/playlists/${data.get('playlist')}/songs`,'POST',{songId}); await refresh(); toast(result.added ? 'Đã thêm bài hát vào danh sách.' : 'Bài hát đã có trong danh sách này.');
    });
  }
  function playlistPicker() {
    if (!playlist) return;
    const id=playlist.id, existing=new Set(playlist.songs.map(s=>s.id));
    showDialog('Thêm bài hát',songs.length ? `<div class="picker">${songs.map(s => `<label class="picker-row${existing.has(s.id)?' disabled':''}"><input type="checkbox" name="songs" value="${esc(s.id)}" ${existing.has(s.id)?'checked disabled':''}><span><span class="track-title">${esc(s.title)}</span><span class="track-artist">${esc(s.artist)}${existing.has(s.id)?' · Đã có trong danh sách':''}</span></span></label>`).join('')}</div>` : '<p class="muted">Thư viện đang trống. Hãy thêm file nhạc vào thư viện trước.</p>','Thêm đã chọn',async data => {
      const ids=data.getAll('songs'); if (!ids.length) throw new Error('Hãy chọn ít nhất một bài hát.');
      const result=await api(`/api/playlists/${id}/songs`,'POST',{songIds:ids}); await refresh(); toast(`Đã thêm ${result.added} bài hát.`);
    });
  }
  async function favorite(id) { const song=songById(id); if(song) updateSong(await api(`/api/songs/${id}`,'PATCH',{favorite:!song.favorite})); }
  function editSong(id) {
    const song=songById(id); if(!song)return;
    showDialog('Thông tin bài hát',['title','artist','album'].map((key,i)=>`<label class="field">${['Tên bài hát','Nghệ sĩ','Album'][i]}<input name="${key}" value="${esc(song[key])}" maxlength="300" required></label>`).join(''),'Lưu thay đổi',async data=> {updateSong(await api(`/api/songs/${id}`,'PATCH',Object.fromEntries(data)));toast('Đã cập nhật thông tin bài hát.');});
  }
  function removeFromQueue(id) {
    const oldPosition=position, deletingCurrent=id===currentId;
    queue=queue.filter(item=>item!==id);baseQueue=baseQueue.filter(item=>item!==id);
    if(deletingCurrent){++playRequest;audio.pause();audio.removeAttribute('src');audio.load();currentId=null;position=-1;queue=[];baseQueue=[];$('seek').value=0;$('seek').disabled=true;$('seek').style.setProperty('--progress','0%');$('elapsed').textContent=$('duration').textContent='0:00';}
    else position=currentId ? queue.indexOf(currentId) : Math.min(oldPosition,queue.length-1);
    savePlayer();
  }
  function deleteSong(id) {
    const song=songById(id);if(!song)return;
    showDialog('Xóa bài hát?',`<p class="muted">“${esc(song.title)}” sẽ bị xóa khỏi thư viện, các danh sách phát và thiết bị. Thao tác này không thể hoàn tác.</p>`,'Xóa bài hát',async()=>{await api(`/api/songs/${id}`,'DELETE');removeFromQueue(id);await refresh();toast('Đã xóa bài hát.');});
  }
  async function reorder(ids) {
    if(!playlist)return;
    await api(`/api/playlists/${playlist.id}/reorder`,'PUT',{songIds:ids});
    playlist.songs=ids.map(id=>songById(id));renderTracks();
  }
  async function moveSong(id,direction) {
    const ids=playlist.songs.map(s=>s.id), from=ids.indexOf(id), to=from+direction;
    if(to<0||to>=ids.length)return;[ids[from],ids[to]]=[ids[to],ids[from]];await reorder(ids);
    $('tracks').querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus();
  }
  $('tracks').addEventListener('click',safely(async event=>{
    const row=event.target.closest('[data-id]');if(!row)return;const id=row.dataset.id;
    switch(event.target.closest('[data-action]')?.dataset.action){
      case 'favorite':return favorite(id);case 'add':return addToPlaylist(id);case 'edit':return editSong(id);case 'delete':return deleteSong(id);
      case 'remove':await api(`/api/playlists/${playlist.id}/songs/${id}`,'DELETE');return refresh();
      case 'up':return moveSong(id,-1);case 'down':return moveSong(id,1);
      default:if(id===currentId)return togglePlayback();return startList(displayed,id);
    }
  }));
  $('tracks').addEventListener('keydown',safely(event=>{if(event.target.matches('.track-row')&&(event.key==='Enter'||event.code==='Space')){event.preventDefault();return startList(displayed,event.target.dataset.id);}}));
  $('tracks').addEventListener('dragstart',event=>{const row=event.target.closest('.track-row[draggable]');if(!row||event.target.closest('button'))return;draggingId=row.dataset.id;event.dataTransfer.setData('text/plain',draggingId);event.dataTransfer.effectAllowed='move';});
  $('tracks').addEventListener('dragover',event=>{if(draggingId)event.preventDefault();});
  $('tracks').addEventListener('dragend',()=>draggingId=null);
  $('tracks').addEventListener('drop',safely(async event=>{event.preventDefault();const target=event.target.closest('.track-row')?.dataset.id;if(!draggingId||!target||target===draggingId||!playlist)return;const ids=playlist.songs.map(s=>s.id);const from=ids.indexOf(draggingId),to=ids.indexOf(target);ids.splice(from,1);ids.splice(to,0,draggingId);draggingId=null;await reorder(ids);}));
  document.querySelectorAll('[data-view]').forEach(el=>el.onclick=safely(()=>navigate(el.dataset.view)));
  $('playlists').onclick=safely(event=>{const button=event.target.closest('[data-playlist]');if(button)return navigate('playlist',button.dataset.playlist);});
  $('create-playlist').onclick=createPlaylist;
  $('playlist-add').onclick=playlistPicker;
  $('rename-playlist').onclick=()=>{const id=playlist.id;showDialog('Đổi tên danh sách',`<label class="field">Tên danh sách<input name="name" maxlength="80" value="${esc(playlist.name)}" required></label>`,'Lưu',async data=>{await api(`/api/playlists/${id}`,'PUT',{name:data.get('name')});await refresh();toast('Đã đổi tên danh sách.');});};
  $('delete-playlist').onclick=()=>{const id=playlist.id;showDialog('Xóa danh sách phát?',`<p class="muted">Xóa “${esc(playlist.name)}”? Các bài hát vẫn được giữ trong thư viện.</p>`,'Xóa danh sách',async()=>{await api(`/api/playlists/${id}`,'DELETE');await navigate('library');await refresh();toast('Đã xóa danh sách phát.');});};
  $('empty-action').onclick=safely(()=>{if($('search').value){$('search').value='';renderTracks();}else if(view==='playlist')playlistPicker();else if(view==='library')chooseFiles();else return navigate('library');});
  $('search').oninput=$('sort').onchange=()=>{renderTracks();renderNow();};
  $('play-all').onclick=safely(()=>startList(displayed));$('hero-play').onclick=safely(()=>startList(songs));
  $('play').onclick=safely(togglePlayback);$('next').onclick=safely(()=>next());$('previous').onclick=safely(previous);
  $('shuffle').onclick=()=>{shuffle=!shuffle;if(currentId){queue=shuffle?[currentId,...randomize(baseQueue.filter(id=>id!==currentId))]:[...baseQueue];position=queue.indexOf(currentId);}renderNow();renderQueue();savePlayer();};
  $('repeat').onclick=()=>{repeat=repeat==='off'?'all':repeat==='all'?'one':'off';renderNow();savePlayer();};
  $('now-favorite').onclick=safely(()=>favorite(currentId));
  $('queue-toggle').onclick=()=>toggleQueue();$('close-queue').onclick=()=>toggleQueue(false);
  $('queue-list').onclick=safely(event=>{const el=event.target.closest('[data-position]');if(el)return playAt(Number(el.dataset.position));});
  $('mute').onclick=()=>{if(!audio.muted&&audio.volume===0){audio.volume=previousVolume||.75;audio.muted=false;}else audio.muted=!audio.muted;renderNow();savePlayer();};
  $('volume').oninput=()=>{audio.volume=Number($('volume').value)/100;audio.muted=false;if(audio.volume>0)previousVolume=audio.volume;renderNow();savePlayer();};
  $('seek').oninput=()=>{if(Number.isFinite(audio.duration)){audio.currentTime=Number($('seek').value)/1000*audio.duration;updateProgress();savePlayer();}};
  function updateProgress(){const duration=Number.isFinite(audio.duration)?audio.duration:0;const percent=duration?audio.currentTime/duration*100:0;$('seek').value=Math.round(percent*10);$('seek').style.setProperty('--progress',`${percent}%`);$('elapsed').textContent=time(audio.currentTime);$('duration').textContent=time(duration);$('seek').disabled=!duration;}
  audio.addEventListener('loadedmetadata',()=>{if(restoreTime!==null){audio.currentTime=Math.min(restoreTime,Math.max(0,audio.duration-.1));restoreTime=null;}updateProgress();});
  audio.addEventListener('timeupdate',()=>{updateProgress();if(Date.now()-lastSave>3000){savePlayer();lastSave=Date.now();}});
  for(const event of ['play','pause'])audio.addEventListener(event,()=>{renderNow();renderTracks();savePlayer();drawSpectrum();});
  audio.addEventListener('ended',safely(()=>next(true)));
  audio.addEventListener('error',()=>{if(currentId)toast('Không tải được âm thanh. File có thể bị thiếu hoặc trình duyệt chưa hỗ trợ định dạng này.',true);renderNow();});
  window.addEventListener('pagehide',savePlayer);
  function chooseFiles(){if(!uploading)$('file-input').click();}
  document.querySelectorAll('[data-upload]').forEach(el=>el.onclick=chooseFiles);$('dropzone').onclick=chooseFiles;
  $('file-input').onchange=()=>{if($('file-input').files.length)uploadFiles([...$('file-input').files]);$('file-input').value='';};
  for(const event of ['dragenter','dragover'])$('dropzone').addEventListener(event,e=>{e.preventDefault();if(!uploading)$('dropzone').classList.add('dragging');});
  for(const event of ['dragleave','drop'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.remove('dragging');});
  $('dropzone').addEventListener('drop',event=>{if(event.dataTransfer.files.length)uploadFiles([...event.dataTransfer.files]);});
  window.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();});
  window.addEventListener('drop',event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();});
  function uploadUI(active,percent=0){uploading=active;$('upload-progress').hidden=!active;$('upload-progress').value=percent;$('dropzone').disabled=active;document.querySelectorAll('[data-upload]').forEach(el=>el.disabled=active);$('upload-title').innerHTML=active?(percent===100?'Đang đọc thông tin bài hát…':`Đang tải nhạc lên… ${percent}%`):'Kéo thả nhạc vào đây <span>hoặc chọn từ thiết bị</span>';$('upload-detail').textContent=active?'Vui lòng giữ trang mở đến khi xử lý hoàn tất.':'MP3, FLAC, WAV, OGG, M4A, AAC, OPUS, WEBM · Tối đa 200 MB/file · 50 file/lần';}
  function uploadFiles(files){
    if(uploading){toast('Đang xử lý lượt tải trước. Vui lòng đợi.');return;}
    if(files.length>50){toast('Chọn tối đa 50 file mỗi lần.',true);return;}
    const invalid=files.find(f=>!(/\.(mp3|flac|wav|ogg|m4a|aac|opus|webm)$/i.test(f.name))||f.size>200*1024*1024||f.size===0);
    if(invalid){toast(`“${invalid.name}” không hợp lệ. Chọn file âm thanh được hỗ trợ, dung lượng từ 1 byte đến 200 MB.`,true);return;}
    const form=new FormData();files.forEach(file=>form.append('files',file));const xhr=new XMLHttpRequest();xhr.open('POST','/api/songs/upload');xhr.timeout=30*60*1000;uploadUI(true);
    xhr.upload.onprogress=e=>{if(e.lengthComputable)uploadUI(true,Math.round(e.loaded/e.total*100));};
    xhr.onload=async()=>{uploadUI(false);try{const result=JSON.parse(xhr.responseText);if(xhr.status>=400)throw new Error(result.error||'Tải lên thất bại.');await refresh();toast(`Đã thêm ${result.uploaded.length} bài hát${result.errors.length?` · ${result.errors.length} file bị hỏng hoặc không đọc được`:'.'}`,!!result.errors.length);}catch(error){toast(error.message,true);}};
    xhr.onerror=xhr.ontimeout=()=>{uploadUI(false);toast('Mất kết nối hoặc quá thời gian tải. Vui lòng kiểm tra thư viện trước khi thử lại.',true);};xhr.send(form);
  }
  $('menu-button').onclick=()=>{$('sidebar').classList.toggle('open');};
  document.addEventListener('click',event=>{if(!$('sidebar').contains(event.target)&&!$('menu-button').contains(event.target))$('sidebar').classList.remove('open');});
  document.addEventListener('keydown',safely(event=>{
    if(event.key==='Escape'){toggleQueue(false);$('sidebar').classList.remove('open');return;}
    if(event.defaultPrevented||document.querySelector('dialog[open]')||event.target.closest('input,textarea,select,button,[contenteditable]')||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.code==='Space'){event.preventDefault();return togglePlayback();}
    if(event.key==='/'){event.preventDefault();$('search').focus();}
    if(event.key==='ArrowRight'&&Number.isFinite(audio.duration)){event.preventDefault();audio.currentTime=Math.min(audio.duration,audio.currentTime+5);}
    if(event.key==='ArrowLeft'){event.preventDefault();audio.currentTime=Math.max(0,audio.currentTime-5);}
    if(event.key.toLowerCase()==='m')$('mute').click();
  }));
  if('mediaSession' in navigator){for(const [action,handler]of Object.entries({play:async()=>{await prepareAudio();await audio.play();},pause:()=>audio.pause(),previoustrack:previous,nexttrack:()=>next(),seekbackward:details=>{audio.currentTime=Math.max(0,audio.currentTime-(details.seekOffset||10));},seekforward:details=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+(details.seekOffset||10));},seekto:details=>{if(Number.isFinite(details.seekTime))audio.currentTime=details.seekTime;}})){try{navigator.mediaSession.setActionHandler(action,safely(handler));}catch{/* Some browsers expose a subset of actions. */}}}
  document.addEventListener('beatloom:import-finished', safely(async event => {
    await refresh();
    toast(`Đã thêm “${event.detail.title}” vào thư viện dưới dạng FLAC.`);
  }));
  document.addEventListener('beatloom:play-import', safely(async event => {
    await refresh();
    const song = songById(event.detail.songId);
    if (!song) { toast('Bài hát đã bị xóa khỏi thư viện.', true); return; }
    await navigate('library');
    await startList(songs, song.id);
  }));
  async function init(){
    audio.volume=typeof preferences.volume==='number'?Math.max(0,Math.min(1,preferences.volume)):.75;audio.muted=preferences.muted===true;shuffle=preferences.shuffle===true;repeat=['off','all','one'].includes(preferences.repeat)?preferences.repeat:'off';
    try{await refresh();
      const restored=songById(preferences.currentId);
      if(restored){baseQueue=Array.isArray(preferences.baseQueue)?[...new Set(preferences.baseQueue)].filter(songById):[restored.id];queue=Array.isArray(preferences.queue)?[...new Set(preferences.queue)].filter(songById):[restored.id];if(!queue.includes(restored.id))queue.unshift(restored.id);if(!baseQueue.includes(restored.id))baseQueue.unshift(restored.id);currentId=restored.id;position=queue.indexOf(currentId);restoreTime=Number.isFinite(preferences.time)?Math.max(0,preferences.time):0;audio.src=`/uploads/${encodeURIComponent(restored.filename)}`;renderNow();renderTracks();renderQueue();}
    }catch(error){toast('Không thể tải thư viện. Hãy tải lại trang khi máy chủ sẵn sàng.',true);}
    $('main').setAttribute('aria-busy','false');
    renderNow();
  }
  init();
})();
