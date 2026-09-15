(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const dialog=$('youtube-dialog');
  const active=new Set(['queued','fetching','downloading','converting']);
  const labels={queued:'Đang chờ',fetching:'Đang đọc video',downloading:'Đang tải âm thanh',converting:'Đang chuyển FLAC',completed:'Hoàn tất',failed:'Không thành công',cancelled:'Đã hủy'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let jobs=[],available=false,timer=null,polling=false,initialized=false,lastFocus=null,submitting=false,pollError=false;
  const cancelling=new Set();
  const api = (...args) => window.Beatloom.api(...args);
  function error(message=''){$('youtube-error').textContent=message;$('youtube-error').hidden=!message;}
  function render(){
    const count=jobs.filter(job=>active.has(job.status)).length;
    $('youtube-count').textContent=count;$('youtube-count').hidden=!count;
    $('youtube-submit').disabled=!available||submitting;
    $('youtube-summary').textContent=count?`${count} đang xử lý`:'';
    $('youtube-jobs').innerHTML=jobs.length?jobs.map(job=>{
      const busy=active.has(job.status),song=job.song;
      const detail=job.error||(job.status==='completed'?(song?'Đã thêm vào thư viện · FLAC': 'Bài hát này đã bị xóa khỏi thư viện.'):job.artist||'Âm thanh được xử lý lần lượt theo hàng đợi.');
      return `<article class="youtube-job" data-job-id="${escape(job.id)}"><div class="youtube-job-heading"><a class="youtube-job-title" href="${escape(job.source_url)}" target="_blank" rel="noopener noreferrer" title="${escape(job.title||job.source_url)}">${escape(job.title||'Video YouTube')}</a><span class="youtube-job-state">${labels[job.status]||job.status}${['downloading','converting'].includes(job.status)?` · ${job.progress}%`:''}</span></div>${busy?`<progress max="100" ${job.status==='fetching'?'':`value="${job.progress}"`} aria-label="Tiến độ chuyển đổi"></progress>`:''}<p class="youtube-job-detail">${escape(detail)}</p><div class="youtube-job-actions">${busy?`<button class="button outlined" data-cancel="${escape(job.id)}" ${cancelling.has(job.id)?'disabled':''}>${cancelling.has(job.id)?'Đang hủy…':'Hủy chuyển đổi'}</button>`:''}${job.status==='completed'&&song?`<button class="button outlined" data-play="${escape(song.id)}">Phát bài hát</button><button class="button outlined" data-download="${escape(song.id)}">Tải file FLAC</button>`:''}${['failed','cancelled'].includes(job.status)||job.status==='completed'&&!song?`<button class="button outlined" data-retry="${escape(job.source_url)}" ${submitting?'disabled':''}>Thử lại</button>`:''}</div></article>`;
    }).join(''):'<p class="muted">Dán một liên kết ở trên để bắt đầu chuyển đổi.</p>';
  }
  function schedule(delay=1200){clearTimeout(timer);if(dialog.open||jobs.some(job=>active.has(job.status)))timer=setTimeout(poll,delay);}
  async function poll(){
    if(polling){schedule();return;}polling=true;
    try{
      const previous=new Map(jobs.map(job=>[job.id,job.status]));
      jobs=await api('/api/imports');
      if(pollError){error();pollError=false;}
      if(initialized)for(const job of jobs)if(job.status==='completed'&&job.song&&active.has(previous.get(job.id)))document.dispatchEvent(new CustomEvent('beatloom:import-finished',{detail:{songId:job.song.id,title:job.song.title}}));
      initialized=true;render();schedule(jobs.some(job=>active.has(job.status))?1200:3500);
    }catch{pollError=true;if(dialog.open)error('Mất kết nối tới máy chủ. Tiến độ sẽ cập nhật khi kết nối trở lại.');schedule(5000);}
    finally{polling=false;}
  }
  async function open(){
    lastFocus=document.activeElement;$('sidebar').classList.remove('open');dialog.showModal();$('youtube-url').focus();error();
    try{const caps=await api('/api/imports/capabilities');available=caps.available;if(!available)error('Bộ chuyển đổi chưa được cài đặt đầy đủ. Xem mục YouTube trong hướng dẫn BEATLOOM.');render();await poll();}catch(e){error(e.message);}
  }
  function close(){dialog.close();lastFocus?.focus();schedule();}
  $('youtube-open').addEventListener('click',open);
  $('youtube-close').addEventListener('click',close);
  dialog.addEventListener('close',()=>{lastFocus?.focus();schedule();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  async function start(url){
    if(submitting)return;submitting=true;error();render();
    try{
      const result=await api('/api/imports/youtube','POST',{url});
      jobs=[result.job,...jobs.filter(job=>job.id!==result.job.id)];initialized=true;
      $('youtube-url').value='';render();schedule();
      if(result.existing&&result.job.status==='completed')error('Video này đã có trong thư viện. Bạn có thể phát hoặc tải file FLAC bên dưới.');
    }catch(e){error(e.message);}finally{submitting=false;render();}
  }
  $('youtube-form').addEventListener('submit',event=>{event.preventDefault();start($('youtube-url').value.trim());});
  $('youtube-jobs').addEventListener('click',async event=>{
    const cancel=event.target.closest('[data-cancel]'),retry=event.target.closest('[data-retry]'),play=event.target.closest('[data-play]');
    const download = event.target.closest('[data-download]');
    if (download) {
      const song = jobs.find(job => job.song?.id === download.dataset.download)?.song;
      if (!song) return;
      download.disabled = true;
      try {
        const link = document.createElement('a');
        link.href = await window.Beatloom.mediaUrl(song, true);
        link.download = `${song.title}.flac`;
        document.body.append(link); link.click(); link.remove();
      } catch (e) { error(e.message); }
      finally { download.disabled = false; }
      return;
    }
    if(play){close();document.dispatchEvent(new CustomEvent('beatloom:play-import',{detail:{songId:play.dataset.play}}));return;}
    if(retry){start(retry.dataset.retry);return;}
    if(cancel){const id=cancel.dataset.cancel;if(cancelling.has(id))return;cancelling.add(id);render();
      try{const job=await api(`/api/imports/${id}`,'DELETE');jobs=jobs.map(item=>item.id===id?job:item);error();}
      catch(e){error(e.message);}finally{cancelling.delete(id);render();schedule();}
    }
  });
  poll();
})();
