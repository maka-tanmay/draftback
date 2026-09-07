const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function harness() {
  const events={},local={},scripts=new Map(),injected=[];
  let allowed=false;
  const event=name=>({addListener:fn=>{events[name]=fn;}});
  const tab={id:1,url:'https://forms.example/apply',incognito:false};
  const chrome={
    runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:event('message'),onInstalled:event('install'),onStartup:event('startup')},
    storage:{local:{get:async k=>({[k]:local[k]}),set:async v=>Object.assign(local,v)}},
    permissions:{contains:async()=>allowed,getAll:async()=>({origins:allowed?['https://forms.example/*']:[]}),onAdded:event('grant'),onRemoved:event('revoke')},
    tabs:{query:async()=>[tab],get:async()=>tab,onUpdated:event('updated'),onRemoved:event('removed'),sendMessage:async(id,m)=>{
      if(m.type==='permission:removed'){injected.length=0;return {};}
      if(!injected.length)throw Error('No receiver');
      return {active:true,ready:true,available:2};
    }},
    scripting:{getRegisteredContentScripts:async({ids}={})=>[...scripts.values()].filter(s=>!ids||ids.includes(s.id)),
      registerContentScripts:async rows=>{await Promise.resolve();for(const r of rows){if(scripts.has(r.id))throw Error('Duplicate registration');scripts.set(r.id,r);}},
      updateContentScripts:async rows=>rows.forEach(r=>scripts.set(r.id,{...scripts.get(r.id),...r})),
      unregisterContentScripts:async({ids})=>ids.forEach(id=>scripts.delete(id)),
      executeScript:async options=>{injected.push(options);return [];}}
  };
  const c=vm.createContext({chrome,URL,console,importScripts(){},DraftBackCore:require('../shared.js'),DraftBackStore:{clearExpired:async()=>{}}});
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'),'utf8'),c);
  return {c,events,scripts,injected,tab,allow:v=>{allowed=v;}};
}
async function settled(h){for(let i=0;i<10;i++){await new Promise(r=>setImmediate(r));await vm.runInContext('registrationQueue',h.c);}}
test('grant event alone registers and activates even when the popup is gone',async()=>{
  const h=harness();h.allow(true);h.events.grant({origins:['https://forms.example/*']});await settled(h);
  assert.equal(h.scripts.size,1);assert.equal(h.injected.length,1);
  const script=[...h.scripts.values()][0];assert.equal(script.persistAcrossSessions,true);assert.equal(script.runAt,'document_start');
});
test('reload repairs missing registration and injects without opening the popup',async()=>{
  const h=harness();h.allow(true);h.events.updated(1,{status:'complete'});await settled(h);
  assert.equal(h.scripts.size,1);assert.equal(h.injected.length,1);
  h.events.updated(1,{status:'complete'});await settled(h);assert.equal(h.injected.length,1);
});
test('concurrent grant and popup registration do not collide',async()=>{
  const h=harness();h.allow(true);h.events.grant({origins:['https://forms.example/*']});
  await Promise.all(Array.from({length:8},()=>h.c.registerSite('https://forms.example')));await settled(h);assert.equal(h.scripts.size,1);
});
test('ungranted and private tabs never activate',async()=>{
  const h=harness();assert.equal(await h.c.activateTab(1),null);h.allow(true);h.tab.incognito=true;
  assert.equal(await h.c.activateTab(1),null);assert.equal(h.injected.length,0);assert.equal(h.scripts.size,0);
});
test('revocation removes registration even when local registration metadata is missing',async()=>{
  const h=harness();h.allow(true);await h.c.activateTab(1);await vm.runInContext("chrome.storage.local.set({siteRegistrations:{}})",h.c);
  h.allow(false);h.events.revoke({origins:['https://forms.example/*']});await settled(h);
  assert.equal(h.scripts.size,0);assert.equal(h.injected.length,0);
  h.events.updated(1,{status:'complete'});await settled(h);assert.equal(h.injected.length,0);
});
