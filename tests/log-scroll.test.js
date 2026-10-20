import test from 'node:test';
import assert from 'node:assert/strict';
import {followLogRow} from '../log-scroll.js';
function viewport(scrollTop=200){return {scrollTop,clientTop:1,clientHeight:300,scrollHeight:1500,getBoundingClientRect:()=>({top:600}),querySelector:()=>({getBoundingClientRect:()=>({height:40})}),scrollTo(value){this.result=value;}};}
test('visible active row does not move the table',()=>{
  const box=viewport();followLogRow(box,{getBoundingClientRect:()=>({top:650,bottom:690})});assert.equal(box.result,undefined);
});
test('next active row below the viewport scrolls into view using viewport coordinates',()=>{
  const box=viewport();followLogRow(box,{getBoundingClientRect:()=>({top:910,bottom:950})});assert.equal(box.result.top,359);assert.equal(box.result.behavior,'auto');
});
test('backward seek scrolls above the sticky header and clamps at the first row',()=>{
  const box=viewport(0);followLogRow(box,{getBoundingClientRect:()=>({top:620,bottom:660})});assert.equal(box.result.top,0);
  const backward=viewport(600);followLogRow(backward,{getBoundingClientRect:()=>({top:600,bottom:640})});assert.equal(backward.result.top,449);
});
test('last row scroll is bounded by table content height',()=>{
  const box=viewport(1190);followLogRow(box,{getBoundingClientRect:()=>({top:910,bottom:950})});assert.equal(box.result.top,1200);
});
