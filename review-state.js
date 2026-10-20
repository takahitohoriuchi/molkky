import {activeIndex,syncHighlighted} from './data.js?v=20261020-5';

export function beginSync(state) {
  state.syncMode=true;
  if(!state.logs[state.index])state.index=0;
}
export function playbackIndex(state,time) {
  return state.syncMode?state.index:activeIndex(state.logs,time,state.offset);
}
export function selectRow(state,index) {
  if(!state.logs[index])throw new Error('ログ行がありません。');
  if(state.syncMode){state.index=index;return null;}
  return index===0?0:state.logs[index-1].time+state.offset;
}
export function finishSync(state,time) {
  if(!state.syncMode)throw new Error('同期調整モードを有効にしてください。');
  const result=syncHighlighted(state.logs,state.index,time);
  state.offset=result.offset;state.syncMode=false;
  return result.log;
}
