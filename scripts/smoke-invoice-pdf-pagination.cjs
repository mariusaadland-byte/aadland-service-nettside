const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const sharp=require('sharp');
const source=fs.readFileSync('lib/invoiceDraftPdf.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function','async function');
const context={sharp,path,process,Buffer};vm.createContext(context);vm.runInContext(source,context);
const invoice={invoice_number:'AS-TEST-000001',issued_date:'2026-10-21',due_date:'2026-10-28',title:'Utført arbeid',customer:{name:'Testkunde',address:'Eksempelveien 12\n5000 Bergen',phone:'12345678',email:'kunde@example.com',workDate:'2026-10-21',workAddress:'Eksempelveien 12',workDescription:'Utført maling og sparkling av vegg, montering av spiler på TV-vegg, montering av TV på veggen og bygging av konsollbord bak sofa. Fakturaen omfatter 8 timer arbeid samt maling/sparkel, spiler, skruer, lim, finerplate og materialer til konsollbord.'},notes:'Sluttfakturering av hele beløpet etter ferdigstillelse.'};
const item={description:'Materialer og montering',quantity:1,unitPriceOre:35000,vatRate:25,unit:'stk'};
(async()=>{
 fs.mkdirSync('tmp/pdfs',{recursive:true});
 for(const [count,pages] of [[1,1],[4,1],[5,1],[6,2],[12,2],[40,3]]){
  const pdf=await context.buildInvoiceDraftPdf({...invoice,line_items:Array.from({length:count},(_,i)=>({...item,description:'Vare '+(i+1)}))});
  const raw=pdf.toString('latin1');assert.equal(Number(raw.match(/\/Type \/Pages .*?\/Count (\d+)/)[1]),pages,'Page count for '+count+' products');
  fs.writeFileSync('tmp/pdfs/pagination-'+count+'.pdf',pdf);
 }
 console.log('PASS: 1, 4 and 5 products on one page; 6 and 12 on two; long invoices overflow safely.');
})().catch(e=>{console.error(e);process.exit(1)});
