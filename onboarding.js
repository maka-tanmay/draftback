'use strict';
const $=id=>document.getElementById(id);
let step=sessionStorage.getItem('recovery-demo-step')==='2'?2:0;
const steps=[
['Start filling a form','On real websites, first click Protect this site and approve access. This practice form is already protected. Click the highlighted button to simulate typing four answers.','demo-type'],
['Your progress is saved','These four answers have been captured. Now reload the page for real. The form will become empty, but the saved draft should remain.','demo-reload'],
['Bring your answers back','The reload cleared the form. Click Restore my answers to put the saved values back. No profile or manual Remember button was needed.','demo-restore']
];
function render(){const [title,copy,target]=steps[step];$('step-count').textContent='Step '+(step+1)+' of 3';$('step-title').textContent=title;$('step-copy').textContent=copy;for(const id of ['demo-type','demo-reload','demo-restore']){$(id).disabled=id!==target;$(id).classList.toggle('tour-spotlight',id===target);}document.querySelectorAll('.tour-progress span').forEach((el,i)=>el.classList.toggle('reached',i<=step));}
async function ready(){for(let i=0;i<100;i++){if(globalThis.DraftBackRecovery?.ready())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Practice protection could not start. Refresh and try again.');}
function fail(e){$('tour-feedback').textContent=e.message;}
$('demo-type').onclick=async()=>{try{await ready();const answers={firstName:'Alex',birthDate:'1995-06-15',application:'renewal',reason:'Visiting family.'};for(const el of $('practice-form').elements){el.value=answers[el.name];el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}await DraftBackRecovery.flush();if(DraftBackRecovery.status().error)throw new Error(DraftBackRecovery.status().error);step=1;render();$('tour-feedback').textContent='Four answers saved. Ready for a real reload.';}catch(e){fail(e);}};
$('demo-reload').onclick=()=>{sessionStorage.setItem('recovery-demo-step','2');location.reload();};
$('demo-restore').onclick=async()=>{try{await ready();const result=await DraftBackRecovery.restore();if(result.restored!==4)throw new Error('Not all four practice answers were restored. Refresh or restart practice.');$('tour-feedback').textContent='All four answers are back. Nothing was submitted.';$('tour-done').hidden=false;$('demo-restore').disabled=true;sessionStorage.removeItem('recovery-demo-step');}catch(e){fail(e);}};
$('replay-tour').onclick=()=>{sessionStorage.removeItem('recovery-demo-step');sessionStorage.removeItem('draftback-session-v1');location.reload();};
$('practice-form').addEventListener('submit',e=>e.preventDefault());
$('practice-form').addEventListener('beforeinput',e=>e.preventDefault());
for(const el of $('practice-form').elements)el.tabIndex=-1;
render();
