(function () {
  'use strict';
  if (globalThis.DraftBackRecovery || window.top !== window) return;
  const C = DraftBackRecoveryCore, demo = location.protocol === 'chrome-extension:';
  let active = true, ready = false, restoring = false, saved = {}, scope, route = location.href;
  let pending = 0, error = '', indicator = true, scanResult = {fields:[],unsupported:0};
  const touched = new Set(), baseline = new Map(), observed = new WeakSet();
  let queue = Promise.resolve(), initialization, initializingRoute, host, shadow;
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  function send(message) {
    return chrome.runtime.sendMessage(message).then(response => {
      if (!response?.ok) throw new Error(response?.error || 'DraftBack did not respond.');
      return response.value;
    });
  }
  function status() {
    const available = scanResult.fields.filter(f => Object.hasOwn(saved,f.key) && C.canRestore(f,saved[f.key],baseline.get(f.key),touched.has(f.key))).length;
    return {active,ready,pending,error,saved:Object.keys(saved).length,available,supported:scanResult.fields.length,excluded:scanResult.unsupported};
  }
  function render(note) {
    if (demo || !document.documentElement) return;
    if (!host) {
      // An unpacked-extension update leaves the previous context's UI in existing documents.
      document.querySelectorAll('[data-draftback-ui]').forEach(old => old.remove());
      host = document.createElement('div'); host.dataset.draftbackUi = '';
      host.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:calc(100vw - 32px)';
      shadow=host.attachShadow({mode:'closed'}); document.documentElement.append(host);
      const style=document.createElement('style');style.textContent=':host{all:initial}section{font:14px/1.5 system-ui;color:#f7f6ff;background:#171a2b;border:1px solid #686782;border-radius:12px;padding:12px 16px;box-shadow:0 5px 24px #0005;max-width:360px}button{font:inherit;color:white;background:#b92c60;border:0;border-radius:7px;padding:7px 12px;margin:8px 8px 0 0;cursor:pointer}button:focus-visible{outline:3px solid #ff9fbd}small{display:block;color:#c3c6d8}';shadow.append(style);
    }
    shadow.querySelector('section')?.remove();
    const s=status(), panel=document.createElement('section'), text=document.createElement('div');
    text.setAttribute('role','status');
    text.textContent=note || (error ? 'DraftBack could not save. Open the extension to retry.' : !active ? 'DraftBack protection stopped.' : pending ? 'DraftBack · Saving locally…' : s.available ? `Unfinished form found · ${s.available} answers can be restored` : s.saved ? `DraftBack · ${s.saved} answers saved locally` : 'DraftBack is ready · Start filling your form');
    panel.append(text);
    if(s.available && active) {const b=document.createElement('button');b.textContent='Restore my answers';b.disabled=restoring;b.onclick=()=>restore().catch(fail);panel.append(b);}
    const small=document.createElement('small');small.textContent='Temporary · 24 hours · Security fields, consent and custom widgets may be excluded';panel.append(small);
    const hide=document.createElement('button');hide.textContent='Hide';hide.onclick=()=>{host.hidden=true;};panel.append(hide);
    shadow.append(panel);host.hidden=!indicator && !s.available && !error;
  }
  function fail(e) {error=e.message;render();}
  function persist() {
    if (!active || !ready) return queue;
    const entries=structuredClone(saved), currentScope=scope;
    pending++;render();
    queue=queue.catch(()=>{}).then(()=>send({type:'recovery:save',scope:currentScope,entries,demo})).then(()=>{error='';},e=>{fail(e);}).finally(()=>{pending--;render();});
    return queue;
  }
  function capture(event) {
    if(!active || (restoring && !event.isTrusted)) return;
    if(location.href!==route) {initialize().then(()=>capture(event)).catch(fail);return;}
    scan();
    const target=event.composedPath()[0];
    const match=scanResult.fields.find(f=>f.el===target || (f.kind==='editable' && f.el.contains(target)));
    if(!match) return;
    const affected=match.kind==='radio' && match.el.name ? scanResult.fields.filter(f=>f.kind==='radio' && f.el.name===match.el.name && f.el.form===match.el.form && f.el.getRootNode()===match.el.getRootNode()) : [match];
    for(const f of affected) {touched.add(f.key);saved[f.key]=C.value(f.el);}
    if(ready) persist();
  }
  function observe(root) {
    if(observed.has(root)) return;observed.add(root);
    root.addEventListener('input',capture,true);root.addEventListener('change',capture,true);
    root.addEventListener('reset',()=>{if(active)render('Form reset. Your saved answers are still available.');setTimeout(()=>{touched.clear();scan();},0);},true);
  }
  function scan() {
    scanResult=C.fields();observe(document);
    for(const f of scanResult.fields) {
      if(!baseline.has(f.key)) baseline.set(f.key,structuredClone(C.value(f.el)));
      observe(f.el.getRootNode());
    }
  }
  function initialize() {
    if (initialization && initializingRoute === location.href) return initialization;
    initializingRoute = location.href;
    const task = initializeDraft();
    initialization = task;
    task.finally(() => { if (initialization === task) initialization = null; }).catch(() => {});
    return task;
  }
  async function initializeDraft() {
    if(!active) return;
    const href=location.href;route=href;ready=false;saved={};baseline.clear();touched.clear();scan();
    let token;try {token=sessionStorage.getItem('draftback-session-v1');} catch {}
    const result=await send({type:'recovery:open',token,demo});
    if(!active || location.href!==href) return;
    scope=result.scope;
    try {sessionStorage.setItem('draftback-session-v1',result.token);} catch {}
    saved={...result.entries,...saved};ready=true;error='';scan();render();
    if(touched.size) persist();
  }
  async function restore() {
    if(!ready || !active || restoring) return {restored:0,remaining:0};
    if(location.href!==route) {await initialize();return {restored:0,remaining:0};}
    restoring=true;
    const attempted=new Map();
    try {
      await queue;
      saved=await send({type:'recovery:read',scope,demo});
      for(const wait of [0,150,400,850]) {
        await pause(wait);scan();
        for(const f of scanResult.fields) {
          if(!Object.hasOwn(saved,f.key) || attempted.has(f.key) || !C.canRestore(f,saved[f.key],baseline.get(f.key),touched.has(f.key))) continue;
          const wanted=structuredClone(saved[f.key]);
          if(C.write(f,wanted)) attempted.set(f.key,wanted);
        }
      }
      await pause(150);scan();
      const verified=scanResult.fields.filter(f=>attempted.has(f.key) && C.equal(C.value(f.el),attempted.get(f.key))).length;
      const remaining=Object.keys(saved).filter(key=>!scanResult.fields.some(f=>f.key===key && C.equal(C.value(f.el),saved[key]))).length;
      render(`Restored ${verified} answers. ${remaining ? `${remaining} saved answers need review or are unavailable.` : 'Review before submitting.'}`);
      return {restored:verified,remaining};
    } finally {restoring=false;}
  }
  globalThis.DraftBackRecovery={status,restore,flush:()=>queue,scan,ready:()=>ready};
  chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
    if(message.type==='recovery:discard') {saved={};touched.clear();try{sessionStorage.removeItem('draftback-session-v1');}catch{}respond({ok:true});initialize().catch(fail);}
    if(message.type==='recovery:resume') {
      active=true;
      (ready ? Promise.resolve() : initialize()).then(()=>{scan();render();respond(status());},e=>{fail(e);respond(status());});
      return true;
    }
    if(message.type==='permission:removed' && message.pattern===DraftBackCore.originPattern(location.origin)) {active=false;ready=false;render();respond({ok:true});}
    if(message.type==='recovery:status') {scan();respond(status());}
    if(message.type==='recovery:restore') {restore().then(respond,e=>respond({error:e.message}));return true;}
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local') return;
    if(changes.indicatorEnabled) {indicator=changes.indicatorEnabled.newValue!==false;render();}
    if(changes.draftRecords?.oldValue?.[scope] && !changes.draftRecords.newValue?.[scope]) {saved={};touched.clear();render();}
  });
  setInterval(()=>{
    if(!active)return;
    if(location.href!==route) initialize().catch(fail);
    else {const before=status().available;scan();if(!restoring && status().available!==before)render();}
  },500);
  const routeChanged=()=>{if(active && location.href!==route) initialize().catch(fail);};
  addEventListener('popstate',routeChanged);addEventListener('hashchange',routeChanged);
  globalThis.navigation?.addEventListener('navigatesuccess',routeChanged);
  // Listen before DOMContentLoaded so early typing on a slow-loading form is retained too.
  initialize().catch(fail);
  chrome.storage.local.get({indicatorEnabled:true}).then(p=>{indicator=p.indicatorEnabled;if(ready)render();}).catch(fail);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{scan();if(ready)render();},{once:true});
})();
