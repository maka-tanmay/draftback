"use strict";

importScripts("shared.js", "crypto.js", "store-runtime.js", "autofill.js");

const REGISTRATIONS_KEY = "siteRegistrations";

function registrationId(pattern) {
  let hash = 2166136261;
  for (const character of pattern) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `draftback_${(hash >>> 0).toString(16)}`;
}

function originFromPattern(pattern) {
  try {
    return new URL(pattern.replace("*", "")).origin;
  } catch {
    return null;
  }
}

async function registrations() {
  return (await chrome.storage.local.get(REGISTRATIONS_KEY))[REGISTRATIONS_KEY] || {};
}

let registrationQueue = Promise.resolve();
function registrationTask(task) {
  const next = registrationQueue.catch(() => {}).then(task);
  registrationQueue = next;
  return next;
}
function registerSite(origin) { return registrationTask(() => registerSiteNow(origin)); }
async function registerSiteNow(origin) {
  const pattern = DraftBackCore.originPattern(origin);
  const permitted = await chrome.permissions.contains({ origins: [pattern] });
  if (!permitted) throw new Error("Website permission is required before protection can start.");

  const id = registrationId(pattern);
  const current = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (!current.length) {
    await chrome.scripting.registerContentScripts([{
      id,
      matches: [pattern],
      js: ["shared.js", "recovery-core.js", "recovery.js"],
      runAt: "document_start",
      allFrames: false,
      persistAcrossSessions: true
    }]);
  } else {
    await chrome.scripting.updateContentScripts([{id,js:["shared.js","recovery-core.js","recovery.js"],runAt:"document_start",allFrames:false}]);
  }
  const sites = await registrations();
  const key = originFromPattern(pattern);
  for (const [storedOrigin, registration] of Object.entries(sites)) {
    if (registration.id === id && storedOrigin !== key) delete sites[storedOrigin];
  }
  sites[key] = { id, pattern };
  await chrome.storage.local.set({ [REGISTRATIONS_KEY]: sites });
  return { id, pattern };
}

function unregisterSite(origin) { return registrationTask(() => unregisterSiteNow(origin)); }
async function unregisterSiteNow(origin) {
  const sites = await registrations();
  const id = registrationId(DraftBackCore.originPattern(origin));
  if ((await chrome.scripting.getRegisteredContentScripts({ids:[id]})).length) {
    await chrome.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {});
  }
  for (const [storedOrigin, registration] of Object.entries(sites)) {
    if (registration.id === id) delete sites[storedOrigin];
  }
  await chrome.storage.local.set({ [REGISTRATIONS_KEY]: sites });
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, {
    type: "permission:removed",
    pattern: DraftBackCore.originPattern(origin)
  }).catch(() => {})));
}

async function activateTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.incognito || !/^https?:/.test(tab.url || '')) return null;
  const origin = new URL(tab.url).origin;
  if (!await chrome.permissions.contains({origins:[DraftBackCore.originPattern(origin)]})) return null;
  await registerSite(origin);
  let current = await chrome.tabs.sendMessage(tabId,{type:'recovery:status'},{frameId:0}).catch(() => null);
  if (!current) {
    await chrome.scripting.executeScript({target:{tabId},files:['shared.js','recovery-core.js','recovery.js']});
  }
  // Resume waits for initialization, including an already-injected engine that is still opening its draft.
  return chrome.tabs.sendMessage(tabId,{type:'recovery:resume'},{frameId:0});
}

async function activatePermittedTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => activateTab(tab.id).catch(() => null)));
}

async function reconcileRegistrations() {
  const permissionSet = new Set((await chrome.permissions.getAll()).origins || []);
  const sites = await registrations();
  for (const [origin, registration] of Object.entries(sites)) {
    if (!permissionSet.has(registration.pattern)) await unregisterSite(origin);
  }
  for (const pattern of permissionSet) {
    const origin = originFromPattern(pattern);
    if (origin) await registerSite(origin);
  }
}

async function senderCanWrite(sender, claimedOrigin) {
  if (!sender?.url || sender.tab?.incognito) return false;
  const senderOrigin = new URL(sender.url).origin;
  if (senderOrigin !== claimedOrigin) return false;
  return chrome.permissions.contains({ origins: [DraftBackCore.originPattern(senderOrigin)] });
}

async function handleMessage(message, sender) {
  const trustedPage = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL("")) && !sender.tab?.incognito;
  if (message?.type?.startsWith('recovery:')) return recoveryMessage(message,sender,trustedPage);
  if (message?.type?.startsWith('site:') && !trustedPage) throw new Error('Change website access in DraftBack.');
  if (message?.type?.startsWith('data:') && !trustedPage) throw new Error('Open DraftBack to access saved drafts.');
  if (message?.type?.startsWith("profile:") && !trustedPage) throw new Error("Profiles are available only in DraftBack's own pages.");
  if (sender.tab?.incognito && message?.type?.startsWith("data:")) {
    if (message.type === "data:save" || message.type === "data:markSubmitted") {
      throw new Error("Private browsing is unsupported; no draft was retained.");
    }
    return null;
  }
  switch (message?.type) {
    case "profile:get": {
      const { autofillProfile } = await chrome.storage.local.get("autofillProfile");
      return autofillProfile ? DraftBackCrypto.decrypt(autofillProfile) : {};
    }
    case "profile:save": {
      const profile = DraftBackAutofill.sanitize(message.profile);
      await chrome.storage.local.set({ autofillProfile: await DraftBackCrypto.encrypt(profile) });
      return true;
    }
    case "profile:delete":
      await chrome.storage.local.remove("autofillProfile");
      await chrome.storage.session.remove("profileCandidate");
      return true;
    case "site:register":
      return registerSite(message.origin);
    case "site:activate":
      return activateTab(message.tabId);
    case "site:unregister":
      await unregisterSite(message.origin);
      return true;
    case "data:save":
      if (!await senderCanWrite(sender, message.origin)) throw new Error("Website permission was removed.");
      return DraftBackStore.saveSnapshot(message);
    case "data:getRecord":
      return DraftBackStore.getRecord(message.fingerprint);
    case "data:listSite":
      return DraftBackStore.listSite(message.origin);
    case "data:deleteRecord":
      return DraftBackStore.deleteRecord(message.fingerprint);
    case "data:clearSite":
      return deleteDrafts(message.origin);
    case "data:clearExpired":
      return DraftBackStore.clearExpired();
    case "data:clearAll":
      if (!trustedPage) throw new Error("Delete all data from DraftBack settings.");
      return deleteDrafts(null);
    case "data:markSubmitted":
      if (!await senderCanWrite(sender, message.origin)) return false;
      return DraftBackStore.markSubmitted(message.fingerprint);
    case "data:stats":
      return DraftBackStore.stats();
    default:
      throw new Error("Unknown DraftBack request.");
  }
}

let recoveryQueue = Promise.resolve();
async function recoveryMessage(message,sender,trusted) {
  const currentUrl=sender.tab ? (await chrome.tabs.get(sender.tab.id)).url : '';
  const demo = trusted && sender.url === chrome.runtime.getURL('onboarding.html') && message.demo;
  if (sender.tab?.incognito || !sender.tab || sender.frameId !== 0 || (!demo && (new URL(currentUrl).origin!==new URL(sender.url).origin || !await senderCanWrite(sender,new URL(sender.url).origin)))) throw new Error('Website permission is required. Private browsing is unsupported.');
  // Serialise scope allocation across simultaneous tabs, including cloned sessionStorage.
  const task = recoveryQueue.catch(()=>{}).then(async()=>{
    const {recoveryTabs={}} = await chrome.storage.session.get('recoveryTabs');
    const id=String(sender.tab.id), origin=demo ? 'draftback-demo' : new URL(sender.url).origin;
    if(message.type==='recovery:open') {
      let token=recoveryTabs[id]?.token || message.token;
      if(!/^[a-f0-9-]{36}$/.test(token || '') || Object.entries(recoveryTabs).some(([tab,v])=>tab!==id && v.token===token)) token=crypto.randomUUID();
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([token,currentUrl])));
      const scope='form-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      recoveryTabs[id]={token,scope,url:currentUrl,origin};
      await chrome.storage.session.set({recoveryTabs});
      const record=demo ? null : await DraftBackStore.getRecord(scope);
      let entries={};try {entries=JSON.parse(record?.versions?.[0]?.text || '{}');} catch {}
      if(demo) entries=(await chrome.storage.session.get('demoDrafts')).demoDrafts?.[scope] || {};
      return {scope,token,entries};
    }
    const session=recoveryTabs[id];
    if(!session || session.scope!==message.scope || session.url!==currentUrl || session.origin!==origin) throw new Error('The page changed. Reopen DraftBack before saving.');
    if(message.type==='recovery:read') {
      if(demo) return (await chrome.storage.session.get('demoDrafts')).demoDrafts?.[session.scope] || {};
      const record=await DraftBackStore.getRecord(session.scope);
      return JSON.parse(record?.versions?.[0]?.text || '{}');
    }
    if(message.type==='recovery:save') {
      const entries=message.entries;
      if(!entries || typeof entries!=='object' || Array.isArray(entries) || Object.keys(entries).length>1000) throw new Error('This form is too large to protect.');
      for(const [key,value] of Object.entries(entries)) {
        if(key.length>4000 || !(typeof value==='string' || typeof value==='boolean' || (Array.isArray(value) && value.every(v=>typeof v==='string')))) throw new Error('Unsupported saved answer.');
      }
      const text=JSON.stringify(entries);
      if(text.length>300000) throw new Error('This form exceeds the temporary draft limit.');
      if(demo) {const {demoDrafts={}}=await chrome.storage.session.get('demoDrafts');demoDrafts[session.scope]=entries;await chrome.storage.session.set({demoDrafts});}
      else await DraftBackStore.saveSnapshot({fingerprint:session.scope,origin,pathPattern:'Form application (exact page)',confidence:'exact',text,versionId:crypto.randomUUID()});
      return true;
    }
    throw new Error('Unknown form recovery request.');
  });
  recoveryQueue=task;
  return task;
}

function deleteDrafts(origin) {
  const task=recoveryQueue.catch(()=>{}).then(async()=>{
    const {recoveryTabs={}}=await chrome.storage.session.get('recoveryTabs'), affected=[];
    for(const [id,session] of Object.entries(recoveryTabs)) {
      if(origin && (session.origin==='draftback-demo' || DraftBackCore.originPattern(session.origin)!==DraftBackCore.originPattern(origin))) continue;
      recoveryTabs[id]={...session,token:crypto.randomUUID(),scope:null};affected.push(Number(id));
    }
    await chrome.storage.session.set({recoveryTabs});
    let result;
    if(origin) result=await DraftBackStore.clearSite(origin);
    else {
      await chrome.storage.local.remove(['autofillProfile','guidedTour']);
      await chrome.storage.session.remove(['profileCandidate','demoDrafts']);
      result=await DraftBackStore.clearAll();
    }
    for(const tabId of affected) chrome.tabs.sendMessage(tabId,{type:'recovery:discard'}).catch(()=>{});
    return result;
  });
  recoveryQueue=task;return task;
}

chrome.tabs.onRemoved.addListener(tabId=>{
  recoveryQueue=recoveryQueue.catch(()=>{}).then(async()=>{
    const {recoveryTabs={}}=await chrome.storage.session.get('recoveryTabs');delete recoveryTabs[String(tabId)];await chrome.storage.session.set({recoveryTabs});
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.permissions.onRemoved.addListener(({ origins = [] }) => {
  for (const pattern of origins) {
    const origin = originFromPattern(pattern);
    if (origin) unregisterSite(origin).catch(() => {});
  }
});

// Permission setup must survive the popup closing during the browser's permission prompt.
chrome.permissions.onAdded.addListener(() => {
  reconcileRegistrations().then(activatePermittedTabs).catch(() => {});
});

// Repair missing registrations in upgraded/unpacked installations without requiring a popup visit.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'complete') activateTab(tabId).catch(() => {});
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  DraftBackStore.clearExpired().catch(() => {});
  reconcileRegistrations().then(activatePermittedTabs).catch(() => {});
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
});

chrome.runtime.onStartup.addListener(() => {
  DraftBackStore.clearExpired().catch(() => {});
  reconcileRegistrations().then(activatePermittedTabs).catch(() => {});
});
