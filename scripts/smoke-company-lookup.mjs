import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const lookupSrc=read("lib/brregCompanyLookup.js").replace(/^export /gm,"");
const {validCompanyQuery,formattedBusinessAddress,mapBrregCompany,searchBrregCompanies}=
 new Function(lookupSrc+";return {validCompanyQuery,formattedBusinessAddress,mapBrregCompany,searchBrregCompanies};")();
assert.equal(validCompanyQuery("Aadland Service"),"Aadland Service");
assert.throws(()=>validCompanyQuery("AB"),/minst tre/);
assert.throws(()=>validCompanyQuery("<script>"),/minst tre/);
const company={organisasjonsnummer:"937781873",navn:"AADLAND SERVICE",
 organisasjonsform:{kode:"ENK"},registrertIMvaregisteret:true,
 forretningsadresse:{adresse:["Steinsvikvegen 12P"],postnummer:"5251",poststed:"SØREIDGREND"}};
const mapped=mapBrregCompany(company);
assert.deepEqual(mapped,{organizationNumber:"937781873",name:"AADLAND SERVICE",
 address:"Steinsvikvegen 12P\n5251 SØREIDGREND",registeredForVat:true,
 businessForm:"ENK",businessStatus:"",website:"",source:"Brønnøysundregistrene"});
assert.equal(formattedBusinessAddress({...company,forretningsadresse:null,postadresse:{adresse:["Postboks 100"],postnummer:"5001",poststed:"BERGEN"}}),"Postboks 100\n5001 BERGEN");
assert.equal(mapBrregCompany({navn:"Mangler orgnr"}),null);
let urls=[];
const fetcher=async(url,options)=>{urls.push(url);
 assert.equal(options.cache,"no-store");assert.equal(options.headers.Accept,"application/json");
 return {ok:true,status:200,headers:{get:()=>null},json:async()=>url.endsWith("937781873")?
 company:{_embedded:{enheter:[company,{navn:"Bad without orgno"}]}}};
};
let rows=await searchBrregCompanies("Aadland Service",fetcher);
assert.equal(rows.length,1);assert.equal(rows[0].organizationNumber,"937781873");
assert.equal(new URL(urls[0]).searchParams.get("navn"),"Aadland Service");
rows=await searchBrregCompanies("937 781 873",fetcher);
assert.equal(rows[0].name,"AADLAND SERVICE");
assert.ok(urls[1].endsWith("/937781873"));
rows=await searchBrregCompanies("unknown",async()=>({ok:false,status:404}));
assert.deepEqual(rows,[]);
await assert.rejects(searchBrregCompanies("Firma X",async()=>({ok:false,status:500})),/svarte ikke/);
await assert.rejects(searchBrregCompanies("Firma X",async()=>{throw Error("timeout");}),/kontakte/);
const api=read("app/api/admin/company-lookup/route.js")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
let role="owner",count=0;
const GET=new Function("NextResponse","getAdminUser","searchBrregCompanies",api+";return GET;")(
 {json:(body,opts={})=>({body,status:opts.status||200,headers:opts.headers})},
 async()=>({role}),async(q)=>{count++;return searchBrregCompanies(q,fetcher);}
);
let r=await GET({url:"https://localhost/api/admin/company-lookup?q=Aadland"});
assert.equal(r.status,200);assert.equal(r.body.companies.length,1);
role="staff";r=await GET({url:"https://localhost/api/admin/company-lookup?q=Aadland"});
assert.equal(r.status,403);assert.equal(count,1,"Unauthorized admin may not query upstream registry");
role="owner";
r=await GET({url:"https://localhost/api/admin/company-lookup?q=x"});
assert.equal(r.status,400);
const registration=read("app/admin/kunder/ny/NewCustomerClient.js");
const quote=read("app/admin/tilbud/QuoteCustomerPicker.js");
const drawing=read("app/admin/tegning/QuickCustomerPanel.js");
for(const page of [registration,quote,drawing])assert.ok(page.includes("<CompanyRegistrySearch"));
const contacts=read("app/api/admin/customer-contacts/route.js");
assert.ok(contacts.includes('eq("organization_number",input.data.organization_number)'));
assert.ok(contacts.includes('existing.organization_number!==input.data.organization_number'));
const vat=read("app/admin/faktura/mva/VatReportingControlClient.js");
assert.ok(vat.includes("result.suggestion")&&vat.includes("body.suggestion?.observed_date"));
assert.ok(vat.includes("ikke bekreftet eller brukt"));
const control=read("app/api/admin/invoices/vat-reporting-control/route.js");
assert.ok(control.includes("vat_registration_public_hint")&&control.includes("verifiedWithSkatteetaten:false"));
const migration=read("supabase/migrations/20261026133000_vat_public_registration_hint.sql");
assert.ok(migration.includes("'2026-06-05'"));
assert.ok(migration.includes("on conflict(id) do nothing"));
assert.ok(migration.includes("admin_customer_contacts_org_unique"));
assert.ok(migration.includes("enable row level security"));
console.log("Bedriftsoppslag bestått: firmanavn/orgnr, automatisk utfylling, tilgang, feiltilfeller, dublettsperre og foreløpig MVA-dato.");
