// Pure read-only check of mock invoices rendered by the production PDF engine.
// Never treats configured credentials as proof of delivery or a successful cron run.
import {splitSelfTestTotalOre} from "./invoiceSplitSelfTest";
export function invoiceSplitSelfTestReadiness(docs,pdfs,{emailConfigured=false,cronConfigured=false}={}){
 const validArray=Array.isArray(docs)&&docs.length===2&&Array.isArray(pdfs)&&pdfs.length===2;
 const totals=validArray?docs.map(splitSelfTestTotalOre):[];
 const expectedTotals=totals.length===2&&totals[0]===400000&&totals[1]===600000&&
  totals[0]+totals[1]===1000000&&
  docs.every((d,i)=>d.installment_percent===(i===0?40:60)&&
   d.demoDocument===true&&d.status==="draft"&&!d.invoice_number&&
   d.customer?.email==="eksempel@example.invalid"&&
   d.line_items?.length===1&&d.line_items[0].vatRate===25);
 const content=validArray?pdfs.map(p=>Buffer.isBuffer(p)?p.toString("latin1"):""):[];
 const pdfsReadable=content.length===2&&content.every((p)=>p.startsWith("%PDF-1.4")&&
  p.includes("%%EOF")&&p.includes("/Type /Catalog"));
 const visiblyMarked=pdfsReadable&&content.every(p=>
  p.includes("TESTDOKUMENT - IKKE GYLDIG")&&p.includes("DEMO - IKKE BETAL")&&
  p.includes("TESTDOKUMENT - IKKE GYLDIG FAKTURA"));
 const noPaymentRequest=pdfsReadable&&content.every(p=>
  !p.includes("Kontonummer: 8450")&&
  !p.includes("Merk betalingen med fakturanummer")&&
  !p.includes("Vipps-lenken"));
 return {
  exampleAmountsCorrect:Boolean(expectedTotals),
  pdfsGenerated:Boolean(pdfsReadable),
  pdfsClearlyMarked:Boolean(visiblyMarked),
  noPaymentInstructions:Boolean(noPaymentRequest),
  emailConfigured:emailConfigured===true,
  cronConfigured:cronConfigured===true,
  sampleTotalOre:expectedTotals?1000000:null,
  partsOre:expectedTotals?totals:[],
  safeForDemoPreview:Boolean(expectedTotals&&pdfsReadable&&visiblyMarked&&noPaymentRequest),
  note:"Kun teknisk kontroll av fiktive data, PDF-er og oppsett. Dette bekrefter ikke at e-post er levert eller at planlagt jobb har kjørt."
 };
}
