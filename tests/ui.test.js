const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beatloom-ui-'));
process.env.DATA_DIR = path.join(root, 'data');
process.env.UPLOAD_DIR = path.join(root, 'uploads');
const app = require('../server');
const db = require('../db');
let server, base, browser, page;
const errors=[];
function wav(seconds=45){
  const rate=8000,count=rate*seconds,b=Buffer.alloc(44+count*2);
  b.write('RIFF');b.writeUInt32LE(36+count*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*220*Math.PI*2)*800),44+i*2);return b;
}
async function ready(){await page.waitForFunction(()=>document.querySelector('#main').getAttribute('aria-busy')==='false');}
async function countRows(n){await page.waitForFunction(n=>document.querySelectorAll('#tracks .track-row').length===n,n);}
async function submit(){await page.locator('#dialog-submit').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);}
before(async()=>{
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{channel:'chrome'})});
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
});
after(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(root,{recursive:true,force:true});});
test('browser flows: upload, search, favorites, playback, playlists and mobile',async t=>{
  let firstId,secondId,thirdId;
  await t.test('empty state and keyboard search',async()=>{
    await page.goto(base);await ready();assert.equal(await page.locator('#empty-state').isVisible(),true);assert.equal(await page.locator('#play').isDisabled(),true);
    await page.keyboard.press('/');assert.equal(await page.locator('#search').evaluate(el=>el===document.activeElement),true);await page.locator('#search').blur();
    await page.screenshot({path:'.test-results/desktop-empty.png'});
  });
  await t.test('upload three real tracks through file picker',async()=>{
    await page.locator('#file-input').setInputFiles([{name:'Bình yên.wav',mimeType:'audio/wav',buffer:wav()},{name:'Chiều nắng.wav',mimeType:'audio/wav',buffer:wav(50)},{name:'Đêm xanh.wav',mimeType:'audio/wav',buffer:wav(55)}]);
    await countRows(3);assert.equal(await page.locator('#library-count').textContent(),'3');
    const library=await(await fetch(base+'/api/songs')).json();firstId=library.find(s=>s.title==='Bình yên').id;secondId=library.find(s=>s.title==='Chiều nắng').id;thirdId=library.find(s=>s.title==='Đêm xanh').id;
  });
  await t.test('Vietnamese accent-insensitive search and empty search recovery',async()=>{
    await page.locator('#search').fill('binh yen');await countRows(1);assert.match(await page.locator('.track-title').textContent(),/Bình yên/);
    await page.locator('#search').fill('missing title');await countRows(0);assert.equal(await page.locator('#empty-title').textContent(),'Không tìm thấy bài hát phù hợp.');await page.locator('#empty-action').click();await countRows(3);
  });
  await t.test('favorite persists across refresh and navigation',async()=>{
    await page.locator(`[data-id="${firstId}"] [data-action="favorite"]`).click();await page.waitForFunction(()=>document.querySelector('#favorite-count').textContent==='1');
    await page.locator('[data-view="favorites"]').click();await countRows(1);await page.reload();await ready();await page.locator('[data-view="favorites"]').click();await countRows(1);
    await page.locator('[data-view="library"]').click();await countRows(3);
  });
  await t.test('edit metadata safely, sort library',async()=>{
    await page.locator(`[data-id="${firstId}"] [data-action="edit"]`).click();await page.locator('[name="artist"]').fill('Nghệ sĩ thử nghiệm');await page.locator('[name="album"]').fill('<b>Không phải HTML</b>');await submit();
    assert.equal(await page.locator(`[data-id="${firstId}"] .album-col b`).count(),0);assert.equal(await page.locator(`[data-id="${firstId}"] .album-col`).textContent(),'<b>Không phải HTML</b>');
    await page.locator('#sort').selectOption('title');assert.equal(await page.locator('.track-row').first().getAttribute('data-id'),firstId);
  });
  await t.test('play, pause, seek and preserve player after reload',async()=>{
    await page.locator(`[data-id="${firstId}"] .track-title`).click();await page.waitForFunction(()=>document.querySelector('#audio').readyState>=2&&!document.querySelector('#audio').paused&&document.querySelector('#audio').currentTime>.1);
    assert.equal(await page.locator('#now-title').textContent(),'Bình yên');await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#audio').paused);
    await page.locator('#seek').evaluate(el=>{el.value=400;el.dispatchEvent(new Event('input',{bubbles:true}));});assert.ok(Math.abs(await page.locator('#audio').evaluate(el=>el.currentTime)-18)<1);
    await page.locator('#volume').fill('42');await page.locator('#volume').dispatchEvent('input');await page.reload();await ready();await page.waitForFunction(()=>document.querySelector('#audio').readyState>=1);
    assert.equal(await page.locator('#now-title').textContent(),'Bình yên');assert.equal(await page.locator('#audio').evaluate(el=>el.paused),true);assert.ok(Math.abs(await page.locator('#audio').evaluate(el=>el.currentTime)-18)<1);assert.equal(await page.locator('#volume').inputValue(),'42');
  });
  await t.test('queue, shuffle and repeat preserve current song',async()=>{
    await page.locator('#queue-toggle').click();assert.equal(await page.locator('.queue-item').count(),3);await page.locator('#shuffle').click();assert.equal(await page.locator('#shuffle').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#now-title').textContent(),'Bình yên');
    await page.locator('#shuffle').click();await page.locator('#repeat').click();assert.equal(await page.locator('#repeat').getAttribute('title'),'Lặp lại: toàn bộ');await page.locator('#repeat').click();assert.equal(await page.locator('#repeat').getAttribute('title'),'Lặp lại: một bài');await page.locator('#repeat').click();
    await page.locator('.queue-item').nth(1).click();await page.waitForFunction(()=>document.querySelector('#now-title').textContent==='Chiều nắng');await page.locator('#play').click();await page.locator('#close-queue').click();
    await page.locator('[data-view="recent"]').click();await countRows(2);await page.locator('[data-view="library"]').click();
  });
  await t.test('automatic next, repeat-one, stop-at-end and repeat-all',async()=>{
    await page.locator('#sort').selectOption('title');
    await page.locator(`[data-id="${firstId}"] .track-title`).click();
    await page.waitForFunction(()=>document.querySelector('#audio').readyState>=2&&!document.querySelector('#audio').paused);
    await page.locator('#audio').evaluate(el=>el.currentTime=el.duration-.05);
    await page.waitForFunction(()=>document.querySelector('#now-title').textContent==='Chiều nắng'&&document.querySelector('#audio').readyState>=2&&!document.querySelector('#audio').paused);
    await page.locator('#repeat').click();await page.locator('#repeat').click();
    await page.locator('#audio').evaluate(el=>el.currentTime=el.duration-.05);
    await page.waitForFunction(()=>document.querySelector('#audio').currentTime<2&&document.querySelector('#audio').readyState>=2&&!document.querySelector('#audio').paused);
    assert.equal(await page.locator('#now-title').textContent(),'Chiều nắng');
    await page.locator('#repeat').click();await page.locator('#next').click();
    await page.waitForFunction(()=>document.querySelector('#now-title').textContent==='Đêm xanh'&&document.querySelector('#audio').readyState>=2&&!document.querySelector('#audio').paused);
    await page.locator('#audio').evaluate(el=>el.currentTime=el.duration-.05);
    await page.waitForFunction(()=>document.querySelector('#audio').ended&&document.querySelector('#audio').paused);
    assert.equal(await page.locator('#now-title').textContent(),'Đêm xanh');
    await page.locator('#repeat').click();await page.locator('#play').click();
    await page.waitForFunction(()=>document.querySelector('#audio').readyState>=2&&!document.querySelector('#audio').paused);
    await page.locator('#audio').evaluate(el=>el.currentTime=el.duration-.05);
    await page.waitForFunction(()=>document.querySelector('#now-title').textContent==='Bình yên'&&document.querySelector('#audio').readyState>=2&&!document.querySelector('#audio').paused);
    await page.locator('#repeat').click();await page.locator('#repeat').click();
    await page.locator('#next').click();await page.waitForFunction(()=>document.querySelector('#now-title').textContent==='Chiều nắng'&&document.querySelector('#audio').readyState>=2&&!document.querySelector('#audio').paused);await page.locator('#play').click();
  });
  await t.test('create playlist and batch-add library songs',async()=>{
    await page.locator('#create-playlist').click();await page.locator('[name="name"]').fill('Buổi tối bình yên');await submit();assert.match(await page.locator('#view-title').textContent(),/Buổi tối bình yên/);
    await page.locator('#playlist-add').click();await page.locator(`input[value="${firstId}"]`).check();await page.locator(`input[value="${secondId}"]`).check();await submit();await countRows(2);
  });
  await t.test('playlist ordering survives reload and rename',async()=>{
    const initial=await page.locator('.track-row').evaluateAll(rows=>rows.map(r=>r.dataset.id));await page.locator('.track-row').last().locator('[data-action="up"]').click();
    await page.waitForFunction(id=>document.querySelector('.track-row').dataset.id===id,initial[1]);
    await page.locator('#rename-playlist').click();await page.locator('[name="name"]').fill('Đêm dịu dàng');await submit();await page.reload();await ready();await page.locator('.playlist-item').click();await countRows(2);assert.equal(await page.locator('.track-row').first().getAttribute('data-id'),initial[1]);
    assert.match(await page.locator('#view-title').textContent(),/Đêm dịu dàng/);
  });
  await t.test('remove membership and delete playlist preserve library',async()=>{
    await page.locator('.track-row').first().locator('[data-action="remove"]').click();await countRows(1);await page.locator('#delete-playlist').click();await submit();await countRows(3);assert.equal(await page.locator('.playlist-item').count(),0);
  });
  await t.test('desktop populated layout has no horizontal overflow',async()=>{
    await page.locator('#main').evaluate(el=>el.scrollTop=0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:'.test-results/desktop-library.png'});
  });
  await t.test('phone layout, navigation and track actions work',async()=>{
    const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});phone.on('pageerror',e=>errors.push(e.message));await phone.goto(base);await phone.waitForFunction(()=>document.querySelector('#main').getAttribute('aria-busy')==='false');
    assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await phone.locator('#sidebar').evaluate(el=>el.getBoundingClientRect().right<=0),true);
    await phone.screenshot({path:'.test-results/mobile-library.png'});await phone.locator('#menu-button').click();await phone.locator('[data-view="favorites"]').click();await phone.waitForFunction(()=>document.querySelectorAll('.track-row').length===1);
    assert.equal(await phone.locator('[data-action="edit"]').isVisible(),true);await phone.locator('[data-action="edit"]').click();assert.equal(await phone.locator('#dialog').isVisible(),true);await phone.locator('#dialog-cancel').click();
    await phone.locator('.track-title').click();await phone.waitForFunction(()=>document.querySelector('#audio').readyState>=2&&!document.querySelector('#audio').paused);await phone.locator('#play').click();await phone.screenshot({path:'.test-results/mobile-favorites.png'});await phone.close();
  });
  await t.test('cancel deletion retains song; confirmed current deletion resets player',async()=>{
    await page.locator(`[data-id="${thirdId}"] [data-action="delete"]`).click();await page.locator('#dialog-cancel').click();await countRows(3);
    await page.locator(`[data-id="${secondId}"] [data-action="delete"]`).click();await submit();await countRows(2);assert.equal(await page.locator('#now-title').textContent(),'Sẵn sàng cho một giai điệu?');assert.equal(await page.locator('#seek').isDisabled(),true);
    await page.locator('#play-all').click();await page.waitForFunction(()=>document.querySelector('#audio').readyState>=2&&!document.querySelector('#audio').paused);await page.locator('#play').click();
  });
  await t.test('no uncaught browser errors',()=>assert.deepEqual(errors,[]));
});
