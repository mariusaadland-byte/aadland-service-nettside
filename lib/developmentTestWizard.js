// Pure helpers for the owner-only guided acceptance window.
// Browser storage keeps a paused checklist on the same device; the final
// approval alone changes the authoritative task status in the database.
export const TEST_WIZARD_STORAGE_KEY="aadland-roadmap-test-wizard-v1";

const isMap=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
export function sanitizeTestProgress(raw,tasks){
 const known=new Map((Array.isArray(tasks)?tasks:[])
  .filter(t=>t?.status==="test"&&typeof t.id==="string")
  .map(t=>[t.id,t]));
 const entries=isMap(raw)?Object.entries(raw):[];
 const out={};
 for(const [id,v] of entries.slice(0,150)){
  const task=known.get(id);
  if(!task||!isMap(v))continue;
  const count=Array.isArray(task.approval?.checks)?task.approval.checks.length:0;
  if(count<=0)continue;
  const passed=Array.isArray(v.passed)?v.passed
   .filter(n=>Number.isSafeInteger(n)&&n>=0&&n<count):[];
  const unique=[...new Set(passed)].sort((a,b)=>a-b);
  const step=Number.isSafeInteger(v.step)?Math.max(0,Math.min(count-1,v.step)):0;
  const issue=typeof v.issue==="string"?v.issue.slice(0,1200):"";
  out[id]={passed:unique,step,issue};
 }
 return out;
}
export function testWizardCurrentStep(progress,count){
 if(!Number.isSafeInteger(count)||count<1)return 0;
 const passed=new Set(Array.isArray(progress?.passed)?progress.passed:[]);
 const chosen=Number.isSafeInteger(progress?.step)?progress.step:0;
 if(chosen>=0&&chosen<count&&!passed.has(chosen))return chosen;
 for(let i=0;i<count;i++)if(!passed.has(i))return i;
 return count-1;
}
export function markTestWizardStep(progress,index,count){
 if(!Number.isSafeInteger(index)||index<0||index>=count)
  throw Error("Ugyldig testpunkt.");
 const passed=[...new Set([...(progress?.passed||[]),index])].sort((a,b)=>a-b);
 const next=passed.length===count?count-1:
  Array.from({length:count},(_,i)=>i).find(i=>!passed.includes(i));
 return {passed,step:next??count-1,issue:progress?.issue||""};
}
export const wizardAllPassed=(progress,count)=>count>0&&
 Array.isArray(progress?.passed)&&
 Array.from({length:count},(_,i)=>i).every(i=>progress.passed.includes(i));
