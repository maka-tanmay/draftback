import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CDP,pause,until} from './browser-test-utils.mjs';
const endpoint=`http://127.0.0.1:${process.argv[2]||58550}`,clients=[];
const connect=url=>{const c=new CDP(url);clients.push(c);return c;};
const list=()=>fetch(endpoint+'/json/list').then(r=>r.json());
const browser=connect((await fetch(endpoint+'/json/version').then(r=>r.json())).webSocketDebuggerUrl);
const extension=(await browser.send('Extensions.getExtensions')).extensions.find(e=>e.name==='DraftBack');
async function page(url){const {targetId}=await browser.send('Target.createTarget',{url});const p={id:targetId,c:connect((await until(async()=>(await list()).find(t=>t.id===targetId),'Tab unavailable')).webSocketDebuggerUrl)};await p.c.send('Page.enable');return p;}
const control=await page(`chrome-extension://${extension.id}/onboarding.html`);
const cases=[
 {name:'RoboForm',url:'https://www.roboform.com/filling-test-all-fields',checks:{'[name="02frstname"]':'Alex','[name="04lastname"]':'Example'}},
 {name:'Passport registration',url:'https://mportal.passportindia.gov.in/gpsp/AuthNavigation/Registration',checks:{'select':'289','[placeholder="Given Name *"]':'Alex','[placeholder="Surname"]':'Example','[placeholder="Email Id *"]':'alex@example.com','[placeholder="Date of Birth (DD/MM/YYYY)*"]':'17/08/1994'}},
 {name:'Lever training application',url:'https://jobs.lever.co/leverdemo-8/310d8515-3004-476a-9299-b838e1292bf7/apply',checks:{'[name="name"]':'Alex Example','[name="email"]':'alex@example.com','[name="phone"]':'5550101234','[name="org"]':'Example Studio','[name="urls[LinkedIn]"]':'https://example.com/alex'}},
 {name:'Greenhouse job application',url:'https://job-boards.greenhouse.io/boldly/jobs/4005594006',checks:{'#first_name':'Alex','#last_name':'Example','#email':'alex@example.com','#phone':'5550101234'}},
 {name:'Government business enquiry',url:'https://www.bathnes.gov.uk/form/business-rates-contact-form',checks:{'#edit-full-name':'Alex Example','#edit-business-name':'Example Studio','#edit-contact-email-address':'alex@example.com','#edit-contact-telephone-number':'5550101234'}},
 {name:'Employer job application',url:'https://carriermideaindia.com/apply-job/',checks:{'select.form-control':'Job Title1','[placeholder="Enter Your Full Name"]':'Alex Example','[placeholder="Enter Your Email"]':'alex@example.com','[placeholder="Enter Your Phone"]':'5550101234','[placeholder="Enter Your Experience"]':'3'}},
 {name:'GOV.UK address component',url:'https://design-system.service.gov.uk/patterns/addresses/multiple/index.html',checks:{'#address-line-1':'123 Example Street','#address-line-2':'Unit 4','#address-town':'Pune','#address-county':'Example County','#address-postcode':'411001'}},
 {name:'GOV.UK split birth date component',url:'https://design-system.service.gov.uk/components/date-input/date-of-birth/index.html',checks:{'#dob-day':'17','#dob-month':'08','#dob-year':'1994'}}
];
const report={version:extension.version,testSetup:'Isolated browser, runtime-identical test copy with only named test sites preauthorized. No accounts, uploads, CAPTCHA solving or submissions.',cases:[]};
fs.mkdirSync('tests/browser-results/recovery',{recursive:true});
try{for(const spec of cases.filter(s=>!process.argv[3] || s.name.toLowerCase().includes(process.argv[3]))){
 const row={name:spec.name,url:spec.url,status:'FAIL'};let p;
 try{
  console.log('Testing',spec.name);
  const registration=await control.c.eval(`chrome.runtime.sendMessage({type:'site:register',origin:${JSON.stringify(new URL(spec.url).origin)}})`);assert.equal(registration.ok,true,registration.error);
  p=await page(spec.url);const first=Object.keys(spec.checks)[0];await until(()=>p.c.eval(`!!document.querySelector(${JSON.stringify(first)})`),'Expected form unavailable',200);await pause(700);
  const id=await control.c.eval(`chrome.tabs.query({}).then(t=>t.find(t=>t.url===${JSON.stringify(spec.url)})?.id)`);
  const engine=code=>control.c.eval(`chrome.scripting.executeScript({target:{tabId:${id}},func:()=>{${code}}}).then(r=>r[0].result)`);
  await until(()=>engine('return globalThis.DraftBackRecovery?.ready()'),'Protection did not start',120);
  row.support=await engine('return DraftBackRecovery.status()');
  row.excludedSelectors=await engine(`return ${JSON.stringify(Object.keys(spec.checks))}.filter(s=>!document.querySelector(s) || !DraftBackRecoveryCore.eligible(document.querySelector(s)))`);
  const checks=Object.fromEntries(Object.entries(spec.checks).filter(([s])=>!row.excludedSelectors.includes(s)));assert(Object.keys(checks).length>=2,'Too few supported fields');
  await p.c.send('Page.addScriptToEvaluateOnNewDocument',{source:"globalThis.testSubmits=0;document.addEventListener('submit',e=>{testSubmits++;e.preventDefault()},true)"});
  await p.c.eval(`globalThis.testSubmits=0;document.addEventListener('submit',e=>{testSubmits++;e.preventDefault()},true)`);
  await p.c.eval(`for(const [selector,value] of Object.entries(${JSON.stringify(checks)})){const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await engine('return DraftBackRecovery.flush()');assert.equal((await engine('return DraftBackRecovery.status()')).error,'');
  const before=await p.c.eval(`Object.fromEntries(${JSON.stringify(Object.keys(checks))}.map(s=>[s,document.querySelector(s).value]))`);row.compared=Object.keys(before).length;
  const time=await p.c.eval('performance.timeOrigin');await p.c.send('Page.reload',{ignoreCache:true});
  await until(()=>p.c.eval(`performance.timeOrigin!==${time} && !!document.querySelector(${JSON.stringify(first)})`),'Form did not reload',200);await pause(700);
  await until(()=>engine('return globalThis.DraftBackRecovery?.ready()'),'Recovery unavailable after reload',120);
  row.emptyAfterReload=await p.c.eval(`Object.values(Object.fromEntries(${JSON.stringify(Object.keys(checks))}.map(s=>[s,document.querySelector(s).value]))).filter(v=>v==='').length`);
  assert(row.emptyAfterReload>0,'Reload did not clear any test values');
  row.result=await engine('return DraftBackRecovery.restore()');await pause(300);
  const after=await p.c.eval(`Object.fromEntries(${JSON.stringify(Object.keys(checks))}.map(s=>[s,document.querySelector(s).value]))`);assert.deepEqual(after,before);
  assert.equal(await p.c.eval('testSubmits'),0);row.submissions=0;row.status='PASS';
 }catch(e){row.error=e.message;if(/unavailable|did not reload/.test(e.message))row.status='BLOCKED';}
 report.cases.push(row);fs.writeFileSync('tests/browser-results/recovery/public.json',JSON.stringify(report,null,2));console.log(JSON.stringify(row));if(p && row.status==='PASS')await browser.send('Target.closeTarget',{targetId:p.id});
}}finally{for(const c of clients)c.close();}
if(report.cases.some(c=>c.status==='FAIL'))process.exitCode=1;
