const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'beatloom-youtube-'));
process.env.DATA_DIR=path.join(root,'data');process.env.UPLOAD_DIR=path.join(root,'uploads');process.env.IMPORT_DIR=path.join(root,'work');
const audioPath=path.join(root,'source.wav');
const count=16000,b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(36+count*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)b.writeInt16LE(Math.round(Math.sin(i/8000*220*Math.PI*2)*600),44+i*2);fs.writeFileSync(audioPath,b);
const fake=path.join(root,'yt-dlp');
fs.writeFileSync(fake,`#!${process.execPath}
const fs=require('node:fs');const a=process.argv.slice(2);const val=k=>a[a.indexOf(k)+1];
if(a.includes('--dump-single-json')){
 const id=new URL(a.at(-1)).searchParams.get('v');
 if(id.startsWith('SLOW')){setTimeout(()=>{},30000);}
 else if(id.startsWith('FAIL')){console.error('ERROR: Video unavailable');process.exitCode=1;}
 else console.log(JSON.stringify({id,extractor:'youtube',title:'Âm thanh thử '+id,artist:'HunggAnhLee . Jesko',duration:2,is_live:id.startsWith('LIVE')}));
}else{
 const output=val('--output').replace('%(ext)s','wav');fs.copyFileSync(${JSON.stringify(audioPath)},output);
 console.log('BEATLOOM_PROGRESS:32000:32000');
}
`,{mode:0o755});process.env.YTDLP_PATH=fake;
const app=require('../server'),db=require('../db'),{service}=require('../routes/imports');
const {normalizeYoutubeUrl}=require('../services/youtube-import');
let server,base;
async function request(route,method='GET',body){const r=await fetch(base+route,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
const create=id=>request('/api/imports/youtube','POST',{url:`https://youtu.be/${id}`});
async function waitJob(id,statuses){for(let i=0;i<160;i++){const job=(await request('/api/imports/'+id)).data;if(statuses.includes(job.status))return job;await new Promise(r=>setTimeout(r,50));}throw new Error('Timed out waiting for '+id);}
before(async()=>{server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await service.shutdown();await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(root,{recursive:true,force:true});});
test('YouTube import validates input, converts real audio and preserves job lifecycle',async t=>{
  await t.test('canonical single-video URL validation',()=>{
    for(const url of ['https://youtu.be/GOODVIDEO01?t=4','https://music.youtube.com/watch?v=GOODVIDEO01&list=abc','youtube.com/shorts/GOODVIDEO01','https://www.youtube.com/embed/GOODVIDEO01'])assert.equal(normalizeYoutubeUrl(url).url,'https://www.youtube.com/watch?v=GOODVIDEO01');
    for(const url of [null,{},'file:///etc/passwd','http://localhost:3000','https://youtube.com.evil.test/watch?v=GOODVIDEO01','https://youtube.com@evil.test/watch?v=GOODVIDEO01','https://youtube.com:123/watch?v=GOODVIDEO01','https://youtube.com/playlist?list=foo','https://youtu.be/GOODVIDEO01/extra','https://youtube.com/watch?v=$(touch x)'])assert.throws(()=>normalizeYoutubeUrl(url));
  });
  let first;
  await t.test('real FFmpeg produces tagged FLAC and inserts one song',async()=>{
    assert.equal((await request('/api/imports/capabilities')).data.available,true);
    const result=await create('GOODVIDEO01');assert.equal(result.status,202);first=result.data.job.id;
    const job=await waitJob(first,['completed','failed']);assert.equal(job.status,'completed',job.error);assert.equal(job.progress,100);assert.equal(job.song.format,'FLAC');assert.equal(job.song.duration,2);
    const file=path.join(process.env.UPLOAD_DIR,job.song.filename);assert.equal(fs.readFileSync(file).subarray(0,4).toString(),'fLaC');
    const meta=await (await import('music-metadata')).parseFile(file);assert.equal(meta.common.artist,'HunggAnhLee . Jesko');assert.equal(meta.common.album,'YouTube');assert.equal(job.source_url,'https://www.youtube.com/watch?v=GOODVIDEO01');
    assert.equal(fs.existsSync(path.join(process.env.IMPORT_DIR,job.id)),false);
    const audio=await fetch(base+'/uploads/'+job.song.filename,{headers:{Range:'bytes=0-3'}});assert.equal(audio.status,206);assert.equal(await audio.text(),'fLaC');
  });
  await t.test('duplicate video returns existing job; missing and invalid requests fail',async()=>{
    const duplicate=await create('GOODVIDEO01');assert.equal(duplicate.status,200);assert.equal(duplicate.data.existing,true);assert.equal(duplicate.data.job.id,first);
    assert.equal((await request('/api/songs')).data.length,1);assert.equal((await request('/api/imports/youtube','POST',{url:'http://127.0.0.1'})).status,400);assert.equal((await request('/api/imports/missing')).status,404);
  });
  await t.test('unavailable video and livestream fail without orphan files',async()=>{
    for(const id of ['FAILVIDEO01','LIVEVIDEO01']){const job=await waitJob((await create(id)).data.job.id,['failed']);assert.equal(job.song_id,null);assert.ok(job.error);assert.equal(fs.existsSync(path.join(process.env.IMPORT_DIR,job.id)),false);}
    assert.equal((await request('/api/songs')).data.length,1);
  });
  await t.test('cancel active child, reject excess queue, and clean queued jobs',async()=>{
    const slow=(await create('SLOWVIDEO01')).data.job;await waitJob(slow.id,['fetching']);const queued=[];
    for(let i=0;i<4;i++)queued.push((await create('QUEUE'+String(i).padStart(6,'0'))).data.job.id);
    assert.equal((await create('QUEUE999999')).status,429);
    for(const id of queued)assert.equal((await request('/api/imports/'+id,'DELETE')).data.status,'cancelled');
    assert.equal((await request('/api/imports/'+slow.id,'DELETE')).data.status,'cancelled');
    assert.equal(fs.existsSync(path.join(process.env.IMPORT_DIR,slow.id)),false);assert.equal((await request('/api/songs')).data.length,1);
  });
  await t.test('browser submits conversion, refreshes library, plays FLAC and cancels jobs',async()=>{
    const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(base);await page.waitForSelector('#main[aria-busy="false"]');await page.locator('#youtube-open').click();await page.waitForFunction(()=>!document.querySelector('#youtube-submit').disabled);
      await page.locator('#youtube-url').fill('https://not-youtube.example/watch?v=UIVIDEO0001');await page.locator('#youtube-submit').click();await page.waitForFunction(()=>!document.querySelector('#youtube-error').hidden);
      await page.locator('#youtube-url').fill('https://youtu.be/UIVIDEO0001');await page.locator('#youtube-submit').click();
      await page.waitForFunction(()=>document.querySelector('#library-count').textContent==='2');
      const job=page.locator('.youtube-job').filter({hasText:'Âm thanh thử UIVIDEO0001'});await job.locator('[data-play]').waitFor();assert.match(await job.locator('[download]').getAttribute('download'),/\.flac$/);
      await page.locator('#youtube-dialog').screenshot({path:'.test-results/youtube-converter.png'});
      await job.locator('[data-play]').click();await page.waitForFunction(()=>!document.querySelector('#audio').paused&&document.querySelector('#audio').currentTime>.05);await page.locator('#play').click();assert.equal(await page.locator('#now-title').textContent(),'Âm thanh thử UIVIDEO0001');
      await page.locator('#youtube-open').click();await page.locator('#youtube-url').fill('https://youtu.be/SLOWUI00001');await page.locator('#youtube-submit').click();await page.locator('[data-cancel]').first().waitFor();await page.locator('[data-cancel]').first().click();await page.waitForFunction(()=>document.querySelector('#youtube-summary').textContent==='');
      await page.locator('#youtube-close').click();await page.setViewportSize({width:390,height:844});await page.locator('#menu-button').click();await page.locator('#youtube-open').click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('#youtube-dialog').screenshot({path:'.test-results/youtube-converter-mobile.png'});assert.deepEqual(errors,[]);
    }finally{await browser.close();}
  });
});
