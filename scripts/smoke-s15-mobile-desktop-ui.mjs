import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const css=read("app/admin/tilbud/quoteEditorResponsive.css");
const editor=read("app/admin/tilbud/QuoteEditorClient.js");
const quoteGlobal=read("app/globals.css");
const invoice=read("app/admin/faktura/InvoicesClient.js");
const invoiceCss=read("app/admin/faktura/InvoiceWorkspace.module.css");
const vatCss=read("app/admin/faktura/mva/VatSimpleForm.module.css");
const vatViewer=read("app/admin/faktura/mva/VatInvoicePdfViewer.js");
const contrast=read("app/admin/adminContrast.css");
const checklist=read("lib/developmentApprovalChecklist.js");

function rule(selector){
 const index=css.indexOf(selector+"{");
 assert.ok(index>=0,"Mangler scoped CSS "+selector);
 const end=css.indexOf("}",index);
 assert.ok(end>index);
 return css.slice(index,end+1);
}
const backdrop=rule(".quoteEditorPage .quoteModalBackdrop");
const dialog=rule(".quoteEditorPage .quoteModal");
const actions=rule(".quoteEditorPage .quoteModalActions .btn");
assert.match(backdrop,/overflow-y:auto/);
assert.match(backdrop,/overscroll-behavior:contain/);
assert.match(dialog,/max-height:calc\(100dvh - 24px\)/);
assert.match(dialog,/overflow-y:auto/);
assert.match(dialog,/width:min\(520px,100%\)/);
assert.match(actions,/min-height:44px/);
assert.match(actions,/white-space:normal/);
assert.ok(css.includes("env(safe-area-inset-bottom,0px)"));
assert.ok(css.includes("@media print"),"Kunde-PDFer og utskrift må fortsatt ha print-regler");
assert.ok(editor.includes('className="quoteModalBackdrop"')&&editor.includes('className="quoteModal"'));
assert.ok(editor.includes('role="dialog" aria-modal="true"'));
assert.ok(editor.includes('onClick={()=>setShowPaperAccept(false)}'));
assert.ok(editor.includes('onClick={()=>setShowAlternateEmail(false)}'));
assert.ok(quoteGlobal.includes(".quoteModalBackdrop{"),"Live UI bruker de eksisterende modal-klassene");

assert.ok(invoice.includes('selectedInvoiceAction==="invoice-payment-actions"'));
assert.ok(invoice.includes('setSelectedInvoiceAction(null)'));
assert.ok(invoice.includes('invoice-selected-action'));
assert.ok(invoiceCss.includes("@media(max-width:510px)"));
assert.ok(invoiceCss.includes(".actionGrid{grid-template-columns:1fr}"));
assert.ok(invoiceCss.includes("min-width:0"));
assert.ok(vatCss.includes(".pdfViewerModal{position:fixed;inset:0"));
assert.ok(vatCss.includes("height:100dvh"));
assert.ok(vatCss.includes(".pdfViewerScroll{flex:1 1 auto;min-height:0;overflow:auto"));
assert.ok(vatViewer.includes('role="dialog" aria-modal="true"'));
assert.ok(vatViewer.includes('body.style.overflow="hidden"'));
assert.ok(vatViewer.includes('root.style.overflow="hidden"'));
assert.ok(contrast.includes("color-scheme:light"));

const oldExpectation="Kontroller innkjøpspris eks. MVA, enhet og korrekt 20 % standardpåslag.";
assert.ok(!checklist.includes(oldExpectation),"Testveilederen må ikke vise gammel påslagssats");
assert.ok(checklist.includes("15 % bedriftspåslag"));
const start=checklist.indexOf(" responsive:{"),end=checklist.indexOf('"custom-invoice-issue-email-20261021"',start);
assert.ok(start>=0&&end>start);
const section=checklist.slice(start,end);
assert.ok((section.match(/\n   "/g)||[]).length===6,"S-15 skal ha seks guidede, konkrete teststeg");
for(const phrase of ["200 % zoom","tilbudskladd","Avbryt","fakturaarkivet","MVA","PC"]){
 assert.ok(section.includes(phrase),"Mangler brukerrettet teststeg: "+phrase);
}
assert.ok(section.includes("IKKE registrer reell betaling"));
console.log("S-15 bestått: statiske UI-regler for mobilmodal, tilbud, fakturaarkiv, MVA, kontrast og seks brukersteg. Ingen faktisk innlogget E2E-test.");

const focusSource=read("app/admin/tilbud/quoteDialogFocus.js").replace("export function","function");
const bindFocus=new Function(focusSource+";return bindQuoteDialogFocus;")();
const listeners=new Map();let busy=false,closed=0;
const doc={activeElement:null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
const makeNode=()=>({tabIndex:0,isConnected:true,getClientRects:()=>[{}],focus(){doc.activeElement=this;}});
const opener=makeNode(),first=makeNode(),last=makeNode();
const modal={...makeNode(),ownerDocument:doc,querySelectorAll:()=>[first,last],contains:node=>[modal,first,last].includes(node)};
doc.activeElement=opener;
const cleanup=bindFocus(modal,{isBusy:()=>busy,onClose:()=>closed++});
assert.equal(doc.activeElement,modal);
const key=(key,shiftKey=false)=>{let stopped=false;listeners.get("keydown")({key,shiftKey,preventDefault(){stopped=true;}});return stopped;};
assert.equal(key("Tab"),true);assert.equal(doc.activeElement,first);
assert.equal(key("Tab",true),true);assert.equal(doc.activeElement,last);
assert.equal(key("Tab"),true);assert.equal(doc.activeElement,first);
busy=true;key("Escape");assert.equal(closed,0);
busy=false;key("Escape");assert.equal(closed,1);
doc.activeElement=opener;listeners.get("focusin")({target:opener});assert.equal(doc.activeElement,first);
cleanup();assert.equal(doc.activeElement,opener);assert.equal(listeners.size,0);
assert.ok(editor.includes('bindQuoteDialogFocus(dialogRef.current')&&editor.includes('dialogBusyRef.current'));
console.log("S15 quote dialog focus: mock keyboard containment, Escape busy guard, outside focus and restoration passed.");
