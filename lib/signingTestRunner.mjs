// Synthetic tests only. No db(), Resend, Vipps, network or real keys.
import {randomBytes} from "node:crypto";
import {groupQuoteSnapshot} from "./rentalGroupQuote.mjs";
import {buildRentalAgreementPdf} from "./rentalAgreementPdf.mjs";
import {issueSigningChallenge,verifySigningCode,agreementDocumentDigest} from "./aadlandSigning.mjs";
import {requestSigningCode,signingContext,decideSigningAttempt} from "./aadlandSigningWorkflow.mjs";
import {signingCommitPlan} from "./aadlandSigningCommit.mjs";
import {archiveAccess,archiveDocument,checkedEvidence} from "./signingArchiveDownload.mjs";
import {signingConfirmationPayload} from "./signingConfirmation.mjs";
import {groupVippsCreatePlan} from "./rentalGroupVipps.mjs";
import {rentalGroupOperationDecision} from "./rentalAgreementGate.mjs";
import {signingDraftStore} from "./signingDraftStore.mjs";
import {stockTransition,rentalSalesInvoiceDraft} from "./rentalStockSettlement.mjs";
import {groupExpiryDecision} from "./rentalGroupExpiry.mjs";
import {damageReview} from "./damageReview.mjs";
import {canonicalDamageClaim} from "./damagePublication.mjs";
import {damagePdfPreflight} from "./damagePdfPreflight.mjs";
import {SIGNING_TESTS} from "./signingTestSpecs.mjs";
const id="00000000-0000-4000-8000-000000000001",customerId="00000000-0000-4000-8000-000000000002",agreementId="00000000-0000-4000-8000-000000000003",now="2026-11-27T14:00:00Z",today=now.slice(0,10);
function fixture(){
 const quote=groupQuoteSnapshot({rentals:[{itemId:id,name:"Demoborhammer",startDate:today,endDate:today,quantity:1,available:true,totalOre:60000,depositOre:150000}],today});
 const pdfArgs={agreementId,customerId,customerName:"Test Øst",email:"demo@example.invalid",orderNumber:"DEMO-125",revision:1,quote,today};
 const pdf=buildRentalAgreementPdf(pdfArgs);
 const agreement={id:agreementId,group_id:id,customer_user_id:customerId,revision:1,created_at:now,document_bytes:pdf.bytes,document_digest:pdf.documentDigest,quote_digest:quote.digest,terms_version:pdf.termsVersion};
 const group={id,customer_user_id:customerId,order_number:125,status:"held",payment_reference:null,payable_ore:60000,deposit_ore:150000,rental_ore:60000,sales_ore:0,quote_digest:quote.digest,quote_snapshot:quote.snapshot,terms_version:pdf.termsVersion,expires_at:"2026-11-27T14:30:00Z"};
 const account={id:customerId,email:pdfArgs.email,email_confirmed_at:now};
 const context=signingContext({agreement,account,group,currentId:agreementId,now}),key=randomBytes(32);
 const input={...context,name:"Test Øst",accepted:true,paymentObligation:true};
 return {pdfArgs,pdf,agreement,group,account,context,key,input,pointer:{group_id:id,agreement_id:agreementId}};
}
function signed(f){
 const {challenge,code}=issueSigningChallenge({...f.context,now,key:f.key});
 const plan=signingCommitPlan({challenge,expected:f.context,code,input:f.input,now,key:f.key,keyId:"demo",accountAttemptsAllowed:true});
 if(plan?.params?.p_action!=="consume_and_record")throw Error("SIGN_PLAN");
 return {agreement_id:agreementId,challenge_id:challenge.challengeId,evidence_text:plan.params.p_evidence,evidence_seal:plan.params.p_seal,signed_at:now,key_id:"demo"};
}
export async function runSigningTest(testId){
 if(!SIGNING_TESTS.some(t=>t.id===testId))return null;
 const checks=[];
 function check(label,ok){checks.push({label,ok:ok===true});}
 try{
 const f=fixture();
 if(testId==="document"){
  check("PDF generert",f.pdf.bytes.subarray(0,5).toString()==="%PDF-");
  check("Identiske bytes gir identisk hash",buildRentalAgreementPdf(f.pdfArgs).documentDigest===f.pdf.documentDigest);
  check("Ny revisjon gir ny hash",buildRentalAgreementPdf({...f.pdfArgs,revision:2}).documentDigest!==f.pdf.documentDigest);
  check("Endret original avvist",archiveDocument({...f.agreement,document_bytes:Buffer.from("%PDF-1.4\nChanged document")})===null);
 }
 if(testId==="otp"){
  let stored,mail,revoked=false;
  const store={reserveChallenge:async v=>{stored=v.challenge;return "reserved"},revokePending:async()=>{revoked=true}};
  const req={context:f.context,input:f.input,key:f.key,keyId:"demo",now,store,send:async m=>{mail=m;return !!stored}};
  const r=await requestSigningCode(req);
  const code=mail?.text.match(/\b\d{6}\b/)?.[0];
  check("Lagring før simulert utsending",r.status==="sent"&&!!stored&&mail.to===f.account.email);
  check("Koden ikke i svar eller lagret challenge",r.code===undefined&&stored.code===undefined&&typeof stored.codeMac==="string");
  check("Riktig kode godkjent",verifySigningCode({challenge:stored,expected:f.context,code,now,key:f.key})==="verified");
  check("Utløpt kode avvist",verifySigningCode({challenge:stored,expected:f.context,code,now:"2026-11-27T14:10:00Z",key:f.key})==="expired");
  check("Ubekreftet levering revokeres",(await requestSigningCode({...req,send:async()=>false})).status==="delivery_unconfirmed"&&revoked);
 }
 if(testId==="commit"){
  const {challenge,code}=issueSigningChallenge({...f.context,now,key:f.key});
  const args={challenge,expected:f.context,code,input:f.input,now,key:f.key,keyId:"demo",accountAttemptsAllowed:true};
  const wrong=code==="000000"?"000001":"000000";
  const last=decideSigningAttempt({...args,code:wrong,challenge:{...challenge,attempts:4}});
  check("Femte feil låser kode",last.state==="locked"&&last.attempts===5&&last.clearMac===true);
  check("Kontogrense sperrer",decideSigningAttempt({...args,accountAttemptsAllowed:false}).action==="limited");
  const plan=signingCommitPlan(args);
  // In-memory compare-and-swap simulation; not PostgreSQL concurrency.
  let pending=true,recordCount=0;
  function commit(p){if(!pending||p?.params?.p_expected_mac!==challenge.codeMac||p.params.p_expected_attempts!==0)return "stale";pending=false;recordCount++;return "signed";}
  check("Første registrering godkjent",plan.params.p_action==="consume_and_record"&&commit(plan)==="signed");
  check("Gjenbruk i simulert lagring avvist",commit(plan)==="stale"&&recordCount===1);
  check("Brukt kode avvist",decideSigningAttempt({...args,challenge:{...challenge,state:"consumed"}}).action==="closed");
 }
 if(testId==="archive"){
  const record=signed(f),args={...f,record};
  check("Egen avtale tillatt",archiveAccess({actor:{kind:"customer",id:customerId},agreement:f.agreement,group:f.group}));
  check("Fremmed kunde avvist",!archiveAccess({actor:{kind:"customer",id},agreement:f.agreement,group:f.group}));
  check("Endret signeringsbevis avvist",!checkedEvidence({...args,record:{...record,evidence_seal:"a".repeat(64)}}));
  const mail=signingConfirmationPayload(args);
  check("Original PDF og separat bevis",mail?.attachments?.length===2&&agreementDocumentDigest(mail.attachments[0].content)===f.agreement.document_digest);
  check("Ny e-postadresse avvist",signingConfirmationPayload({...args,account:{...f.account,email:"other@example.invalid"}})===null);
 }
 if(testId==="payment"){
  const record=signed(f),args={...f,record,customerId,now};
  check("Gyldig bevis gir betalingsplan",groupVippsCreatePlan(args)?.amountOre===60000);
  check("Uten bevis ingen betalingsplan",groupVippsCreatePlan({...args,record:null})===null);
  check("Manipulert beløp avvist",groupVippsCreatePlan({...args,group:{...f.group,payable_ore:1}})===null);
  check("Manglende utleveringsgrunnlag sperres",rentalGroupOperationDecision({...args,operation:"handover"}).action==="blocked");
  check("Fysisk retur kan mottas",rentalGroupOperationDecision({operation:"accept_physical_return"}).action==="accept_return");
 }
 if(testId==="rpc"){
  const {challenge,code}=issueSigningChallenge({...f.context,now,key:f.key});
  const calls=[],mock={rpc:async(name,params)=>{calls.push({name,params});return {data:name==="draft_signing_issue"?"reserved":name==="draft_signing_revoke"?true:"signed",error:null}}};
  const store=signingDraftStore(mock);
  check("RPC utstedelsesparametere",await store.reserveChallenge({context:f.context,challenge,keyId:"demo"})==="reserved"&&calls[0].params.p_mac===challenge.codeMac&&!("code" in calls[0].params));
  const plan=signingCommitPlan({challenge,expected:f.context,code,input:f.input,now,key:f.key,keyId:"demo",accountAttemptsAllowed:true});
  check("RPC compare-and-swap",await store.commit(plan)==="signed"&&calls[1].params.p_expected_attempts===0);
  check("Revoker eksakt challenge",await store.revokePending({context:f.context,challengeId:challenge.challengeId})===true&&calls[2].params.p_id===challenge.challengeId);
  let denied=false;try{await signingDraftStore({rpc:async()=>({data:null,error:null})}).commit(plan)}catch{denied=true}
  check("Ukjent databasesvar avvist",denied);
 }
 if(testId==="stock"){
 const first=stockTransition({state:"none",event:"reserve",quantity:2,onHand:5,reserved:0});
 check("To av fem varer holdes av",first?.reserved===2&&first.onHand===5);
 const confirmed=stockTransition({...first,event:"confirm",quantity:2});
 check("Betaling endrer ikke fysisk lager",confirmed?.onHand===5&&confirmed.reserved===2);
 const handed=stockTransition({...confirmed,event:"fulfill",quantity:2});
 check("Utlevering trekker lager én gang",handed?.onHand===3&&handed.reserved===0);
 check("Gjentatt utlevering endrer ikke lager",stockTransition({...handed,event:"fulfill",quantity:2})?.changed===false);
 const expired={status:"held",expiresAt:"2026-11-27T13:00:00Z",now,paymentStarted:false,paymentReference:null,childrenSafe:true};
 check("Utløpt ubrukt reservasjon kan frigjøres",groupExpiryDecision(expired)==="release_once");
 check("Påbegynt betaling sperrer frigjøring",groupExpiryDecision({...expired,paymentStarted:true})==="keep");
 }
 if(testId==="damage"){
 const group={...f.group,status:"fulfilled"},booking={id:agreementId,group_id:id,customer_user_id:customerId,status:"returned",booking_number:"DEMO"};
 const claim={id:"00000000-0000-4000-8000-000000000004",group_id:id,booking_id:booking.id,description:"Demo skade",amount_ore:45000,photo_digests:["a".repeat(64)],cost_proof_digest:"b".repeat(64)};
 claim.claim_digest=canonicalDamageClaim(claim);
 const response={claim_id:claim.id,customer_id:customerId,claim_digest:claim.claim_digest,response:"accepted"};
 const args={group,bookings:[booking],returns:[{booking_id:booking.id,group_id:id}],claims:[claim],responses:[response],deposit:{group_id:id,amount_ore:150000,proof_digest:"c".repeat(64)}};
 check("Godtatt krav gir riktig oppgjørsplan",damageReview(args)?.refundOre===105000);
 check("Manglende svar gir ingen plan",damageReview({...args,responses:[]})?.reason==="waiting");
 check("Bestridt krav krever manuell behandling",damageReview({...args,responses:[{...response,response:"disputed"}]})?.reason==="disputed");
 check("Endret krav avvises",damageReview({...args,claims:[{...claim,amount_ore:1}]})===null);
 check("Uverifisert depositum sperrer plan",damageReview({...args,deposit:null})?.reason==="deposit");
 }
 if(testId==="invoice"){
 const plan=rentalSalesInvoiceDraft({orderId:id,rentalLines:[{description:"Demo leie",quantity:1,grossOre:60000}],goods:[{id:agreementId,name:"Demo bor",sku:"DEMO",quantity:2,unitOre:2500}],depositOre:150000});
 check("Leie og varer 650 kr",plan?.grossOre===65000);
 check("Mva 130 kr og netto 520 kr",plan?.vatOre===13000&&plan.netOre===52000);
 check("Depositum separat",plan?.depositOre===150000);
 check("Ikke klar for regnskapsføring",plan?.readyToPost===false);
 }
 if(testId==="pdf"){
 const bytes=Buffer.from("%PDF-1.4\nsynthetic preflight only\n%%EOF\n");
 check("PDF-formatkontroll",damagePdfPreflight(bytes,"application/pdf")?.preflightOnly===true);
 check("Avkortet fil avvist",damagePdfPreflight(Buffer.from("%PDF-1.4\ntruncated"),"application/pdf")===null);
 check("Feil MIME-type avvist",damagePdfPreflight(bytes,"image/jpeg")===null);
 }
 }catch{check("Test kunne ikke fullføres",false);}
 return {id:testId,mode:"synthetic",passed:checks.length>0&&checks.every(x=>x.ok),checks};
}
