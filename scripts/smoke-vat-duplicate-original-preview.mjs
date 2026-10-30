import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const viewer=read("app/admin/faktura/mva/VatDuplicateOriginalPreview.js");
const pdf=read("app/admin/faktura/mva/VatInvoicePdfViewer.js");
const attach=read("app/api/admin/invoices/vat-attachments/route.js");
const css=read("app/admin/faktura/mva/VatSimpleForm.module.css");

// Both matching statuses show the same owner-only original and do not
// change the draft or navigate to the selected MVA term.
assert.ok(form.includes('import VatDuplicateOriginalPreview from "./VatDuplicateOriginalPreview"'));
assert.equal((form.match(/<VatDuplicateOriginalPreview /g)||[]).length,2,
 "Show original for both definite and possible duplicates");
assert.ok(form.includes("key={duplicateKey+\":\"+duplicateCheck.match?.id}"),
 "Changing supplier/invoice/old match must unmount the old preview");
assert.ok(form.includes('duplicateCheck.status==="duplicate"'));
assert.ok(form.includes('duplicateCheck.status==="possible"'));
assert.ok(form.includes('duplicateCheck.match?.grossOre'),
 "Previous VAT-inclusive total remains visible for comparison");
assert.ok(form.includes("setDuplicateReviewed(false)"),
 "New or changed duplicate matches require fresh confirmation");
assert.ok(form.includes('disabled={busy||scanBusy||duplicateBlocking||'),
 "Duplicate warnings keep saving blocked until controlled review");

// Preview only starts when the owner taps the button. No automatic download
// on every OCR result, no mutation of previous approved records.
const start=viewer.indexOf(" async function openPrevious(");
const end=viewer.indexOf(" const close=",start);
const load=viewer.slice(start,end);
assert.ok(start>0&&end>start);
assert.ok(viewer.includes('disabled={busy} onClick={openPrevious}'));
assert.ok(load.includes('e?.preventDefault();e?.stopPropagation();'));
assert.ok(load.includes('if(busy||!uuid(match?.id))return;'));
assert.ok(load.includes('if(previousFile){setShow(true);return;}'),
 "Reopening should not trigger another download");
assert.ok(load.includes('new AbortController()'),"Cancel remote fetch on unmount");
assert.ok(load.includes('"/api/admin/invoices/vat-attachments?documentId="'),
 "Only query an exact matched, server-provided UUID");
assert.ok(load.includes('fetch(url,{cache:"no-store",signal:abort.signal})'));
assert.ok(load.includes('fetch(url+"&download=1",{cache:"no-store",signal:abort.signal})'));
assert.ok(!load.includes("method:\"POST\"")&&!load.includes('insert(')&&!load.includes("window.open("),
 "Comparison never submits/registers an invoice");
assert.ok(load.includes('if(!info.attachment)'),
 "Explain that some earlier entries have no original attachment");
assert.ok(load.includes('blob.size!==Number(info.attachment.fileSize)'),
 "Check the expected protected original file size");
assert.ok(load.includes('const file=new File([blob]'),
 "Use authenticated bytes in a local File for existing PDF renderer");
assert.ok(viewer.includes('new Set(["application/pdf","image/jpeg","image/png","image/webp"])'),
 "Don't render HTML or unknown external file formats");
assert.ok(viewer.includes('URL.revokeObjectURL(url)'),"Revoke local image URLs");
assert.ok(viewer.includes("controller.current?.abort()"));
assert.ok(viewer.includes("<VatInvoicePdfViewer file={previousFile} autoOpen"),
 "One-tap fullscreen PDF viewer");
assert.ok(viewer.includes('onClose={()=>setShow(false)}'),
 "Closing previous PDF must return to the same registration draft");
assert.ok(viewer.includes('aria-modal="true"')&&viewer.includes('Lukk ✕'));
assert.ok(viewer.includes("role=\"dialog\""),"Photos should open as an accessible modal");
assert.ok(viewer.includes('window.addEventListener("keydown",esc,true)'));
assert.ok(viewer.includes('onPointerDown={e=>e.stopPropagation()}'),
 "Avoid clicks leaking into app navigation");
assert.ok(css.includes(".duplicateOriginal")&&css.includes(".duplicateImageModal"));
assert.ok(css.includes("height:100dvh")&&css.includes("safe-area-inset-bottom"),
 "Mobile fullscreen preview should respect iPhone safe area");

// The normal PDF used in new-invoice upload should behave exactly as before,
// while existing originals can open directly without another button.
assert.ok(pdf.includes("autoOpen=false,onClose,title="));
assert.ok(pdf.includes('setOpen(Boolean(autoOpen));'));
assert.ok(pdf.includes('!autoOpen&&<button ref={triggerRef}'));
assert.ok(pdf.includes('onCloseRef.current?.();'));
assert.ok(pdf.includes('if(!triggerRef.current)previousFocusRef.current?.focus?.({preventScroll:true})'));
assert.ok(pdf.includes('getPage(pageNumber)'),"Retain one or more PDF pages and zoom");
assert.ok(pdf.includes('triggerRef.current?.focus({preventScroll:true})'),
 "Existing iPhone scroll restoration remains in place");

// The original attachment service already verifies owner permissions and
// full-file SHA256 integrity before providing the file on request.
assert.ok(attach.includes("if(!await validUser())return fail("));
assert.ok(attach.includes('url.searchParams.get("download")==="1"'));
assert.ok(attach.includes('crypto.createHash("sha256").update(bytes).digest("hex")!==data.sha256'));
assert.ok(attach.includes('"Cache-Control":"private, no-store"'));
assert.ok(attach.includes('s.storage.from(vatAttachmentBucket).download(data.storage_path)'));
console.log("Tidligere bilag fra dublettvarsel bestått: privat original, ett trykk, flere PDF-sider, bildeforhåndsvisning, ingen lagring eller navigasjon.");
