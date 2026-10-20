import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLog} from '../data.js';
import {beginSync,playbackIndex,selectRow,finishSync} from '../review-state.js';
function fixture(){return {logs:parseLog('timestamp\n10\n20\n30\n40'),index:1,offset:0,syncMode:false};}
test('sync mode holds highlight through video playback and seeking',()=>{
  const state=fixture();beginSync(state);
  assert.equal(playbackIndex(state,0),1);assert.equal(playbackIndex(state,39),1);
  assert.equal(selectRow(state,3),null);assert.equal(state.index,3);
  assert.equal(playbackIndex(state,2),3);assert.equal(state.offset,0);
});
test('normal clicks seek to previous row end and highlight the clicked row',()=>{
  const state=fixture();
  for(let i=0;i<state.logs.length;i++){
    const target=selectRow(state,i);assert.equal(target,i===0?0:state.logs[i-1].time);
    assert.equal(playbackIndex(state,target),i);
  }
  state.offset=5;assert.equal(selectRow(state,2),25);assert.equal(playbackIndex(state,25),2);
  assert.equal(selectRow(state,0),0);
});
test('sync anchors selected row end, resumes at next row, and supports re-sync',()=>{
  const state=fixture();beginSync(state);selectRow(state,1);
  assert.equal(finishSync(state,27.5).time,20);
  assert.equal(state.offset,7.5);assert.equal(state.syncMode,false);
  assert.equal(playbackIndex(state,27.499),1);assert.equal(playbackIndex(state,27.5),2);
  assert.equal(selectRow(state,1),17.5);
  beginSync(state);selectRow(state,2);finishSync(state,50);
  assert.equal(state.offset,20);assert.equal(playbackIndex(state,49.999),2);
  assert.equal(playbackIndex(state,50),3);assert.equal(selectRow(state,2),40);
});
test('cancel mode preserves synchronization and restores video-driven highlight',()=>{
  const state=fixture();state.offset=5;beginSync(state);selectRow(state,3);
  state.syncMode=false;assert.equal(state.offset,5);assert.equal(playbackIndex(state,16),1);
});
test('mode entry with no highlight selects a valid anchor; invalid sync cannot replace offset',()=>{
  const state=fixture();state.index=-1;beginSync(state);assert.equal(state.index,0);
  assert.throws(()=>selectRow(state,10));assert.throws(()=>finishSync(state,NaN));
  assert.equal(state.syncMode,true);assert.equal(state.offset,0);
  state.syncMode=false;assert.throws(()=>finishSync(state,5));
});
test('fractional frames at epoch timestamp end boundaries move to next trial',()=>{
  const state={logs:parseLog('timestamp\n2026/09/28 15:18:07\n2026/09/28 15:19:30'),index:0,offset:0,syncMode:false};
  for(const frame of [1/30,37/30,103.033333333]){
    beginSync(state);selectRow(state,0);finishSync(state,frame);
    assert.equal(playbackIndex(state,frame),1);
    assert.equal(playbackIndex(state,frame-0.001),0);
  }
});
