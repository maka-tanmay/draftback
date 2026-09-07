const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const C=require('../recovery-core.js');
test('recovery security and consent labels are excluded',()=>{
 for(const label of ['Password','passportNumber','PASSPORTNUMBER','passport_no','otp','one-time-code','social security number','Credit Card','cc-number','Hint answer','Login ID','I agree to these terms','CVV','AADHAAR','bank account','national ID'])assert(C.sensitive(label),label);
 for(const label of ['Given name','Family name','Birth date','Passport office','Application type','Previous application','Reason','Address','Nationality'])assert(!C.sensitive(label),label);
});
test('typed snapshot values distinguish blank, false and multiselect arrays',()=>{
 assert(C.equal('', ''));assert(C.equal(false,false));assert(!C.equal(false,''));assert(C.equal(['en','hi'],['en','hi']));assert(!C.equal(['en'],['hi']));
});
function harness(){
 const local={},session={},records=new Map(),urls={1:'https://forms.example/apply?id=1',2:'https://forms.example/apply?id=1'},events=[];let allowed=true;
 const storage=memory=>({get:async key=>typeof key==='string'?{[key]:memory[key]}:{...memory},set:async data=>Object.assign(memory,structuredClone(data)),remove:async keys=>{for(const k of [].concat(keys))delete memory[k];}});
 const context=vm.createContext({URL,TextEncoder,crypto:global.crypto,console,importScripts(){},DraftBackCore:require('../shared.js'),DraftBackStore:{getRecord:async k=>records.get(k)||null,saveSnapshot:async d=>{records.set(d.fingerprint,{origin:d.origin,versions:[{text:d.text}]});return true;},clearSite:async()=>{const n=records.size;records.clear();return n;},clearAll:async()=>{records.clear();return true;}},chrome:{runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener(){}},onInstalled:{addListener(){}},onStartup:{addListener(){}}},tabs:{get:async id=>({id,url:urls[id]}),onRemoved:{addListener(){}},sendMessage:async(id,msg)=>events.push({id,msg})},storage:{local:storage(local),session:storage(session)},permissions:{contains:async()=>allowed,onRemoved:{addListener(){}}}}});
 context.chrome.permissions.onAdded={addListener(){}};
 context.chrome.tabs.onUpdated={addListener(){}};
 vm.runInContext(fs.readFileSync(require.resolve('../background.js'),'utf8'),context);
 const sender=(id=1,extra={})=>({id:'test',frameId:0,url:urls[id],tab:{id,incognito:false},...extra});
 return {call:(m,s=sender())=>context.handleMessage(m,s),sender,records,urls,session,events,deny:()=>{allowed=false;}};
}
test('recovery scopes survive reload, separate tabs and copied tab tokens',async()=>{
 const h=harness(),one=await h.call({type:'recovery:open'});await h.call({type:'recovery:save',scope:one.scope,entries:{name:'A',check:false}});
 const reload=await h.call({type:'recovery:open',token:one.token});assert.equal(reload.scope,one.scope);assert.equal(reload.entries.name,'A');
 const second=await h.call({type:'recovery:open',token:one.token},h.sender(2));assert.notEqual(second.scope,one.scope);assert.notEqual(second.token,one.token);
});
test('exact browser URL, including query and fragment, scopes SPA drafts',async()=>{
 const h=harness(),originalSender=h.sender(),one=await h.call({type:'recovery:open'});
 h.urls[1]='https://forms.example/apply?id=2#step';const two=await h.call({type:'recovery:open'},originalSender);assert.notEqual(one.scope,two.scope);
 await assert.rejects(()=>h.call({type:'recovery:save',scope:one.scope,entries:{name:'Wrong'}},originalSender),/page changed/i);
});
test('another tab cannot read or overwrite a known scope',async()=>{
 const h=harness(),one=await h.call({type:'recovery:open'});await h.call({type:'recovery:open'},h.sender(2));
 for(const type of ['recovery:read','recovery:save'])await assert.rejects(()=>h.call({type,scope:one.scope,entries:{name:'Wrong'}},h.sender(2)),/page changed/i);
});
test('revoked permission, incognito and non-top frames cannot retain drafts',async()=>{
 const h=harness();await assert.rejects(()=>h.call({type:'recovery:open'},h.sender(1,{tab:{id:1,incognito:true}})),/permission/i);
 await assert.rejects(()=>h.call({type:'recovery:open'},h.sender(1,{frameId:4})),/permission/i);
 h.deny();await assert.rejects(()=>h.call({type:'recovery:open'}),/permission/i);
});
test('content scripts cannot enumerate legacy drafts or access profiles',async()=>{
 const h=harness();for(const type of ['data:listSite','data:getRecord','data:clearAll','profile:get','site:register'])await assert.rejects(()=>h.call({type,origin:'https://forms.example'}));
});
test('oversized or invalid draft payloads are rejected',async()=>{
 const h=harness(),open=await h.call({type:'recovery:open'});
 for(const entries of [{a:{password:'not supported'}},{a:'x'.repeat(300001)},Array(10).fill('x')])await assert.rejects(()=>h.call({type:'recovery:save',scope:open.scope,entries}));
});
test('site deletion invalidates pending scopes so stale saves cannot resurrect drafts',async()=>{
 const h=harness(),open=await h.call({type:'recovery:open'});await h.call({type:'recovery:save',scope:open.scope,entries:{name:'A'}});
 await h.call({type:'data:clearSite',origin:'https://forms.example'},{id:'test',url:'chrome-extension://test/popup.html'});
 assert.equal(h.records.size,0);await assert.rejects(()=>h.call({type:'recovery:save',scope:open.scope,entries:{name:'A'}}),/page changed/i);
 assert.notEqual((await h.call({type:'recovery:open',token:open.token})).scope,open.scope);
});
