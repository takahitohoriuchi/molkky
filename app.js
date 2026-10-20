import {followLogRow} from './log-scroll.js?v=20261020-7';
import {beginSync,playbackIndex,selectRow,finishSync} from './review-state.js?v=20261020-7';
import {parseLog,parsePositions,positionFrames,cloudURL,clock,initialPositions} from './data.js?v=20261020-7';
const $=id=>document.getElementById(id);
const state={files:{},logs:[],frames:[],index:-2,offset:0,baseOffset:0,urls:[],scale:1,tx:220,ty:200,hasPositions:false,loading:false,syncMode:false};
const video=$('video');
function route(){const name=location.hash.slice(1)||'home';const page=['home','play','load','review'].includes(name)?name:'home';if(page==='review'&&!state.logs.length){location.hash='load';return;}document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==page);if(page!=='review')video.pause();document.body.classList.toggle('sync-mode-active',state.syncMode&&page==='review');window.scrollTo(0,0);}
window.addEventListener('hashchange',route);route();
function setFile(key,file){if(!file)return;state.files[key]=file;$(`name-${key}`).textContent=file.name;$(`url-${key}`).value='';}
for(const key of ['video','log','positions']){
  $(`file-${key}`).addEventListener('change',e=>setFile(key,e.target.files[0]));
  const zone=$(`drop-${key}`);
  for(const type of ['dragover','dragenter'])zone.addEventListener(type,e=>{e.preventDefault();zone.classList.add('dragging');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragging');setFile(key,e.dataTransfer.files[0]);});
  $(`url-${key}`).addEventListener('input',()=>{state.files[key]=null;$(`file-${key}`).value='';$(`name-${key}`).textContent=key==='video'?'MP4 / WebM など':'CSVファイル';});
}
async function fetchText(url){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text();}catch(e){throw new Error(`データを取得できませんでした（${e.name==='AbortError'?'タイムアウト':e.message}）。URL・公開設定・配信元のCORS許可を確認するか、CSVをダウンロードして読み込んでください。`);}finally{clearTimeout(timer);}}
async function sourceText(key){if(state.files[key])return state.files[key].text();const value=$(`url-${key}`).value.trim();return value?fetchText(cloudURL(value,key)):null;}
function busy(value){
  state.loading=value;
  $('load-submit').disabled=value;
  $('load-submit').textContent=value?'読み込み中…':'鑑賞をはじめる →';
}
$('load-form').addEventListener('submit',async e=>{e.preventDefault();if(state.loading)return;busy(true);$('load-error').textContent='';try{
  if(!state.files.video&&!$('url-video').value.trim())throw new Error('動画ファイルまたは動画の直接URLを指定してください。');
  const texts=await Promise.all([sourceText('log'),sourceText('positions')]);if(!texts[0])throw new Error('ゲームログのCSVまたはURLを指定してください。');
  const logs=parseLog(texts[0]),positions=texts[1]?parsePositions(texts[1],logs):new Map();
  const src=state.files.video?URL.createObjectURL(state.files.video):cloudURL($('url-video').value.trim(),'video');
  openReview(logs,positions,src,state.files.video?.name||'クラウドの動画',!!texts[1]);
}catch(e){$('load-error').textContent=e.message;}finally{busy(false);}});
function openReview(logs,positions,src,name,hasPositions){
  video.pause();video.removeAttribute('src');video.load();state.urls.forEach(u=>URL.revokeObjectURL(u));state.urls=src.startsWith('blob:')?[src]:[];
  Object.assign(state,{logs,frames:positionFrames(logs,positions),index:-2,offset:-logs[0].time,baseOffset:-logs[0].time,syncMode:false,hasPositions});
  $('review-error').textContent='';$('video-name').textContent=name;$('position-mode').textContent=hasPositions?'位置データあり':'初期配置';$('log-count').textContent=`${logs.length} 投`;$('sync-status').textContent='未調整（最初の試技の終了＝動画0秒）';
  $('match-title').textContent=logs[0].game ? `${logs[0].game}${logs[0].goalScore ? ` · ${logs[0].goalScore}点ゲーム` : ''}` : '一投ずつ、読み解く。';
  buildTable();resetView();video.muted=false;video.defaultMuted=false;video.volume=1;renderSyncMode();video.src=src;video.load();location.hash='review';route();update(true);
}
function buildTable(){
  $('log-body').replaceChildren();
  state.logs.forEach((log,i)=>{
    const tr=document.createElement('tr');tr.tabIndex=0;tr.setAttribute('aria-label',`試技 ${log.id}、${log.player}、${log.score}点へ移動`);
    const status=[log.win?'勝利':'',log.disqualified?'失格':'',log.overGoal?'目標点超過':'',Number(log.consecutiveMisses)>0?`連続ミス ${log.consecutiveMisses}回`:''].filter(Boolean).join(' / ');
    const total=log.scoreBefore!==''?`${log.scoreBefore} → ${log.total||'—'}`:log.total||'—';
    const values=[log.id,log.timestamp,log.team||'—',log.player,'',String(log.score),total,status||'—',log.note];
    values.forEach((value,j)=>{const td=document.createElement('td');if(j===4){if(!log.pins.length)td.textContent='ミス';log.pins.forEach(pin=>{const span=document.createElement('span');span.className='pin-chip';span.textContent=pin;td.append(span);});}else td.textContent=value;if(j===5)td.className='score';tr.append(td);});
    const select=()=>{ const target=selectRow(state,i);if(target===null){$('review-error').textContent='';update(true);return;}if(target<0||Number.isFinite(video.duration)&&target>video.duration){$('review-error').textContent='この試技の同期時刻は動画の範囲外です。同期調整モードをオンにして、このログ行と動画の基準位置を選び「同期」を押してください。';return;}$('review-error').textContent='';seek(target);};
    tr.addEventListener('click',select);tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();select();}});$('log-body').append(tr);
  });
}
function seek(time){if(!video.readyState)return;video.currentTime=Math.max(0,Math.min(Number.isFinite(video.duration)?video.duration:Infinity,time));update();}
function followCurrentRow(){
  if(state.syncMode||$('review').hidden||!$('auto-follow').checked)return;
  const row=$('log-body').children[state.index];
  if(row)followLogRow(row.closest('.table-scroll'),row);
}
$('auto-follow').addEventListener('change',followCurrentRow);
new ResizeObserver(()=>requestAnimationFrame(followCurrentRow)).observe($('log-body').closest('.table-scroll'));
function update(force=false){
  $('video-clock').textContent=clock(video.currentTime);if(!state.logs.length)return;
  const i=playbackIndex(state,video.currentTime);if(i===state.index&&!force)return;state.index=i;
  [...$('log-body').children].forEach((tr,j)=>{tr.classList.toggle('active',j===i);tr.setAttribute('aria-current',String(j===i));});
  if(i>=0){const log=state.logs[i];$('selection-status').textContent=`試技 ${log.id} · ${log.team ? log.team+' / ' : ''}${log.player} · ${log.score}点`;
    requestAnimationFrame(followCurrentRow);
  }else $('selection-status').textContent='最初の試技より前の映像です';
  $('sync').disabled=!state.syncMode||i<0||video.readyState===0||video.seeking;
  $('sync-target').textContent=i>=0?`同期対象：試技 ${state.logs[i].id}`:'同期対象なし';
  drawField();
}
for(const type of ['timeupdate','seeked','loadedmetadata','ended'])video.addEventListener(type,()=>update(type==='loadedmetadata'||type==='seeked'));
video.addEventListener('seeking',()=>{$('sync').disabled=true;});
video.addEventListener('error',()=>{$('review-error').textContent='動画を再生できません。ブラウザ対応のMP4/WebM、またはアクセス可能な動画ファイルの直接URLを選んでください。YouTube等の視聴ページURLには対応していません。';});
async function togglePlay(){try{if(video.paused)await video.play();else video.pause();}catch{$('review-error').textContent='動画を再生できません。ファイル形式とURLを確認してください。';}}
function step(direction){video.pause();seek(video.currentTime+direction/30);}
document.addEventListener('keydown',e=>{if($('review').hidden||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.target.closest('input,textarea,select,button,a,[contenteditable]'))return;if(e.code==='Space'){e.preventDefault();togglePlay();}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();step(e.key==='ArrowLeft'?-1:1);}});
function renderSyncMode(){
  document.body.classList.toggle('sync-mode-active',state.syncMode&&!$('review').hidden);
  $('sync-mode').checked=state.syncMode;$('sync-guide').hidden=!state.syncMode;
  $('sync').hidden=!state.syncMode;
  $('sync-details').hidden=!state.syncMode;
  $('selection-status').hidden=!state.syncMode;
  $('auto-follow').disabled=state.syncMode;
}
$('sync-mode').addEventListener('change',()=>{
  video.pause();
  if($('sync-mode').checked)beginSync(state);else state.syncMode=false;
  renderSyncMode();update(true);
});
$('sync').addEventListener('click',()=>{
  if(!video.readyState||video.seeking){$('review-error').textContent='動画の読み込み・シーク完了を待ってから同期してください。';return;}
  try{
    video.pause();const time=video.currentTime;
    const log=finishSync(state,time);renderSyncMode();
    $('sync-status').textContent=`試技 ${log.id} 終了（${log.timestamp}）＝ 動画 ${clock(time)}`;
    $('review-error').textContent='';update(true);
  }catch(e){$('review-error').textContent=e.message;}
});
$('reset-sync').addEventListener('click',()=>{state.syncMode=false;renderSyncMode();state.offset=state.baseOffset;$('sync-status').textContent='未調整（最初の試技の終了＝動画0秒）';update(true);});
function svgElement(tag,attrs){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));return node;}
function drawField(){
  const group=$('field-content');group.replaceChildren();group.setAttribute('transform',`translate(${state.tx} ${state.ty}) scale(${state.scale})`);
  const frame=state.frames[state.index]||{before:initialPositions(),after:initialPositions()},fallen=new Set(state.logs[state.index]?.pins||[]);
  const label=svgElement('text',{x:0,y:128,'text-anchor':'middle',fill:'#98a38f','font-size':9,'letter-spacing':3});label.textContent='↑ THROWING DIRECTION';group.append(label);
  function pin(id,p,type){const g=svgElement('g',{}),c=svgElement('circle',{cx:p.x,cy:p.y,r:18,fill:type==='fallen'?'#171b18':type==='before'?'none':'#fff',stroke:'#171b18','stroke-width':1.5,...(type==='before'?{'stroke-dasharray':'4 3'}:{})});const t=svgElement('text',{x:p.x,y:p.y+4.5,'text-anchor':'middle',fill:type==='fallen'?'#fff':'#171b18','font-size':13,'font-family':'sans-serif'});t.textContent=id;g.append(c,t);group.append(g);}
  for(const [id,p] of frame.after)if(!fallen.has(id))pin(id,p,'standing');
  for(const id of fallen)pin(id,frame.before.get(id),'before');
  for(const id of fallen)pin(id,frame.after.get(id),'fallen');
}
function resetView(){Object.assign(state,{scale:1,tx:220,ty:200});applyView();}
function applyView(){$('field-content').setAttribute('transform',`translate(${state.tx} ${state.ty}) scale(${state.scale})`);$('zoom-value').textContent=`${Math.round(state.scale*100)}%`;}
function zoom(factor,x=220,y=170){const next=Math.max(.15,Math.min(8,state.scale*factor));const ratio=next/state.scale;state.tx=x-(x-state.tx)*ratio;state.ty=y-(y-state.ty)*ratio;state.scale=next;applyView();}
function svgPoint(x,y){const p=$('field').createSVGPoint();p.x=x;p.y=y;return p.matrixTransform($('field').getScreenCTM().inverse());}
$('field').addEventListener('wheel',e=>{e.preventDefault();const p=svgPoint(e.clientX,e.clientY);zoom(Math.exp(-e.deltaY*.002),p.x,p.y);},{passive:false});
const pointers=new Map();let pinch=null;
$('field').addEventListener('pointerdown',e=>{$('field').setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=null;});
$('field').addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size!==2)return;const [a,b]=[...pointers.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);const p=svgPoint((a.x+b.x)/2,(a.y+b.y)/2);if(pinch){zoom(distance/Math.max(1,pinch.distance),pinch.x,pinch.y);state.tx+=p.x-pinch.x;state.ty+=p.y-pinch.y;applyView();}pinch={distance,x:p.x,y:p.y};});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('field').addEventListener(type,e=>{pointers.delete(e.pointerId);pinch=null;});
$('zoom-in').addEventListener('click',()=>zoom(1.2));$('zoom-out').addEventListener('click',()=>zoom(1/1.2));$('reset-view').addEventListener('click',resetView);
window.addEventListener('beforeunload',()=>state.urls.forEach(u=>URL.revokeObjectURL(u)));

// Each media panel has its own dimensions; oversized panels wrap to the next row.
for(const panel of document.querySelectorAll('.resizable-panel')){
  for(const edge of ['left','right','top','bottom','corner']){
    const handle=document.createElement('div');handle.className=`resize-handle resize-${edge}`;
    handle.tabIndex=0;handle.setAttribute('role','separator');
    handle.setAttribute('aria-label',`${panel.classList.contains('video-panel')?'動画':'スキットル'}エリアのサイズ変更（矢印キーでも調整可能）`);
    handle.setAttribute('aria-orientation',['left','right'].includes(edge)?'vertical':'horizontal');
    let drag=null;
    function size(dx,dy,width,height){
      const maxWidth=panel.parentElement.clientWidth,minWidth=Math.min(280,maxWidth);
      if(['left','right','corner'].includes(edge))panel.style.width=`${Math.max(minWidth,Math.min(maxWidth,width+(edge==='left'?-dx:dx)))}px`;
      if(['top','bottom','corner'].includes(edge))panel.style.height=`${Math.max(300,Math.min(1400,height+(edge==='top'?-dy:dy)))}px`;
    }
    handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();handle.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,width:panel.getBoundingClientRect().width,height:panel.getBoundingClientRect().height};panel.classList.add('resizing');});
    handle.addEventListener('pointermove',e=>{if(drag&&drag.id===e.pointerId)size(e.clientX-drag.x,e.clientY-drag.y,drag.width,drag.height);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,()=>{drag=null;panel.classList.remove('resizing');});
    handle.addEventListener('keydown',e=>{const moves={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(!moves[e.key])return;e.preventDefault();e.stopPropagation();const rect=panel.getBoundingClientRect();size(...moves[e.key],rect.width,rect.height);});
    panel.append(handle);
  }
}
$('reset-layout').addEventListener('click',()=>document.querySelectorAll('.resizable-panel').forEach(p=>{p.style.removeProperty('width');p.style.removeProperty('height');}));
