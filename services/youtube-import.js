const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { nanoid } = require('nanoid');
const { runProcess } = require('./media-process');
const metadata = import('music-metadata');
const ROOT = path.join(__dirname, '..');
const ACTIVE = ['queued', 'fetching', 'downloading', 'converting'];
const MAX_DURATION = 3600;
const MAX_SOURCE = 200 * 1024 * 1024;
const MAX_FLAC = 500 * 1024 * 1024;

function normalizeYoutubeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Hãy nhập liên kết video YouTube hợp lệ.');
  let url;
  try { url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`); } catch { throw new Error('Liên kết YouTube không hợp lệ.'); }
  const hosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);
  if (!['http:', 'https:'].includes(url.protocol) || !hosts.has(url.hostname) || url.username || url.password || url.port) throw new Error('Chỉ hỗ trợ liên kết video từ youtube.com hoặc youtu.be.');
  let id;
  if (url.hostname.endsWith('youtu.be')) id = url.pathname.slice(1);
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else id = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1];
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) throw new Error('Hãy dùng liên kết của một video, không phải kênh hoặc danh sách phát.');
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}
function friendlyError(error) {
  const message = error.message || '';
  if (message === 'CANCELLED') return 'Đã hủy chuyển đổi.';
  if (/TIMEOUT|timed out|Timeout/i.test(message)) return 'Quá thời gian xử lý. Kiểm tra kết nối rồi thử lại.';
  if (/sign in|confirm.*bot|429|captcha/i.test(message)) return 'YouTube yêu cầu xác minh hoặc đang giới hạn lượt tải. Hãy thử lại sau hoặc dùng video công khai khác.';
  if (/unavailable|private video|removed|not available|403|members.only|copyright/i.test(message)) return 'Không truy cập được âm thanh của video này. Video có thể bị giới hạn hoặc không còn khả dụng.';
  if (/^LIMIT_DURATION$/.test(message)) return 'Chỉ hỗ trợ video đã phát hành, dài tối đa 60 phút; không hỗ trợ livestream đang diễn ra.';
  if (/LIMIT_SIZE|larger than max-filesize/i.test(message)) return 'File vượt giới hạn 200 MB nguồn hoặc 500 MB FLAC. Hãy chọn video ngắn hơn.';
  if (/ENOSPC/i.test(message)) return 'Thiết bị không đủ dung lượng để lưu file FLAC.';
  if (/ENOENT|EACCES/.test(message)) return 'Công cụ chuyển đổi chưa sẵn sàng. Chạy bước cài đặt YouTube trong hướng dẫn của ứng dụng.';
  return 'Không thể chuyển video này. Kiểm tra liên kết, kết nối mạng hoặc thử video công khai khác.';
}
function createImportService(db, options = {}) {
  const uploadDir = options.uploadDir || process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
  const workRoot = options.workDir || process.env.IMPORT_DIR || path.join(ROOT, '.imports');
  const ytdlp = options.ytdlp || process.env.YTDLP_PATH || path.join(ROOT, '.tools', 'python', process.platform === 'win32' ? 'Scripts/yt-dlp.exe' : 'bin/yt-dlp');
  let ffmpeg = options.ffmpeg || process.env.FFMPEG_PATH;
  if (!ffmpeg) { try { ffmpeg = require('ffmpeg-static'); } catch { /* Report unavailable in capabilities. */ } }
  const run = options.run || runProcess;
  db.exec(`CREATE TABLE IF NOT EXISTS youtube_imports (
    id TEXT PRIMARY KEY, video_id TEXT NOT NULL, source_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '', artist TEXT NOT NULL DEFAULT '',
    song_id TEXT REFERENCES songs(id) ON DELETE SET NULL, error TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ); CREATE INDEX IF NOT EXISTS idx_youtube_imports_video ON youtube_imports(video_id);`);
  const interrupted = db.prepare("SELECT id FROM youtube_imports WHERE status IN ('queued','fetching','downloading','converting')").all();
  db.prepare("UPDATE youtube_imports SET status='failed',error='Máy chủ đã khởi động lại. Hãy thử chuyển đổi lần nữa.' WHERE status IN ('queued','fetching','downloading','converting')").run();
  for (const item of interrupted) if (/^[\w-]+$/.test(item.id)) fs.rmSync(path.join(workRoot,item.id), {recursive:true,force:true});
  let running = null, controller = null, closing = false, workPromise = null;
  function capabilities() {
    const executable = file => { try { fs.accessSync(file,fs.constants.X_OK); return true; } catch { return false; } };
    return { available: executable(ytdlp) && executable(ffmpeg), maxDurationMinutes: 60, maxSourceMB:200, maxFlacMB:500 };
  }
  function get(id) {
    const item = db.prepare('SELECT * FROM youtube_imports WHERE id=?').get(id);
    if (item?.song_id) item.song = db.prepare('SELECT * FROM songs WHERE id=?').get(item.song_id) || null;
    return item;
  }
  function list() { return db.prepare('SELECT id FROM youtube_imports ORDER BY created_at DESC,rowid DESC LIMIT 30').all().map(item=>get(item.id)); }
  function update(id, changes) {
    const allowed = ['status','progress','title','artist','song_id','error'];
    const entries = Object.entries(changes).filter(([key])=>allowed.includes(key));
    db.prepare(`UPDATE youtube_imports SET ${entries.map(([key])=>`${key}=?`).join(',')},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(...entries.map(([,value])=>value),id);
  }
  function create(value) {
    const video = normalizeYoutubeUrl(value);
    if (closing || !capabilities().available) throw Object.assign(new Error('Công cụ chuyển đổi chưa sẵn sàng. Hãy chạy bước cài đặt YouTube trong README.'),{status:503});
    const existing = db.prepare("SELECT id FROM youtube_imports WHERE video_id=? AND (status IN ('queued','fetching','downloading','converting') OR (status='completed' AND song_id IS NOT NULL)) ORDER BY created_at DESC LIMIT 1").get(video.id);
    if (existing) return { job:get(existing.id),existing:true };
    if (db.prepare("SELECT COUNT(*) AS n FROM youtube_imports WHERE status IN ('queued','fetching','downloading','converting')").get().n >= 5) throw Object.assign(new Error('Hàng đợi đã có 5 video. Vui lòng đợi hoặc hủy một video.'),{status:429});
    const id=nanoid();
    db.prepare('INSERT INTO youtube_imports (id,video_id,source_url) VALUES (?,?,?)').run(id,video.id,video.url);
    queueMicrotask(pump);
    return {job:get(id),existing:false};
  }
  async function processJob(job) {
    const folder=path.join(workRoot,job.id); let destination=null, committed=false;
    const signal=controller.signal;
    const checkCancelled=()=>{if(signal.aborted)throw new Error('CANCELLED');};
    const common=['--ignore-config','--no-plugin-dirs','--no-cache-dir','--no-playlist','--no-colors','--newline','--socket-timeout','20','--retries','2','--fragment-retries','2','--no-js-runtimes','--js-runtimes',`node:${process.execPath}`];
    try {
      await fsp.mkdir(folder,{recursive:true}); await fsp.mkdir(uploadDir,{recursive:true});checkCancelled();
      update(job.id,{status:'fetching',progress:0});
      const raw=await run(ytdlp,[...common,'--dump-single-json','--skip-download','--',job.source_url],{signal,timeout:90000});checkCancelled();
      const info=JSON.parse(raw);
      if(info.id!==job.video_id || !['youtube','youtube:tab'].includes(String(info.extractor||'youtube').toLowerCase()))throw new Error('INVALID_VIDEO');
      if(!Number.isFinite(info.duration)||info.duration<=0||info.duration>MAX_DURATION||info.is_live||['is_live','is_upcoming'].includes(info.live_status))throw new Error('LIMIT_DURATION');
      const title=String(info.track||info.title||'YouTube audio').slice(0,300),artist=String(info.artist||info.uploader||info.channel||'YouTube').slice(0,300);
      update(job.id,{title,artist,status:'downloading',progress:5});
      const infoFile=path.join(folder,'video.json');await fsp.writeFile(infoFile,raw,{mode:0o600});checkCancelled();
      let lastProgress=5;
      await run(ytdlp,[...common,'--load-info-json',infoFile,'--no-simulate','--no-write-playlist-metafiles','--fixup','never','--format','bestaudio/best','--max-filesize',String(MAX_SOURCE),'--no-part','--progress','--progress-delta','0.4','--progress-template','download:BEATLOOM_PROGRESS:%(progress.downloaded_bytes)s:%(progress.total_bytes,progress.total_bytes_estimate)s','--output',path.join(folder,'source.%(ext)s')],{
        signal,timeout:15*60*1000,onLine:line=>{
          const downloaded=line.match(/^BEATLOOM_PROGRESS:(\d+):/);
          if(downloaded&&Number(downloaded[1])>MAX_SOURCE)throw new Error('LIMIT_SIZE');
          const match=line.match(/^BEATLOOM_PROGRESS:(\d+):(\d+)/);
          if(match&&Number(match[2])>0){const progress=Math.max(5,Math.min(78,Math.round(5+Number(match[1])/Number(match[2])*73)));if(progress>lastProgress){lastProgress=progress;update(job.id,{progress});}}
        }
      });checkCancelled();
      const files=(await fsp.readdir(folder)).filter(file=>/^source\.[a-z0-9]+$/i.test(file));
      if(files.length!==1)throw new Error('SOURCE_MISSING');
      const source=path.join(folder,files[0]);if((await fsp.stat(source)).size>MAX_SOURCE)throw new Error('LIMIT_SIZE');
      const mm=await metadata;const sourceInfo=await mm.parseFile(source,{duration:true,skipCovers:true});checkCancelled();
      if(!sourceInfo.format.duration||sourceInfo.format.duration>MAX_DURATION+1)throw new Error('LIMIT_DURATION');
      const duration=sourceInfo.format.duration,output=path.join(folder,'converted.flac');
      update(job.id,{status:'converting',progress:80});lastProgress=80;
      await run(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-i',source,'-map','0:a:0','-vn','-sn','-dn','-c:a','flac','-compression_level','8','-threads','2','-metadata',`title=${title}`,'-metadata',`artist=${artist}`,'-metadata','album=YouTube','-metadata',`comment=${job.source_url}`,'-fs',String(MAX_FLAC+1),'-progress','pipe:1','-nostats',output],{
        signal,timeout:10*60*1000,onLine:line=>{
          const match=line.match(/^out_time_us=(\d+)/);if(match){const progress=Math.max(80,Math.min(98,Math.round(80+Number(match[1])/1000000/duration*18)));if(progress>lastProgress){lastProgress=progress;update(job.id,{progress});}}
        }
      });checkCancelled();
      const stat=await fsp.stat(output);if(!stat.size||stat.size>MAX_FLAC)throw new Error('LIMIT_SIZE');
      const result=await mm.parseFile(output,{duration:true,skipCovers:true});checkCancelled();
      if(result.format.container!=='FLAC'||!result.format.duration||Math.abs(result.format.duration-duration)>1)throw new Error('INVALID_FLAC');
      const song={id:nanoid(),title,artist,album:'YouTube',filename:`${nanoid()}.flac`,original_name:`${title.replace(/[\\/\u0000-\u001f]/g,'_')}.flac`,format:'FLAC',duration:result.format.duration,filesize:stat.size};
      destination=path.join(uploadDir,song.filename);
      // Copy exclusively, then commit synchronously so cancellation cannot race publication.
      await fsp.copyFile(output,destination,fs.constants.COPYFILE_EXCL);checkCancelled();
      db.transaction(()=>{
        db.prepare(`INSERT INTO songs (id,title,artist,album,filename,original_name,format,duration,filesize) VALUES (@id,@title,@artist,@album,@filename,@original_name,@format,@duration,@filesize)`).run(song);
        update(job.id,{status:'completed',progress:100,song_id:song.id,error:null});
      })();committed=true;
    }catch(error){
      update(job.id,{status:signal.aborted&&!closing?'cancelled':'failed',error:closing?'Máy chủ đã dừng. Hãy thử chuyển đổi lần nữa.':friendlyError(error)});
      if(error.message!=='CANCELLED')console.error(`YouTube import ${job.id}: ${error.message.slice(0,800)}`);
    }finally{
      if(destination&&!committed)await fsp.rm(destination,{force:true}).catch(()=>{});
      await fsp.rm(folder,{recursive:true,force:true}).catch(()=>{});
    }
  }
  function pump() {
    if(running||closing)return;
    const next=db.prepare("SELECT * FROM youtube_imports WHERE status='queued' ORDER BY created_at,rowid LIMIT 1").get();
    if(!next)return;
    running=next.id;controller=new AbortController();
    workPromise=processJob(next).finally(()=>{running=null;controller=null;workPromise=null;if(!closing)queueMicrotask(pump);});
  }
  async function cancel(id) {
    const job=get(id);if(!job)return null;
    if(job.status==='queued')update(id,{status:'cancelled',error:'Đã hủy chuyển đổi.'});
    else if(running===id){controller.abort();await workPromise;}
    return get(id);
  }
  async function shutdown() {
    closing=true;controller?.abort();if(workPromise)await workPromise;
    db.prepare("UPDATE youtube_imports SET status='failed',error='Máy chủ đã dừng. Hãy thử chuyển đổi lần nữa.' WHERE status='queued'").run();
  }
  return {capabilities,list,get,create,cancel,shutdown};
}
module.exports={createImportService,normalizeYoutubeUrl,friendlyError};
