import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=x=>readFileSync(x,"utf8");
const src=read("lib/developmentTestWizard.js").replace(/^export /gm,"");
const {TEST_WIZARD_STORAGE_KEY,sanitizeTestProgress,
 testWizardCurrentStep,markTestWizardStep,wizardAllPassed}=new Function(src+
 ";return {TEST_WIZARD_STORAGE_KEY,sanitizeTestProgress,testWizardCurrentStep,markTestWizardStep,wizardAllPassed};")();
assert.equal(TEST_WIZARD_STORAGE_KEY,"aadland-roadmap-test-wizard-v1");
const task={id:"test-1",status:"test",approval:{checks:["a","b","c"]}};
const ignored={id:"done-1",status:"done",approval:{checks:["a"]}};
const normalized=sanitizeTestProgress({
 "test-1":{passed:[0,1,1,-1,23,"2"],step:2,issue:"Some issue"},
 "done-1":{passed:[0],step:0},
 "unknown":{passed:[0],step:0}
},[task,ignored]);
assert.deepEqual(normalized,{
 "test-1":{passed:[0,1],step:2,issue:"Some issue"}
},"Keep only valid progress of test-status tasks");
let p={passed:[],step:0,issue:""};
assert.equal(testWizardCurrentStep(p,3),0);
assert.equal(wizardAllPassed(p,3),false);
p=markTestWizardStep(p,0,3);
assert.deepEqual(p,{passed:[0],step:1,issue:""});
assert.equal(testWizardCurrentStep(p,3),1);
p=markTestWizardStep(p,1,3);
assert.deepEqual(p,{passed:[0,1],step:2,issue:""});
p=markTestWizardStep(p,2,3);
assert.deepEqual(p,{passed:[0,1,2],step:2,issue:""});
assert.equal(wizardAllPassed(p,3),true);
assert.throws(()=>markTestWizardStep(p,-1,3),/Ugyldig/);
assert.throws(()=>markTestWizardStep(p,3,3),/Ugyldig/);
assert.equal(wizardAllPassed(null,3),false);
assert.deepEqual(sanitizeTestProgress(null,[task]),{});
const ui=read("app/admin/utviklingsplan/ApprovalQueue.js");
for(const mark of [
 'className={styles.wizardTile}',
 'onClick={()=>openTask(task)}',
 'role="dialog" aria-modal="true"',
 'className={styles.wizardStepBody}',
 'criteria[step]',
 'onClick={markPassed}',
 'onClick={approveCurrent}',
 'onClick={reportIssue}',
 'target="_blank"',
 'rel="noopener noreferrer"',
 'onClick={goNext}',
 'onClick={()=>setIsOpen(false)}',
 'window.localStorage.getItem(TEST_WIZARD_STORAGE_KEY)',
 'window.localStorage.setItem(TEST_WIZARD_STORAGE_KEY,JSON.stringify(progress))',
 'sanitizeTestProgress(raw,allQueue)',
 'wizardAllPassed(savedProgress,criteria.length)',
 'setSelectedId(next.id)',
 'setIsOpen(false)',
 'onReport(current,description)',
 'if(!window.confirm('
])assert.ok(ui.includes(mark),"Missing wizard flow: "+mark);
const plan=read("app/admin/utviklingsplan/RoadmapClient.js");
assert.ok(plan.includes("onReport={reportTaskIssue}"));
assert.ok(plan.includes('return updateTask(task,{notes:previous+line});'),
 "Bug reports must be saved to roadmap without marking done");
assert.ok(plan.includes('return updateTask(task,{status:"done",notes:updated});'),
 "Only explicit acceptance may mark task complete");
assert.ok(!ui.includes('onClick={()=>onApprove(current)}'),
 "The wizard must not approve an incomplete test just by clicking a card");
const css=read("app/admin/utviklingsplan/roadmap.module.css");
assert.ok(css.includes(".wizardTileGrid"));
assert.ok(css.includes(".wizardBackdrop"));
assert.ok(css.includes("position:fixed;inset:0"));
assert.ok(css.includes(".wizardDialog"));
assert.ok(css.includes("max-height:calc(100dvh - 28px)"));
assert.ok(css.includes("@media(max-width:660px)"));
console.log("Godkjenningsveiviser: åpne oppgavekort, ett steg om gangen, gjenoppta etter lukking, ny testfane, feillogg og godkjenning etter alle steg – bestått.");
