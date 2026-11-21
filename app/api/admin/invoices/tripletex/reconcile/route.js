import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../../lib/requestGuard";
import {db} from "../../../../../../lib/supabase";
import {storedTripletexConnection,unprotectTripletexToken} from "../../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead} from "../../../../../../lib/tripletexApi";
import {positiveTripletexVoucherId,remoteTripletexVoucherSummary,purchaseReceiptGrossOre}
 from "../../../../../../lib/tripletexReceiptReconciliation";

export const runtime="nodejs";
export const maxDuration=60;
const opts={headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"}};
const json=(v,status=200)=>NextResponse.json(v,{...opts,status});
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const clean=v=>String(v??"").trim();

export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Kun eier kan kontrollere bokførte bilag."},403);
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Bokføringsavstemming er bare tilgjengelig på produksjonssiden."},403);
 const body=await req.json().catch(()=>({}));
 const documentId=body.documentId;
 const voucherId=positiveTripletexVoucherId(body.voucherId);
 if(!uuid(documentId)||!voucherId||!["check","confirm"].includes(body.action))
  return json({error:"Velg ett bilag og oppgi riktig Tripletex bilags-ID."},400);
 const s=db();if(!s)return json({error:"Databasen er ikke tilgjengelig."},503);
 try{
  const [doc,file,transfer,prior,connection]=await Promise.all([
   s.from("vat_purchase_documents").select("id,supplier_name,supplier_document_number,document_date,kind,base_ore,vat_ore,deductible_vat_ore,deduction_percent,voided_at")
    .eq("id",documentId).is("voided_at",null).maybeSingle(),
   s.from("vat_purchase_document_files").select("id,sha256,original_filename,file_size")
    .eq("purchase_document_id",documentId).maybeSingle(),
   s.from("vat_tripletex_receipt_transfers").select("status,recipient,provider_message_id")
    .eq("purchase_document_id",documentId).maybeSingle(),
   s.from("vat_tripletex_receipt_reconciliations").select("purchase_document_id,tripletex_voucher_id,status")
    .eq("purchase_document_id",documentId).maybeSingle(),
   storedTripletexConnection(s)
  ]);
  if(doc.error||file.error||transfer.error||prior.error)
   return json({error:"Kunne ikke lese bilags- og overføringshistorikken."},503);
  if(!doc.data||!file.data||transfer.data?.status!=="accepted")
   return json({error:"Originalbilaget må finnes og være sendt til e-bilagsmottaket før kontroll."},409);
  if(!connection||connection.environment!=="production")
   return json({error:"En bekreftet Tripletex-produksjonstilkobling kreves."},409);
  if(prior.data)
   return json({error:"Bilaget er allerede avstemt og låst mot et Tripletex-bilag. Kontakt regnskapsansvarlig ved feilregistrering."},409);

  const session=await tripletexOpenSession(unprotectTripletexToken(connection),connection.environment);
  const remote=await tripletexRead(
   "/ledger/voucher/"+voucherId+"?fields=id,number,year,date,isTemporary,postings",
   session,connection.environment);
  const voucher=remoteTripletexVoucherSummary(remote,voucherId);
  const grossOre=purchaseReceiptGrossOre(doc.data);
  const publicDoc={
   supplier:doc.data.supplier_name,documentNumber:doc.data.supplier_document_number,
   date:doc.data.document_date,grossOre,vatOre:doc.data.vat_ore,
   deductibleVatOre:doc.data.deductible_vat_ore,deductionPercent:doc.data.deduction_percent,
   originalFilename:file.data.original_filename
  };
  if(body.action==="check"){
   return json({ok:true,remote:voucher,document:publicDoc,
    message:"Tripletex har returnert dette bilaget. Det beviser IKKE at bilaget tilhører kvitteringen eller at MVA-koden er korrekt. Kontroller original, leverandør, beløp, MVA og bokføringsstatus i Tripletex."});
  }
  if(!voucher.canReview)
   return json({error:"Tripletex bekrefter ikke et ikke-midlertidig bilag. Kontroller bilaget før bokføring merkes som verifisert."},409);
  if(Number(body.expectedVoucherNumber)!==voucher.number||
     Number(body.expectedVoucherYear)!==voucher.year||
     clean(body.expectedSupplierDocumentNumber)!==clean(doc.data.supplier_document_number)||
     clean(body.originalSha256)!==clean(file.data.sha256))
   return json({error:"Bilagsnummer, dokumentnummer eller originalfilen har endret seg. Start kontrollen på nytt."},409);

  const checks=body.confirmed||{};
  if(checks.supplier!==true||checks.total!==true||checks.vatAndDeduction!==true||
     checks.original!==true||checks.noDuplicate!==true||checks.bookedInTripletex!==true)
   return json({error:"Du må først kontrollere alle feltene mot et faktisk bokført bilag i Tripletex."},400);
  const vatCode=clean(body.vatCode),accountCode=clean(body.accountCode);
  const note=clean(body.note);
  if(vatCode.length<1||vatCode.length>50||!/^\d{3,8}$/.test(accountCode)||
     note.length<12||note.length>1200)
   return json({error:"Oppgi kontrollert MVA-kode, konto og en begrunnelse på 12–1200 tegn."},400);
  const saved=await s.from("vat_tripletex_receipt_reconciliations").insert({
   purchase_document_id:documentId,environment:connection.environment,
   tripletex_voucher_id:voucher.voucherId,voucher_year:voucher.year,
   voucher_number:voucher.number,voucher_date:voucher.date,
   supplier_document_number:doc.data.supplier_document_number,
   original_sha256:file.data.sha256,vat_code:vatCode,account_code:accountCode,
   owner_confirmation:note,confirmed_supplier:true,confirmed_total:true,
   confirmed_vat_and_deduction:true,confirmed_original:true,
   confirmed_no_duplicate:true,remotely_not_temporary:true,
   verified_by:user.id,status:"owner_verified_booked"
  }).select("purchase_document_id,tripletex_voucher_id,verified_at,status").single();
  if(saved.error||!saved.data)
   return json({error:"Bilaget kunne ikke knyttes til Tripletex. Kontroller at samme Tripletex-bilag ikke er brukt før. Ingenting ble bokført eller sendt."},409);
  return json({ok:true,status:"owner_verified_booked",voucherId:voucher.voucherId,
   message:"Eier har kontrollert og lagret koblingen til det bokførte Tripletex-bilaget. Ingen ny bokføring eller e-post er utført."});
 }catch(error){
  console.error("TRIPLETEX RECEIPT RECONCILE",{documentId,code:error?.status||"unavailable"});
  return json({error:error?.name==="TripletexApiError"?error.message:
   "Bilaget kunne ikke avstemmes trygt mot Tripletex. Ingen endringer i regnskapet."},503);
 }
}
