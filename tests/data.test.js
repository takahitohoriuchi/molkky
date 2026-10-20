import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseCSV,parseTime,parseLog,parsePositions,positionFrames,initialPositions,activeIndex,cloudURL} from '../data.js';
const logText=await readFile(new URL('../samples/game.csv',import.meta.url),'utf8');
const positionText=await readFile(new URL('../samples/positions.csv',import.meta.url),'utf8');
const logs=parseLog(logText);
test('CSV: BOM, CRLF, quotes, commas and embedded newlines',()=>{assert.deepEqual(parseCSV('\uFEFFa,b\r\n"a,b","one\n""two"""\r\n'),[{a:'a,b',b:'one\n"two"'}]);});
test('CSV: reject broken quotes, inconsistent rows and duplicate headers',()=>{for(const input of ['a,b\n"hi,x','a,b\n1','a,a\n1,2'])assert.throws(()=>parseCSV(input));});
test('times: numeric, clock, fractional and zoned ISO',()=>{assert.equal(parseTime('12.5'),12.5);assert.equal(parseTime('01:02.5'),62.5);assert.equal(parseTime('01:02:03'),3723);assert.equal(parseTime('2026-10-20T12:00:00+09:00'),Date.parse('2026-10-20T03:00:00Z')/1000);for(const v of ['','1:90','bad','2026-10-20T12:00:00'])assert.throws(()=>parseTime(v));});
test('sample logs retain miss, multiple pins, score and notes',()=>{assert.equal(logs.length,6);assert.deepEqual(logs[1].pins,[10,11,12]);assert.deepEqual(logs[4].pins,[]);assert.equal(logs[4].score,0);});
test('Japanese aliases and inferred scores',()=>{const l=parseLog('試技,時刻,プレイヤー,倒れたスキットル\na,00:02,森,12\nb,00:05,空,1;2');assert.equal(l[0].score,12);assert.equal(l[1].score,2);});
test('reject unordered/duplicate times and IDs and invalid pins or scores',()=>{for(const text of ['timestamp\n2\n1','timestamp\n1\n1','throw,timestamp\na,1\na,2','timestamp,pins\n1,13','timestamp,pins\n1,1;1','timestamp,score\n1,nope'])assert.throws(()=>parseLog(text));});
test('end timestamps define trial intervals, including first/last and exact boundaries',()=>{
  const rows=parseLog('timestamp\n5\n10\n15');
  assert.equal(activeIndex([],0,0),-1);
  for(const [time,index] of [[0,0],[4.99,0],[5,1],[9.99,1],[10,2],[15,2],[100,2]])assert.equal(activeIndex(rows,time,0),index);
  assert.equal(activeIndex(rows,7,2),1);assert.equal(activeIndex(rows,3,-2),1);
});
test('absolute end timestamps and manual anchor preserve intervals',()=>{
  const l=parseLog('timestamp\n2026-10-20T12:00:00+09:00\n2026-10-20T12:00:05+09:00');
  const offset=10-l[0].time;
  assert.equal(activeIndex(l,9.999,offset),0);assert.equal(activeIndex(l,10,offset),1);
});
test('positions accumulate; before states are immutable; fallback stays at initial positions',()=>{const frames=positionFrames(logs,parsePositions(positionText,logs));assert.deepEqual(frames[0].before.get(7),initialPositions().get(7));assert.deepEqual(frames[0].after.get(7),{x:-80,y:-125});assert.deepEqual(frames[5].before.get(12),{x:85,y:-15});assert.deepEqual(frames[5].after.get(12),{x:130,y:40});assert.deepEqual(positionFrames(logs,new Map())[1].after,initialPositions());});
test('position CSV rejects unknown throw IDs, empty coordinates and duplicate pins',()=>{for(const text of ['throw,pin,x,y\nunknown,1,0,0','throw,pin,x,y\n1,1,,0','throw,pin,x,y\n1,1,0,0\n1,1,1,1','throw,pin,x,y\n1,13,0,0'])assert.throws(()=>parsePositions(text,logs));});
test('Google Sheets URL maps document ID and selected sheet; direct URLs preserved',()=>{assert.equal(cloudURL('https://docs.google.com/spreadsheets/d/abc-123/edit#gid=42','log'),'https://docs.google.com/spreadsheets/d/abc-123/export?format=csv&gid=42');assert.equal(cloudURL('https://example.com/a.csv','log'),'https://example.com/a.csv');for(const s of ['javascript:alert(1)','file:///tmp/a','https://user:pass@example.com','not-url'])assert.throws(()=>cloudURL(s,'log'));});

test('real September 28 log loads all 35 throws and preserves game/team/results',async()=>{
  const rows=parseLog(await readFile(new URL('../samples/20260928_1.csv',import.meta.url),'utf8'));
  assert.equal(rows.length,35);
  assert.equal(rows[0].time,Date.parse('2026-09-28T15:18:07+09:00')/1000);
  assert.equal(rows.at(-1).time-rows[0].time,1296);
  assert.equal(rows[0].game,'20260928game1');assert.equal(rows[0].goalScore,'30');
  assert.equal(rows[1].team,'チョキ');assert.equal(rows[1].player,'カイマ');
  assert.deepEqual(rows[1].pins,[2,5,6,7,9]);assert.equal(rows[1].score,5);
  assert.equal(rows[24].scoreBefore,'15');assert.equal(rows[24].total,'27');
  assert.equal(rows.at(-1).id,'35');assert.equal(rows.at(-1).total,'30');
  assert.equal(rows.at(-1).win,true);assert.equal(rows[0].win,false);
  assert.equal(rows[0].disqualified,false);assert.equal(rows[0].overGoal,false);
  assert.equal(rows[0].consecutiveMisses,'1');assert.equal(rows[0].note,'');
  assert.equal(activeIndex(rows,83,-rows[0].time),2);
});
test('native logger aliases preserve turn gaps, explicit scores, zero totals, flags and optional notes',()=>{
  const rows=parseLog('timestamp,turn,team,player,pins,throw_score,score_before,score_after,over_goal,win,disqualified,note\n2026/09/28 15:18:07,41,A,P,12,0,29,0,TRUE,FALSE,1,場外');
  assert.equal(rows[0].id,'41');assert.equal(rows[0].score,0);assert.equal(rows[0].total,'0');
  assert.equal(rows[0].overGoal,true);assert.equal(rows[0].disqualified,true);assert.equal(rows[0].note,'場外');
  const frames=positionFrames(rows,parsePositions('turn,pin,x,y\n41,12,100,80',rows));assert.deepEqual(frames[0].after.get(12),{x:100,y:80});
  assert.throws(()=>parseLog('timestamp,win\n0,maybe'));
});
test('logger wall-clock parsing is deterministic JST and rejects calendar rollover',()=>{
  assert.equal(parseTime('2026/09/28 15:18:07'),parseTime('2026-09-28T15:18:07+09:00'));
  for(const v of ['2026/02/30 12:00:00','2026/13/01 12:00:00','2026/09/28 24:00:00','2026/09/28 12:60:00'])assert.throws(()=>parseTime(v));
});

test('sync uses the highlighted row and current frame, and aligns later throws',async()=>{
  const {syncHighlighted}=await import('../data.js');
  const rows=parseLog(await readFile(new URL('../samples/20260928_1.csv',import.meta.url),'utf8'));
  const frameTime=100.5;
  const {log,offset}=syncHighlighted(rows,2,frameTime);
  assert.equal(log.id,'3');
  assert.equal(log.time+offset,frameTime);
  assert.equal(activeIndex(rows,frameTime,offset),3);
  assert.equal(rows[3].time+offset,126.5);
  assert.equal(activeIndex(rows,126.5,offset),4);
  assert.equal(syncHighlighted(rows,3,frameTime).log.id,'4');
  for(const i of [-1,-2,rows.length,0.5])assert.throws(()=>syncHighlighted(rows,i,frameTime));
  for(const t of [NaN,Infinity,-1])assert.throws(()=>syncHighlighted(rows,0,t));
});
