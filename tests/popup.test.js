const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness() {
  const nodes=new Map(),intervals=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:true,textContent:'',classList:{toggle(){}},addEventListener(){}});return nodes.get(id);};
  let resolveActivation,current={active:true,ready:false,available:0,saved:0};
  const activation=new Promise(resolve=>{resolveActivation=resolve;});
  const chrome={runtime:{sendMessage:async m=>({ok:true,value:m.type==='site:activate'?await activation:m.type==='data:listSite'?[]:{}})},
    tabs:{query:async()=>[{id:1,url:'https://forms.example/apply'}],sendMessage:async()=>current},
    permissions:{contains:async()=>true},scripting:{executeScript:async()=>[{result:false}]}};
  const context=vm.createContext({chrome,document:{getElementById:node},URL,Promise,setTimeout:()=>0,setInterval:fn=>intervals.push(fn),DraftBackCore:require('../shared.js')});
  vm.runInContext(fs.readFileSync(require.resolve('../popup.js'),'utf8'),context);
  return {node,intervals,ready:s=>{current=s;resolveActivation(s);},state:s=>{current=s;}};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('popup waits for activation and reveals Restore without being reopened',async()=>{
  const h=harness();await settle();assert.equal(h.node('site-state').textContent,'Starting protection…');assert.equal(h.node('restore').hidden,true);
  h.ready({active:true,ready:true,saved:3,available:3,supported:10,excluded:0});await settle();
  assert.equal(h.node('site-state').textContent,'Unfinished form found');assert.equal(h.node('restore').hidden,false);assert.equal(h.node('toggle').disabled,false);
});
test('popup live status discovers late recovery fields and subsequent errors',async()=>{
  const h=harness();h.ready({active:true,ready:true,saved:2,available:0});await settle();assert.equal(h.node('restore').hidden,true);
  h.state({active:true,ready:true,saved:2,available:2});await h.intervals[0]();assert.equal(h.node('restore').hidden,false);
  h.state({active:true,ready:true,saved:2,available:0,error:'Storage unavailable'});await h.intervals[0]();
  assert.equal(h.node('site-state').textContent,'Save needs attention');assert.equal(h.node('site-detail').textContent,'Storage unavailable');
});
