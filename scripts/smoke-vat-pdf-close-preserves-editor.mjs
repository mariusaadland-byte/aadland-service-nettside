import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const viewer=read("app/admin/faktura/mva/VatInvoicePdfViewer.js");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const term=read("app/admin/faktura/mva/InvoiceVatTermClient.js");
const css=read("app/admin/faktura/mva/VatSimpleForm.module.css");
const scrollEffect=viewer.slice(viewer.indexOf("  if(!open)return;"),viewer.indexOf(" },[open]);"));
const close=viewer.slice(viewer.indexOf(" const closeViewer=e=>{"),viewer.indexOf(" if(!file||file.type!=="));
// On iOS this was previously the source of page/scroll position shifts.
assert.ok(!scrollEffect.includes('body.style.position="fixed"'),
 "Opening PDF should not make the accounting page a fixed-position element");
assert.ok(scrollEffect.includes('body.style.overflow="hidden"'));
assert.ok(scrollEffect.includes('root.style.overflow="hidden"'));
assert.ok(scrollEffect.includes("body.style.overflow=previousBodyOverflow"));
assert.ok(scrollEffect.includes("root.style.overflow=previousRootOverflow"));
assert.ok(scrollEffect.includes("if(Math.abs(window.scrollY-scrollY)>2"),
 "Restore scroll only if the browser actually moved during the viewer");
assert.ok(scrollEffect.includes("window.scrollTo(scrollX,scrollY)"),
 "Restore both coordinates if Safari moves the scroll position");
assert.ok(scrollEffect.includes("triggerRef.current?.focus({preventScroll:true})"),
 "Focus the PDF-opening button but never scroll to a menu or top link");
assert.ok(close.includes("e?.preventDefault?.()"),"Do not submit parent form or follow links");
assert.ok(close.includes("e?.stopPropagation?.()"),
 "Do not allow portal button events to reach surrounding admin navigation");
assert.ok(close.includes("setOpen(false)"),"X should only close the PDF viewer");
assert.ok(!close.includes("window.location")&&!close.includes("router.")&&
 !close.includes("window.history")&&!close.includes("onChanged")&&
 !close.includes("setReceiptFile")&&!close.includes("setForm"),
 "Close must not navigate, change the URL, register or clear any receipt data");
assert.ok(viewer.includes('onClick={closeViewer}>Lukk ✕</button>'),
 "Actual X button must call the isolated close handler");
assert.ok(viewer.includes('onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}'),
 "Clicks and pointer events in the portal must not bubble to accounting/menu components");
assert.ok(viewer.includes('window.addEventListener("keydown",onKey,true)'),
 "Escape must be handled at the dialog before global app shortcuts");
assert.ok(viewer.includes('e.stopImmediatePropagation?.()'),"Escape must not trigger an app-wide back handler");
assert.ok(viewer.includes('role="dialog" aria-modal="true"'));
assert.ok(viewer.includes('aria-label="Vis opplastet leverandørfaktura"'));
assert.ok(viewer.includes('setPages(document.numPages)'),"Keep one-/multi-page PDFs");
assert.ok(viewer.includes('getPage(pageNumber)'),"Keep PDF page navigation");
assert.ok(viewer.includes('setZoom('),"Keep zoom for invoices on a phone");
assert.ok(css.includes(".pdfViewerModal")&&css.includes("height:100dvh"));
assert.ok(term.includes('useState("receipt")')&&term.includes('hidden={view!=="receipt"}'),
 "Keep the editable receipt screen mounted rather than navigating to a different menu");
assert.ok(form.includes('receiptFile?.type==="application/pdf"&&<VatInvoicePdfViewer file={receiptFile}/>'),
 "Only display the viewer for the selected original, leaving the registration form intact");
assert.ok(form.includes('setForm(x=>updateVatReceiptReviewedField(x,name,value))'),
 "Manual corrections must continue to be stored after closing PDF");
console.log("PDF-lukking bestått: X/Escape lukker kun faktura, scroll/fokus bevares på iPhone, ingen navigering eller tapte registreringsfelt.");
