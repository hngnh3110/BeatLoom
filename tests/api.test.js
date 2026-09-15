const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beatloom-api-'));
process.env.DATA_DIR = path.join(root, 'data');
process.env.UPLOAD_DIR = path.join(root, 'uploads');
const app = require('../server');
const db = require('../db');
let server, base;
function wav(seconds = 2) {
  const samples = 8000 * seconds, buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF');buffer.writeUInt32LE(36+samples*2,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)buffer.writeInt16LE(Math.round(Math.sin(i/8000*440*Math.PI*2)*1500),44+i*2);
  return buffer;
}
async function request(route, method='GET', body, headers={}) {
  const response=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
async function upload(files) {
  const form = new FormData();
  for (const [name,content] of files) form.append('files',new Blob([content]),name);
  const response=await fetch(base+'/api/songs/upload',{method:'POST',body:form});
  return {status:response.status,body:await response.json()};
}
before(async()=>{server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(root,{recursive:true,force:true});});
test('complete isolated library lifecycle and validation',async t=>{
  let a,b,p;
  await t.test('health and empty library',async()=>{assert.equal((await request('/api/health')).body.status,'ok');assert.deepEqual((await request('/api/songs')).body,[]);});
  await t.test('reject empty upload, nonaudio extensions, fake audio and clean rejected files',async()=>{
    assert.equal((await upload([])).status,400);
    assert.equal((await upload([['script.html','<script>alert(1)</script>']])).status,400);
    assert.equal((await upload([['fake.mp3','not audio']])).status,400);
    assert.deepEqual(fs.readdirSync(process.env.UPLOAD_DIR),[]);
  });
  await t.test('parse real WAV duration and Vietnamese filenames',async()=>{
    const result=await upload([['Bình yên.wav',wav()],['Second.wav',wav(3)]]);
    assert.equal(result.status,201);assert.equal(result.body.uploaded.length,2);[a,b]=result.body.uploaded;
    assert.equal(a.title,'Bình yên');assert.equal(a.duration,2);assert.equal(b.duration,3);
  });
  await t.test('mixed valid and corrupt audio returns partial success without orphan files',async()=>{
    const result=await upload([['Third.wav',wav()],['broken.mp3','invalid']]);assert.equal(result.status,201);assert.equal(result.body.errors.length,1);
    assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length,3);await request(`/api/songs/${result.body.uploaded[0].id}`,'DELETE');
  });
  await t.test('favorite and edit persist with type validation',async()=>{
    assert.equal((await request(`/api/songs/${a.id}`,'PATCH',{favorite:'true'})).status,400);
    assert.equal((await request(`/api/songs/${a.id}`,'PATCH',{title:[]})).status,400);
    const updated=await request(`/api/songs/${a.id}`,'PATCH',{favorite:true,artist:'BEATLOOM Test',album:'Test Collection'});
    assert.equal(updated.body.favorite,1);assert.equal(updated.body.artist,'BEATLOOM Test');
    assert.equal((await request('/api/songs')).body.find(s=>s.id===a.id).favorite,1);
  });
  await t.test('record listening history',async()=>{const result=await request(`/api/songs/${a.id}/played`,'POST');assert.equal(result.body.play_count,1);assert.ok(result.body.last_played_at);});
  await t.test('reject malformed playlist names without server error',async()=>{for(const name of [null,12,{},[],true,'',' '.repeat(3),'x'.repeat(81)])assert.equal((await request('/api/playlists','POST',{name})).status,400);});
  await t.test('create playlist and atomically add unique songs',async()=>{
    const result=await request('/api/playlists','POST',{name:'  Evening  '});assert.equal(result.status,201);p=result.body;assert.equal(p.name,'Evening');
    assert.equal((await request(`/api/playlists/${p.id}/songs`,'POST',{songIds:[a.id,'missing']})).status,404);
    assert.equal((await request(`/api/playlists/${p.id}`)).body.songs.length,0);
    assert.equal((await request(`/api/playlists/${p.id}/songs`,'POST',{songIds:[a.id,b.id,a.id]})).body.added,2);
    assert.equal((await request(`/api/playlists/${p.id}/songs`,'POST',{songId:a.id})).body.added,0);
  });
  await t.test('only accept complete unique playlist permutations',async()=>{
    for(const songIds of [[a.id],[a.id,a.id],[a.id,'missing'],[],null])assert.equal((await request(`/api/playlists/${p.id}/reorder`,'PUT',{songIds})).status,400);
    assert.equal((await request(`/api/playlists/${p.id}/reorder`,'PUT',{songIds:[b.id,a.id]})).status,200);
    assert.deepEqual((await request(`/api/playlists/${p.id}`)).body.songs.map(s=>s.id),[b.id,a.id]);
  });
  await t.test('audio supports byte-range seeking',async()=>{
    const response=await fetch(`${base}/uploads/${a.filename}`,{headers:{Range:'bytes=0-43'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,44);assert.match(response.headers.get('content-range'),/^bytes 0-43\//);
  });
  await t.test('remove playlist membership without deleting audio',async()=>{
    assert.equal((await request(`/api/playlists/${p.id}/songs/${b.id}`,'DELETE')).status,200);
    assert.equal((await request('/api/songs')).body.length,2);assert.ok(fs.existsSync(path.join(process.env.UPLOAD_DIR,b.filename)));
  });
  await t.test('rename and delete song with cascading membership cleanup',async()=>{
    assert.equal((await request(`/api/playlists/${p.id}`,'PUT',{name:'Renamed'})).body.name,'Renamed');
    assert.equal((await request(`/api/songs/${a.id}`,'DELETE')).status,200);
    assert.equal((await request(`/api/playlists/${p.id}`)).body.songs.length,0);assert.ok(!fs.existsSync(path.join(process.env.UPLOAD_DIR,a.filename)));
  });
  await t.test('missing resources and cross-origin mutations return explicit errors',async()=>{
    for(const [route,method,body] of [['/api/playlists/missing','GET'],['/api/playlists/missing/reorder','PUT',{songIds:[]}],['/api/songs/missing','PATCH',{favorite:true}],['/api/songs/missing/played','POST'],['/api/missing','GET']])assert.equal((await request(route,method,body)).status,404);
    assert.equal((await request('/api/playlists','POST',{name:'Blocked'},{Origin:'http://unrelated.example'})).status,403);
  });
  await t.test('delete playlist keeps library songs',async()=>{assert.equal((await request(`/api/playlists/${p.id}`,'DELETE')).status,200);assert.equal((await request('/api/playlists')).body.length,0);assert.equal((await request('/api/songs')).body.length,1);});
});
