import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {CDP,pause,until} from './browser-test-utils.mjs';
const endpoint=`http://127.0.0.1:${process.argv[2]||58553}`,clients=[];
const list=()=>fetch(endpoint+'/json/list').then(r=>r.json());
const connect=url=>{const c=new CDP(url);clients.push(c);return c;};
const browser=connect((await fetch(endpoint+'/json/version').then(r=>r.json())).webSocketDebuggerUrl);
const ext=(await browser.send('Extensions.getExtensions')).extensions.find(e=>e.name==='DraftBack'),base=`chrome-extension://${ext.id}/`;
const preauthorized=process.argv.includes('--preauthorized');
const report={version:ext.version,date:new Date().toISOString(),permissionSetup:preauthorized?'Runtime-identical test copy with named test hosts preauthorized; native Comet shipping-install test recorded separately. No direct recovery-engine restore calls.':'Shipping manifest; optional host permission requested using browser dialog. No direct site registration or recovery-engine restore calls.',checks:[]};
const out='tests/browser-results/recovery';
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('tests/recovery-fixture.html'));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
async function page(url){const {targetId}=await browser.send('Target.createTarget',{url});const p={id:targetId,url,c:connect((await until(async()=>(await list()).find(t=>t.id===targetId),'Missing page')).webSocketDebuggerUrl)};await p.c.send('Page.enable');await until(()=>p.c.eval('document.readyState==="complete"'),'Page not loaded',200);return p;}
async function ax(p){return (await p.c.send('Accessibility.getFullAXTree')).nodes;}
async function textVisible(p,re){return (await ax(p)).some(n=>re.test(n.name?.value||''));}
async function clickAX(p,label){const node=(await ax(p)).find(n=>n.role?.value==='button'&&n.name?.value===label);assert(node,'Missing visible button: '+label);const {model}=await p.c.send('DOM.getBoxModel',{backendNodeId:node.backendDOMNodeId});const q=model.content,x=(q[0]+q[2])/2,y=(q[1]+q[5])/2;await p.c.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await p.c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});}
async function type(p,selector,value){await p.c.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);await p.c.send('Input.insertText',{text:value});}
async function reload(p){const old=await p.c.eval('performance.timeOrigin');await p.c.send('Page.reload',{ignoreCache:true});await until(()=>p.c.eval(`performance.timeOrigin!==${old}&&document.readyState==='complete'`),'Reload incomplete',200);}
async function check(name,fn){try{await fn();report.checks.push({name,status:'PASS'});console.log('PASS',name);}catch(e){report.checks.push({name,status:'FAIL',error:e.message});throw e;}}
try{
 const control=await page(base+'settings.html'),manager=await page('chrome://extensions/');
 const grant=async url=>{const pattern=new URL(url).protocol+'//'+new URL(url).hostname+'/*';if(preauthorized)return;assert(await control.c.eval(`chrome.permissions.request({origins:[${JSON.stringify(pattern)}]})`),'Permission not granted');};
 const site=await page(origin+'/?case=native');
 await check('tested runtime matches source',async()=>{assert.equal(ext.version,'0.7.1');if(!preauthorized)assert.equal(JSON.parse(fs.readFileSync(ext.path+'/manifest.json')).host_permissions,undefined);for(const f of ['background.js','popup.js','recovery.js','recovery-core.js',...preauthorized?[]:['manifest.json']])assert.equal(fs.readFileSync(ext.path+'/'+f,'utf8'),fs.readFileSync(f,'utf8'),f);});
 await check(preauthorized?'permitted page starts with popup closed':'optional permission grant activates existing page with popup closed',async()=>{if(!preauthorized)assert(!await textVisible(site,/DraftBack is ready/));await grant(origin);await until(()=>textVisible(site,/DraftBack is ready/),'Permission did not activate protection',200);});
 await check('trusted typing, reload, visible in-page button, exact restoration',async()=>{
   await type(site,'[name=firstName]','Alex');await type(site,'[name=shortReason]','Family visit.');
   await until(()=>textVisible(site,/2 answers saved locally/),'No save confirmation');await reload(site);
   assert.equal(await site.c.eval(`document.querySelector('[name=firstName]').value`),'');
   await until(()=>textVisible(site,/Restore my answers/),'Missing recovery button after reload',200);
   await clickAX(site,'Restore my answers');await until(()=>textVisible(site,/Restored 2 answers/),'Restore did not complete');
   assert.equal(await site.c.eval(`document.querySelector('[name=firstName]').value`),'Alex');assert.equal(await site.c.eval('submits'),0);
 });
 await check('missing persistent registration self-repairs on reload without popup',async()=>{
   await control.c.eval(`chrome.scripting.unregisterContentScripts()`);await reload(site);
   await until(()=>textVisible(site,/Restore my answers/),'Missing-registration fallback failed',200);
   assert((await control.c.eval(`chrome.scripting.getRegisteredContentScripts()`)).length>0);
 });
 await check('real popup shows ready state and restores through its visible button',async()=>{
   await browser.send('Target.activateTarget',{targetId:site.id});
   const target=(await browser.send('Target.getTargets',{filter:[{type:'tab'}]})).targetInfos.find(t=>t.url===site.url);
   await browser.send('Extensions.triggerAction',{id:ext.id,targetId:target.targetId});
   const pop={c:connect((await until(async()=>(await list()).find(t=>t.url===base+'popup.html'),'Popup missing')).webSocketDebuggerUrl)};
   await until(()=>textVisible(pop,/Unfinished form found/),'Popup stuck during initialization');
   await clickAX(pop,'Restore my answers');await until(()=>textVisible(pop,/Restored 2 answers/),'Popup restore failed');
   assert.equal(await site.c.eval(`document.querySelector('[name=shortReason]').value`),'Family visit.');
 });
 await check('new permitted tab starts protection without opening extension',async()=>{const p=await page(origin+'/?case=new-tab');await until(()=>textVisible(p,/DraftBack is ready/),'New tab unprotected');});
 await check('RoboForm trusted typing and visible restore after two reloads',async()=>{
   await grant('https://www.roboform.com');const p=await page('https://www.roboform.com/filling-test-all-fields');
   await until(()=>textVisible(p,/DraftBack is ready/),'RoboForm not protected',200);
   report.roboformFields=await p.c.eval(`Array.from(document.querySelectorAll('input,textarea')).filter(e=>e.type==='text'||e.tagName==='TEXTAREA').map(e=>({name:e.name,id:e.id}))`);
   const fields=['02frstname','04lastname'];
   assert.equal(fields.length,2,JSON.stringify(report.roboformFields));
   await type(p,'[name="'+fields[0]+'"]','Alex');await type(p,'[name="'+fields[1]+'"]','Example');
   await until(()=>textVisible(p,/2 answers saved locally/),'RoboForm save not acknowledged');
   for(let i=0;i<2;i++){await reload(p);await until(()=>textVisible(p,/Restore my answers/),'RoboForm no Restore after reload',200);await clickAX(p,'Restore my answers');await until(()=>textVisible(p,/Restored 2 answers/),'RoboForm restore failed');assert.equal(await p.c.eval(`document.querySelector(${JSON.stringify('[name="'+fields[0]+'"]')}).value`),'Alex');}
   fs.writeFileSync(out+'/roboform-071-restored.png',Buffer.from((await p.c.send('Page.captureScreenshot')).data,'base64'));
 });
 if(!preauthorized)await check('revoked host stays off after reload',async()=>{
   await control.c.eval(`chrome.permissions.remove({origins:['http://127.0.0.1/*']})`);await reload(site);await pause(800);
   assert(!await textVisible(site,/DraftBack is ready|Restore my answers/));
 });
}finally{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/lifecycle-071.json',JSON.stringify(report,null,2));for(const c of clients)c.close();server.close();}
