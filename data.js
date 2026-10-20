export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], value = '', quoted = false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted && text[i+1]==='"') {value+='"';i++;} else if(quoted || value==='') quoted=!quoted; else throw new Error('CSVの引用符が不正です。');}
    else if(c===',' && !quoted) {row.push(value);value='';}
    else if((c==='\n'||c==='\r') && !quoted) {if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';}
    else value+=c;
  }
  if(quoted) throw new Error('CSVの引用符が閉じていません。');
  row.push(value);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2) throw new Error('CSVにはヘッダーと1行以上のデータが必要です。');
  const headers=rows.shift().map(h=>h.trim().toLowerCase());
  if(new Set(headers).size!==headers.length) throw new Error('CSVの列名が重複しています。');
  return rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`CSV ${i+2}行目の列数が一致しません。`);return Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));});
}
const parseFlag=value=>{if(value===undefined||value==='')return false;if(/^(true|1)$/i.test(value))return true;if(/^(false|0)$/i.test(value))return false;throw new Error(`真偽値「${value}」はTRUE/FALSEで指定してください。`);};
const pick=(r,keys)=>keys.map(k=>r[k]).find(v=>v!==undefined && v!=='');
export function parseTime(value) {
  if(value===undefined || value==='') throw new Error('タイムスタンプがありません。');
  if(/^\d+(\.\d+)?$/.test(value)) return Number(value);
  if(/^\d+:\d{2}(:\d{2})?(\.\d+)?$/.test(value)) {
    const p=value.split(':').map(Number);if(p.slice(1).some(n=>n>=60))throw new Error(`不正な時刻: ${value}`);
    return p.reduce((a,b)=>a*60+b,0);
  }
  // Logger timestamps have no timezone. Interpret their wall clock as Japan time.
  const local=/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if(local){
    const [year,month,day,hour,minute,second]=local.slice(1).map(Number);
    const utc=Date.UTC(year,month-1,day,hour,minute,second), date=new Date(utc);
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||hour>23||minute>59||second>59)throw new Error(`不正な日時: ${value}`);
    return utc/1000-9*3600;
  }
  if(/^\d{4}-\d{2}-\d{2}T/.test(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value)) {const t=Date.parse(value);if(Number.isFinite(t))return t/1000;}
  throw new Error(`時刻「${value}」は秒、mm:ss、hh:mm:ss、YYYY/MM/DD HH:mm:ss（日本時間）、タイムゾーン付きISO日時で入力してください。`);
}
export function parseLog(text) {
  const seen=new Set();
  const logs=parseCSV(text).map((r,i)=>{
    const id=pick(r,['turn','throw','id','試技']) || String(i+1);if(seen.has(id))throw new Error(`試技ID ${id} が重複しています。`);seen.add(id);
    const timestamp=pick(r,['timestamp','time','タイムスタンプ','時刻']);const time=parseTime(timestamp);
    const raw=pick(r,['pins','skittles','倒れたスキットル']) || '';
    const pins=raw?raw.replace(/[\[\]"]/g,'').split(/[\s,;|、]+/).filter(Boolean).map(Number):[];
    if(pins.some(n=>!Number.isInteger(n)||n<1||n>12)||new Set(pins).size!==pins.length)throw new Error(`${i+2}行目のスキットル番号は1〜12の重複しない整数にしてください。`);
    const scoreValue=pick(r,['throw_score','score','得点']);const score=scoreValue===undefined?(pins.length===1?pins[0]:pins.length):Number(scoreValue);
    if(!Number.isFinite(score)||score<0)throw new Error(`${i+2}行目の得点が不正です。`);
    return {id,time,timestamp,pins,score,player:pick(r,['player','team','プレイヤー','チーム']) || '—',team:pick(r,['team','チーム']) || '',game:r.game || '',goalScore:r.goal_score || '',scoreBefore:r.score_before || '',total:pick(r,['score_after','total','累計']) || '',consecutiveMisses:r.consecutive_misses || '',overGoal:parseFlag(r.over_goal),win:parseFlag(r.win),disqualified:parseFlag(r.disqualified),note:pick(r,['note','メモ']) || ''};
  });
  for(let i=1;i<logs.length;i++)if(logs[i].time<=logs[i-1].time)throw new Error('タイムスタンプは重複なしの昇順にしてください。');
  return logs;
}
export const initialPositions=()=>new Map([[1,-23,35],[2,23,35],[3,-46,-5],[10,0,-5],[4,46,-5],[5,-69,-45],[11,-23,-45],[12,23,-45],[6,69,-45],[7,-46,-85],[9,0,-85],[8,46,-85]].map(([id,x,y])=>[id,{x,y}]));
export function parsePositions(text,logs) {
  const ids=new Set(logs.map(l=>l.id)), result=new Map();
  for(const r of parseCSV(text)) {
    const id=pick(r,['turn','throw','試技']);const pin=Number(pick(r,['pin','スキットル']));
    const x=Number(r.x),y=Number(r.y);
    if(!ids.has(id))throw new Error(`配置CSVの試技 ${id} がログにありません。`);
    if(!Number.isInteger(pin)||pin<1||pin>12||r.x===undefined||r.y===undefined||r.x===''||r.y===''||!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>10000||Math.abs(y)>10000)throw new Error('配置CSVのpinは1〜12、x/yは±10000以内の数値で指定してください。');
    if(!result.has(id))result.set(id,new Map());
    if(result.get(id).has(pin))throw new Error(`試技 ${id} のスキットル ${pin} が重複しています。`);
    result.get(id).set(pin,{x,y});
  }
  return result;
}
export function positionFrames(logs,positions) {
  let current=initialPositions();
  return logs.map(log=>{const before=new Map(current);for(const [id,p] of positions.get(log.id)||[])current.set(id,p);return {before,after:new Map(current)};});
}
// Row n covers [end(n-1), end(n)). The final row remains visible after the game.
export function activeIndex(logs,videoTime,offset) {
  if(!logs.length)return -1;
  const t=videoTime-offset;let low=0,high=logs.length;
  while(low<high){const mid=(low+high)>>1;if(logs[mid].time<=t+1e-6)low=mid+1;else high=mid;}
  return Math.min(low,logs.length-1);
}
export function syncHighlighted(logs,index,videoTime) {
  if(!Number.isInteger(index)||!logs[index])throw new Error('同期する行がハイライトされていません。ログ行を選んでください。');
  if(!Number.isFinite(videoTime)||videoTime<0)throw new Error('動画の現在位置を取得できません。');
  return {log:logs[index],offset:videoTime-logs[index].time};
}
export function cloudURL(value,kind) {
  let url;try{url=new URL(value);}catch{throw new Error('有効なURLを入力してください。');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('httpまたはhttpsのURLを入力してください。');
  if(kind==='log' && url.hostname==='docs.google.com') {
    const id=url.pathname.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];if(!id)throw new Error('GoogleスプレッドシートのURLを確認してください。');
    const gid=url.searchParams.get('gid') || new URLSearchParams(url.hash.slice(1)).get('gid') || '0';
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  }
  return url.href;
}
export function clock(seconds) {const t=Math.max(0,seconds);return `${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`;}
