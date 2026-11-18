import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {osloDateKey} from "../../../../lib/osloTime";
import {buildAccountingOverview,accountingOverviewCsv} from "../../../../lib/adminAccountingOverview";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow, noarchive"};
const json=(value,status=200)=>NextResponse.json(value,{status,headers});

async function rows(s,table,columns,filter=null){
 const all=[];
 for(let offset=0;offset<5000;offset+=250){
  let q=s.from(table).select(columns).order("id",{ascending:true}).range(offset,offset+249);
  if(filter)q=filter(q);
  const {data,error}=await q;
  if(error||!Array.isArray(data))throw Error("Kunne ikke hente komplette regnskapsopplysninger.");
  all.push(...data);
  if(data.length<250)return all;
 }
 throw Error("For mange bilag for én oversikt. Filtrering må utvides.");
}
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren har tilgang til regnskapsoversikten."},403);
 const url=new URL(req.url),today=osloDateKey(new Date());
 const rawYear=url.searchParams.get("year")||today.slice(0,4);
 const year=Number(rawYear);
 if(!/^\d{4}$/.test(rawYear)||!Number.isInteger(year)||year<2000||year>2100)
  return json({error:"Ugyldig regnskapsår."},400);
 const format=url.searchParams.get("format")||"json";
 if(!["json","csv"].includes(format))return json({error:"Ukjent eksportformat."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const [invoices,purchases,payments,transfers,files]=await Promise.all([
   rows(s,"invoice_drafts","id,status,customer,invoice_number,issued_date,due_date,paid_ore,credited_ore,sent_at,line_items",q=>q.eq("status","sent")),
   rows(s,"vat_purchase_documents","id,document_date,supplier_name,supplier_document_number,kind,base_ore,vat_ore,deductible_vat_ore,voided_at"),
   rows(s,"invoice_payments","id,invoice_id,paid_on,amount_ore,reversed_at,vipps_reference"),
   rows(s,"vat_tripletex_receipt_transfers","id,purchase_document_id,recipient,status,attempted_at"),
   rows(s,"vat_purchase_document_files","id,purchase_document_id")
  ]);
  const overview=buildAccountingOverview({invoices,purchases,payments,transfers,files},year,today);
  if(format==="csv")return new NextResponse(accountingOverviewCsv(overview.ledger),{
   headers:{...headers,"Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":'attachment; filename="Aadland-regnskapsoversikt-'+year+'.csv"',
    "X-Content-Type-Options":"nosniff"}
  });
  return json(overview);
 }catch(error){
  console.error("OWNER ACCOUNTING OVERVIEW",error?.message);
  return json({error:"Regnskapsoversikten kunne ikke hentes komplett. Ingen ufullstendige tall vises."},503);
 }
}
