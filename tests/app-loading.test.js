import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as data from '../data.js';
import * as review from '../review-state.js';
import {followLogRow} from '../log-scroll.js';

// Exercise app initialization and its actual drop/submit handlers without media or network access.
const html=(await readFile(new URL('../index.html',import.meta.url),'utf8')).replace(/<!--[\s\S]*?-->/g,'');
const source=(await readFile(new URL('../app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
class Element {
  constructor(id=''){this.id=id;this.children=[];this.listeners=new Map();this.hidden=false;this.value='';this.textContent='';this.style={};this.classList={toggle(){},add(){},remove(){}};}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  emit(name,event={}){return this.listeners.get(name)?.({preventDefault(){},...event});}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){}
  removeAttribute(){}
  closest(){return new Element();}
  pause(){}
  load(){}
}
function setup(){
  const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,new Element(id)]));
  const video=nodes.get('video');video.currentTime=0;video.duration=100;video.readyState=1;
  const location={value:'#load',get hash(){return this.value;},set hash(value){this.value=value.startsWith('#')?value:'#'+value;}};const pages=['home','play','load','review'].map(id=>nodes.get(id));
  let fetches=0,objectURLs=0;
  const context=vm.createContext({
    ...data,...review,followLogRow,location,
    document:{getElementById:id=>nodes.get(id)||null,querySelectorAll:selector=>selector==='.page'?pages:[],addEventListener(){},body:new Element(),createElement:()=>new Element(),createElementNS:()=>new Element()},
    window:{addEventListener(){},scrollTo(){}},
    ResizeObserver:class{observe(){}},requestAnimationFrame(){},
    URL:{createObjectURL(){objectURLs++;return 'blob:local-video';},revokeObjectURL(){}},
    fetch(){fetches++;throw new Error('Local input must not access the network');},
  });
  vm.runInContext(source,context);
  const drop=(kind,file)=>nodes.get(`drop-${kind}`).emit('drop',{dataTransfer:{files:[file]}});
  return {nodes,context,drop,location,counts:()=>({fetches,objectURLs})};
}
test('local drag/drop and submit initialize review without any bundled data or network access',async()=>{
  const app=setup();
  app.drop('video',{name:'match.mp4'});
  app.drop('log',{name:'match.csv',text:async()=> 'timestamp,turn,player,pins\n2026/09/28 15:18:07,1,A,7\n2026/09/28 15:19:30,2,B,1;2'});
  const pending=app.nodes.get('load-form').emit('submit');
  assert.equal(app.nodes.get('load-submit').disabled,true);
  await pending;
  assert.equal(app.nodes.get('load-error').textContent,'');
  assert.equal(app.location.hash,'#review');
  assert.equal(app.nodes.get('review').hidden,false);
  assert.equal(app.nodes.get('video').src,'blob:local-video');
  assert.equal(app.nodes.get('log-body').children.length,2);
  assert.equal(app.nodes.get('load-submit').disabled,false);
  assert.deepEqual(app.counts(),{fetches:0,objectURLs:1});
});
test('invalid CSV clears loading state and allows retry',async()=>{
  const app=setup();app.drop('video',{name:'match.mp4'});
  app.drop('log',{name:'broken.csv',text:async()=> 'timestamp\nbad'});
  await app.nodes.get('load-form').emit('submit');
  assert.notEqual(app.nodes.get('load-error').textContent,'');
  assert.equal(app.nodes.get('load-submit').disabled,false);
  assert.equal(vm.runInContext('state.loading',app.context),false);
  app.drop('log',{name:'fixed.csv',text:async()=> 'timestamp\n00:10'});
  await app.nodes.get('load-form').emit('submit');
  assert.equal(app.nodes.get('load-error').textContent,'');
  assert.equal(app.location.hash,'#review');
});
