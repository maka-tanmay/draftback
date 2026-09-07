'use strict';
const $=id=>document.getElementById(id);
let activeTab,origin,pattern,allowed=false,profile={},polling=false;
async function call(message){
  const response=await Promise.race([chrome.runtime.sendMessage(message),new Promise((_,reject)=>setTimeout(()=>reject(new Error('DraftBack did not respond.')),6000))]);
  if(!response?.ok)throw new Error(response?.error || 'DraftBack request failed.');return response.value;
}
async function inject(){return call({type:'site:activate',tabId:activeTab.id});}
async function state(){try{return await chrome.tabs.sendMessage(activeTab.id,{type:'recovery:status'},{frameId:0});}catch{return null;}}
function renderRecovery(current){
  $('site-state').textContent=!allowed?'Protection is off':current?.error?'Save needs attention':!current?.ready?'Starting protection…':current?.available?'Unfinished form found':current?.pending?'Saving locally…':current?.saved?'Your progress is saved':'Ready to protect your answers';
  $('site-detail').textContent=!allowed?'Enable before filling this application.':current?.error || (current?.ready?`${current.saved} saved answers · ${current.supported} supported controls · ${current.excluded} excluded or unavailable`:'Waiting for this page to be ready.');
  $('restore').hidden=!current?.ready || !current?.available;
}
async function refresh(){
  [activeTab]=await chrome.tabs.query({active:true,currentWindow:true});
  $('startup-error').hidden=true;
  let url;try{url=new URL(activeTab.url);}catch{}
  if(!url || !['http:','https:'].includes(url.protocol) || activeTab.incognito){$('site-state').textContent='Open a form in a regular browser window';$('site-detail').textContent='Private windows and browser-internal pages are unsupported.';$('toggle').disabled=true;return;}
  origin=url.origin;pattern=DraftBackCore.originPattern(origin);allowed=await chrome.permissions.contains({origins:[pattern]});
  renderRecovery(null);
  const current=allowed?await inject():null;
  renderRecovery(current);
  $('toggle').disabled=false;$('toggle').textContent=allowed?'Stop protecting this site':'Protect this site';
  $('toggle').classList.toggle('primary',!allowed);
  const records=await call({type:'data:listSite',origin});$('delete-site').hidden=!records.length;
  profile=await call({type:'profile:get'});
  $('profile-summary').textContent=Object.keys(profile).length?'Use saved details on a new form. Separate from recovery.':'Optional: save reusable details for filling future forms.';
  $('fill-form').disabled=!Object.keys(profile).length;$('remember-form').disabled=false;
  try{const [r]=await chrome.scripting.executeScript({target:{tabId:activeTab.id},func:()=>Boolean(globalThis.DraftBackForm?.hasUndo?.())});$('undo-fill').hidden=!r.result;$('undo-fill').disabled=!r.result;}catch{}
}
$('toggle').onclick=async()=>{
  try{
    if(allowed){if(!confirm('Stop future protection? Existing drafts remain until deleted or expired.'))return;await chrome.permissions.remove({origins:[pattern]});await call({type:'site:unregister',origin});}
    else{if(!await chrome.permissions.request({origins:[pattern]})){ $('status').textContent='Access was not granted. Nothing is being saved.';return;}await call({type:'site:register',origin});await inject();$('status').textContent='Protection enabled. Start typing; wait for Saved locally before reloading.';}
    await refresh();
  }catch(e){$('status').textContent=e.message;}
};
$('restore').onclick=async()=>{
  $('restore').disabled=true;
  try{const result=await chrome.tabs.sendMessage(activeTab.id,{type:'recovery:restore'},{frameId:0});if(result?.error)throw new Error(result.error);$('status').textContent=`Restored ${result.restored} answers. ${result.remaining} saved answers need review or are unavailable. Review before submitting.`;await refresh();}
  catch(e){$('status').textContent=e.message;}finally{$('restore').disabled=false;}
};
$('delete-site').onclick=async()=>{if(!confirm('Delete all drafts for this website?'))return;await call({type:'data:clearSite',origin});await refresh();};
$('delete-all').onclick=async()=>{if(!confirm('Delete all drafts, your optional profile and the encryption key?'))return;await call({type:'data:clearAll'});await refresh();};
$('settings').onclick=()=>chrome.runtime.openOptionsPage();
async function formAction(action) {
  const status = document.getElementById("fill-status");
  const buttons = ["fill-form", "remember-form", "undo-fill"].map(id => document.getElementById(id));
  buttons.forEach(button => { button.disabled = true; });
  try {
    const profile = action === "fill" ? await call({ type: "profile:get" }) : {};
    await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ["autofill.js", "autofill-page.js"] });
    const [response] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (operation, details) => globalThis.DraftBackForm[operation](details), args: [action, profile]
    });
    const result = response.result;
    if (action === "fill") {
      status.textContent = `Filled ${result.filled} fields. Kept ${result.preserved} existing answer${result.preserved === 1 ? "" : "s"}.${result.missing ? ` ${result.missing} matches need profile details.` : ""}${result.rejected ? ` ${result.rejected} fields could not accept the value.` : ""}${result.unmatched ? ` ${result.unmatched} fields need manual entry.` : ""}${result.embeddedForms ? " Embedded forms may need to be opened directly." : ""} Review the form before submitting.`;
    } else if (action === "undo") status.textContent = `Undid ${result.restored} filled fields.${result.manual ? ` ${result.manual} dropdown${result.manual===1?' needs':'s need'} manual clearing; this website does not allow automatic clearing.` : ''} Your later edits were kept.`;
    else if (!Object.keys(result.profile).length) status.textContent = "No reusable details found. Fill your name, contact or address fields first, or use Edit profile.";
    else {
      await chrome.storage.session.set({ profileCandidate: { ...result, createdAt: Date.now() } });
      await chrome.tabs.create({ url: chrome.runtime.getURL("profile.html") });
    }
  } catch (error) { status.textContent = `Could not access this form. Reopen DraftBack on the application page. ${error.message}`; }
  finally { await refresh().catch(startupError); }
}
document.getElementById("fill-form").addEventListener("click", () => formAction("fill"));
document.getElementById("remember-form").addEventListener("click", () => formAction("remember"));
document.getElementById("undo-fill").addEventListener("click", () => formAction("undo"));

function startupError(e){$('site-state').textContent='DraftBack could not get ready';$('startup-error').hidden=false;$('status').textContent=e?.message || '';}
$('retry-startup').onclick=()=>refresh().catch(startupError);
refresh().catch(startupError);
setInterval(async()=>{
  if(!allowed || !activeTab || polling) return;
  polling=true;
  try { const current=await state();if(current)renderRecovery(current); }
  finally { polling=false; }
},500);
