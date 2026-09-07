import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {CDP,pause,until} from './browser-test-utils.mjs';
const endpoint=`http://127.0.0.1:${process.argv[2]||58552}`,clients=[];
const list=()=>fetch(endpoint+'/json/list').then(r=>r.json());
const connect=url=>{const c=new CDP(url);clients.push(c);return c;};
const browser=connect((await fetch(endpoint+'/json/version').then(r=>r.json())).webSocketDebuggerUrl);
const ext=(await browser.send('Extensions.getExtensions')).extensions.find(e=>e.name==='DraftBack'),base=`chrome-extension://${ext.id}/`;
const report={version:ext.version,extractedPath:ext.path,checks:[]},out='tests/browser-results/recovery';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<label>Name<input name="name"></label>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
async function page(url){const {targetId}=await browser.send('Target.createTarget',{url});const p={id:targetId,c:connect((await until(async()=>(await list()).find(t=>t.id===targetId),'Missing page')).webSocketDebuggerUrl)};await p.c.send('Page.enable');await until(()=>p.c.eval('document.readyState==="complete"'),'Page not loaded');return p;}
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name);}
try{
 await check('extracted runtime matches source, manifest has no required hosts',async()=>{const manifest=JSON.parse(fs.readFileSync(ext.path+'/manifest.json'));assert.equal(manifest.version,'0.7.1');assert.equal(manifest.host_permissions,undefined);for(const f of ['manifest.json','background.js','recovery-core.js','recovery.js','popup.html','popup.js','onboarding.html','onboarding.js','ui.css'])assert.equal(fs.readFileSync(ext.path+'/'+f,'utf8'),fs.readFileSync(f,'utf8'),f);});
 const tour=await page(base+'onboarding.html');
 await check('no host access or profile on fresh installation',async()=>{const data=await tour.c.eval(`Promise.all([chrome.permissions.getAll(),chrome.storage.local.get('autofillProfile')])`);assert.equal(data[0].origins?.length||0,0);assert.equal(data[1].autofillProfile,undefined);});
 await check('keyboard activation and inactive tour controls',async()=>{assert(await tour.c.eval(`document.getElementById('demo-reload').disabled && document.getElementById('demo-restore').disabled`));await tour.c.eval(`document.getElementById('demo-type').focus()`);await tour.c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});await tour.c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await until(()=>tour.c.eval(`!document.getElementById('demo-reload').disabled`),'Keyboard sample failed');});
 await check('real reload then four exact practice answers restored',async()=>{const before=await tour.c.eval('performance.timeOrigin');await tour.c.eval(`document.getElementById('demo-reload').click()`);await until(()=>tour.c.eval(`performance.timeOrigin!==${before} && document.readyState==='complete'`),'Reload failed');assert.equal(await tour.c.eval(`document.querySelector('[name=firstName]').value`),'');await tour.c.eval(`document.getElementById('demo-restore').click()`);await until(()=>tour.c.eval(`!document.getElementById('tour-done').hidden`),'Restore failed');assert.deepEqual(await tour.c.eval(`Object.fromEntries([...document.querySelector('form').elements].map(e=>[e.name,e.value]))`),{firstName:'Alex',birthDate:'1995-06-15',application:'renewal',reason:'Visiting family.'});});
 await check('390px layout and reduced motion',async()=>{await tour.c.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await tour.c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert(await tour.c.eval('document.documentElement.scrollWidth<=390'));fs.writeFileSync(out+'/walkthrough-mobile.png',Buffer.from((await tour.c.send('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'));});
 const site=await page(`http://127.0.0.1:${server.address().port}/`);
 await browser.send('Target.activateTarget',{targetId:site.id});
 const target=(await browser.send('Target.getTargets',{filter:[{type:'tab'}]})).targetInfos.find(t=>t.url===`http://127.0.0.1:${server.address().port}/`);
 await browser.send('Extensions.triggerAction',{id:ext.id,targetId:target.targetId});
 const pop=connect((await until(async()=>(await list()).find(t=>t.url===base+'popup.html'),'Popup missing')).webSocketDebuggerUrl);
 await check('first-use popup offers protection without a profile',async()=>{await until(()=>pop.eval(`!document.getElementById('toggle')?.disabled`),'Popup not ready');assert.equal(await pop.eval(`document.getElementById('toggle').textContent`),'Protect this site');assert(await pop.eval(`document.getElementById('fill-form').closest('details').open===false`));fs.writeFileSync(out+'/popup-first-use.png',Buffer.from((await pop.send('Page.captureScreenshot')).data,'base64'));});
 await check('real production background rejects capture without site permission',async()=>{const result=await pop.eval(`chrome.scripting.executeScript({target:{tabId:activeTab.id},func:()=>chrome.runtime.sendMessage({type:'recovery:open'})}).then(r=>r[0].result)`);assert.equal(result.ok,false);assert.match(result.error,/permission/i);});
 report.nativePermissionPrompt='Not automated: optional grant/deny requires manual confirmation. No shipping permissions bypassed.';
}finally{fs.writeFileSync(out+'/release.json',JSON.stringify(report,null,2));for(const c of clients)c.close();server.close();}
