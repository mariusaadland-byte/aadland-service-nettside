import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const viewer=read("app/admin/faktura/mva/VatInvoicePdfViewer.js");
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const scanner=read("app/admin/faktura/mva/VatReceiptScanner.js");
const css=read("app/admin/faktura/mva/VatSimpleForm.module.css");
const alreadyTests=read("scripts/smoke-vat-supplier-invoice-parser.mjs");

// A local selected PDF must be readable directly in the mobile accounting
// screen. This must not register a purchase, upload a document, or leave
// the phone for an external PDF-viewing website.
assert.ok(form.includes('import VatInvoicePdfViewer from "./VatInvoicePdfViewer"'));
assert.ok(form.includes('receiptFile?.type==="application/pdf"&&<VatInvoicePdfViewer file={receiptFile}/>'),
 "Show the actual selected PDF, not the OCR text or a hardcoded sample");
assert.ok(viewer.includes('file.arrayBuffer()'),"Render the original selected local file");
assert.ok(viewer.includes('pdfjs-dist@3.11.174'),"Reuse the same PDF.js engine/version as the scanner");
assert.ok(viewer.includes('getDocument({data})'),"Use local PDF bytes without network upload");
assert.ok(!viewer.includes('fetch(')&&!viewer.includes('<iframe')&&!viewer.includes('window.open('),
 "Never send private invoices to a third-party PDF viewer");
assert.ok(viewer.includes('return createPortal(')===false,
 "The viewer can use a portal in JSX without altering receipt logic");
assert.ok(viewer.includes('createPortal(<div')&&viewer.includes('document.body)'),
 "Render modal outside potentially clipped admin containers");
assert.ok(viewer.includes('role="dialog" aria-modal="true"'));
assert.ok(viewer.includes('setPages(document.numPages)'),
 "Total number of pages must be read from each selected PDF");
assert.ok(viewer.includes('setPageNumber(1)'),"Each PDF starts at page 1");
assert.ok(viewer.includes('pages?"Side "+pageNumber+" av "+pages'),
 "Display Side 1 av 1 for one-page, Side 1 av 2 for two-page invoices");
assert.ok(viewer.includes('disabled={loading||pageNumber<=1||rendering}'),
 "No previous page on one-page invoice");
assert.ok(viewer.includes('disabled={loading||!pages||pageNumber>=pages||rendering}'),
 "No next page on the last page of any document");
assert.ok(viewer.includes('Math.max(1,n-1)')&&viewer.includes('Math.min(pages,n+1)'),
 "Never go outside page 1..pageCount");
assert.ok(viewer.includes('getPage(pageNumber)'),"Render the chosen page, not always page 1 or 2");
assert.ok(viewer.includes('setZoom(')&&viewer.includes('zoom>=2.5'),
 "Offer zoom for small invoice text");
assert.ok(viewer.includes('renderTask?.cancel()')&&viewer.includes('document.destroy()'),
 "Closing/changing PDF must free renderer and file");
assert.ok(viewer.includes('await document.destroy().catch'),"Dispose while PDF is still loading");
assert.ok(viewer.includes('window.addEventListener("keydown",onKey)'));
assert.ok(viewer.includes('triggerRef.current?.focus()'));
assert.ok(viewer.includes('setOpen(false)'));
assert.ok(css.includes('height:100dvh')&&css.includes('.pdfViewerModal'));
assert.ok(css.includes('safe-area-inset-top')&&css.includes('safe-area-inset-bottom'),
 "Place viewer controls outside the iPhone notch/home bar");
assert.ok(css.includes('.pdfViewerScroll')&&css.includes('overflow:auto'),
 "Allow reading/scanning long PDF pages by scrolling");
assert.ok(scanner.includes('pageCount=Math.min(document.numPages,3)'),
 "OCR existing PDF extraction automatically covers one or two pages");
assert.ok(scanner.includes('Math.min(document.numPages,2)'),
 "Scanned single- or two-page PDFs use existing image OCR fallback");
assert.ok(scanner.includes('accept=".pdf,.jpg,.jpeg,.png'),
 "Files from iPhone can be uploaded without printing or taking a photo");
assert.ok(alreadyTests.includes('Norske leverandørfakturaer'),
 "Keep previous 1-/2-page invoice field parsing tests");
console.log("Mobil PDF-faktura bestått: lokalt originalvedlegg, fullskjerm/zoom, dynamisk 1/2/flere sider, trygg lukking, eksisterende OCR og ingen registrering ved visning.");
