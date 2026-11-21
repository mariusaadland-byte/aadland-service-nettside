import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=x=>readFileSync(x,"utf8");
const modelSrc=read("lib/vatReportingControl.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const periodSrc=read("lib/vatDocumentPeriod.js").replace(/^export /gm,"");
const {vatDocumentPeriod}=new Function(periodSrc+";return {vatDocumentPeriod};")();
const {validateVatReportingStatus,validateVatReportingProfile,vatPeriodKey}=
 new Function("vatDocumentPeriod",modelSrc+
 ";return {validateVatReportingStatus,validateVatReportingProfile,vatPeriodKey};")(vatDocumentPeriod);
const source=read("app/api/admin/invoices/vat-reporting-control/route.js");
const code=source.replace(/^import .*;\n/gm,"")
 .replace(/^export const [^\n]*\n/gm,"")
 .replace(/export async function (GET|POST)\(/g,"async function $1(");
let profile={registration_date:"2026-06-05",first_term_year:2026,first_term:3};
let entries=[],history=[],user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",role:"owner"},
 production="production",sendCount=0;
const table={
 vat_reporting_profile:[profile],
 vat_reporting_term_status:entries,
 vat_registration_public_hint:[],
 vat_reporting_term_events:history
};
const makeQuery=(name,operation="select",data=null)=>{
 let filters=[];
 const q={
  select(){return q;},
  eq(field,value){filters.push([field,value]);return q;},
  order(){return q;},
  limit(){return q;},
  upsert(payload){return makeQuery(name,"upsert",payload);},
  async maybeSingle(){
   const item=table[name].filter(row=>filters.every(([k,v])=>row[k]===v))[0]||null;
   return {data:item,error:null};
  },
  async single(){
   if(operation==="upsert"){
    assert.ok(["vat_reporting_profile","vat_reporting_term_status"].includes(name));
    if(name==="vat_reporting_term_status"){
     const i=entries.findIndex(x=>x.year===data.year&&x.term===data.term);
     const row={...data};
     if(i<0)entries.push(row);
     else entries[i]=row;
     history.unshift({...row,recorded_at:"2026-11-21T01:00:00Z"});
     return {data:row,error:null};
    }
    profile={...data};
    table.vat_reporting_profile=[profile];
    return {data:profile,error:null};
   }
   throw Error("unexpected DB single");
  },
  then(resolve,reject){
   return Promise.resolve({data:table[name].filter(row=>filters.every(([k,v])=>row[k]===v)),error:null})
    .then(resolve,reject);
  }
 };
 return q;
};
const db=()=>({from:makeQuery});
const NextResponse={json(value,opts={}){return {body:value,status:opts.status||200}}};
const sameOriginGuard=()=>null;
const getAdminUser=async()=>user;
const api=new Function("NextResponse","getAdminUser","db","sameOriginGuard",
 "validateVatReportingProfile","validateVatReportingStatus","vatPeriodKey","process",
 code+";return {GET,POST};")(
 NextResponse,getAdminUser,db,sameOriginGuard,validateVatReportingProfile,
 validateVatReportingStatus,vatPeriodKey,{env:{get VERCEL_ENV(){return production}}}
);
const get=()=>api.GET({url:"https://aadland-service.no/api/admin/invoices/vat-reporting-control?year=2026"});
const post=body=>api.POST({json:async()=>({action:"status",year:2026,term:3,...body})});
let res=await get();assert.equal(res.status,200);
assert.deepEqual(res.body.terms,[]);
assert.deepEqual(res.body.history,[]);
assert.equal(res.body.verifiedWithSkatteetaten,false,"Owner notes do not imply real-time verification");
res=await post({status:"filed",filedOn:"2026-09-07",confirmed:true,
 verificationSource:"skatteetaten",submissionReference:""});
assert.equal(res.status,400);assert.equal(entries.length,0);
res=await post({status:"filed",filedOn:"2026-09-07",confirmed:true,
 verificationSource:"owner_review",submissionReference:"Skatteetaten 123"});
assert.equal(res.status,400);assert.equal(entries.length,0);
res=await post({status:"filed",filedOn:"2026-09-07",confirmed:true,
 verificationSource:"skatteetaten",submissionReference:"MVA-2026-32145"});
assert.equal(res.status,200);assert.equal(entries.length,1);assert.equal(history.length,1);
assert.equal(res.body.term.verification_source,"skatteetaten");
res=await get();assert.equal(res.body.terms[0].status,"filed");
assert.equal(res.body.history.length,1);
assert.equal(res.body.verifiedWithSkatteetaten,false);
res=await post({status:"unverified",confirmed:true,notes:"Må kontrollere riktig termin og leveringskvittering"});
assert.equal(res.status,200);assert.equal(entries[0].status,"unverified");
assert.equal(history.length,2,"Status reset retains the earlier filing claim as an audit event");
assert.equal(history[0].status,"unverified");
assert.equal(history[1].status,"filed");
res=await post({status:"filed",filedOn:"2026-09-07",confirmed:false,
 verificationSource:"tripletex",submissionReference:"Tripletex 44"});
assert.equal(res.status,400);
assert.equal(history.length,2);
user={id:user.id,role:"staff"};
res=await get();assert.equal(res.status,403);
res=await post({status:"filed",filedOn:"2026-09-07",confirmed:true,
 verificationSource:"tripletex",submissionReference:"Tripletex 44"});
assert.equal(res.status,403);
user={...user,role:"owner"};
production="preview";
res=await post({status:"filed",filedOn:"2026-09-07",confirmed:true,
 verificationSource:"tripletex",submissionReference:"Tripletex 44"});
assert.equal(res.status,403);
production="production";
assert.equal(sendCount,0,"Never send an MVA return, e-mail or payment in a status tool");
const sql=read("supabase/migrations/20261121041000_vat_reporting_term_evidence.sql");
for(const marker of [
 "vat_reporting_term_events",
 "vat_term_filed_evidence_check",
 "log_vat_reporting_term_change",
 "after insert or update",
 "vat_reporting_term_status_status_check",
 "enable row level security",
 "revoke all on public.vat_reporting_term_events from public,anon,authenticated",
 "verification_source in ('skatteetaten','tripletex')"
])assert.ok(sql.includes(marker),"Missing DB audit safeguard "+marker);
assert.ok(!source.includes("tripletexCreate")&&!source.includes("mvaReturn")&&!source.includes(".emails.send"));
const client=read("app/admin/faktura/mva/VatReportingControlClient.js");
for(const label of [
 "Referanse fra leveringskvitteringen (påkrevd)",
 "Hvor er innsendingsstatus kontrollert?",
 "Se historikk for",
 "tilbakestill usikker status",
 "Skatteetaten er ikke kontaktet."
])assert.ok(client.includes(label),"Missing clear owner control: "+label);
console.log("S-06 bestått: termin uten bevis er ukjent, levert krever kilde/referanse, historikk beholdes, owner-only og ingen MVA-innsending.");
