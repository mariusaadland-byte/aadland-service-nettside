import "server-only";
import {db} from "./supabase";
import {groupAdminRow} from "./groupAdminRow.mjs";
import {verifiedCurrentRentalAgreement} from "./rentalAgreementGate.mjs";
import {evidenceKey} from "./signingArchiveConfig";
export const groupAdminEnabled=()=>process.env.VERCEL_ENV==="production"&&process.env.AADLAND_GROUP_ADMIN_ENABLED==="true";
export async function groupAdminOrders(){
 if(!groupAdminEnabled())return {ok:false};
 const s=db();if(!s)return {ok:false};
 try{
 const groups=await s.from("rental_order_groups").select("*",{count:"exact"}).order("created_at",{ascending:false}).limit(50);
 const complete=r=>!r.error&&Array.isArray(r.data)&&r.count===r.data.length;
 if(!complete(groups))return {ok:false};if(!groups.data.length)return {ok:true,rows:[]};
 const ids=groups.data.map(g=>g.id);
 const [b,p,c,d,h,r,t,dam]=await Promise.all([
 s.from("rental_bookings").select("id,group_id,booking_number,status,start_date,end_date",{count:"exact"}).in("group_id",ids).limit(1000),
 s.from("aadland_agreement_current").select("*",{count:"exact"}).in("group_id",ids),
 s.from("rental_group_payment_claims").select("*",{count:"exact"}).in("group_id",ids),
 s.from("rental_group_deposit_receipts").select("group_id,amount_ore",{count:"exact"}).in("group_id",ids),
 s.from("rental_group_handover_reports").select("id,group_id",{count:"exact"}).in("group_id",ids),
 s.from("rental_group_returns").select("group_id,booking_id,condition",{count:"exact"}).in("group_id",ids).limit(1000),
 s.from("rental_group_return_settlements").select("group_id,request_id,deposit_ore,refund_ore,retained_ore,closed_at",{count:"exact"}).in("group_id",ids),
 s.from("rental_group_damage_claims").select("id,group_id",{count:"exact"}).in("group_id",ids).limit(1000)]);
 if(![b,p,c,d,h,r,t,dam].every(complete))return {ok:false};
 const ai=p.data.map(x=>x.agreement_id),hi=h.data.map(x=>x.id),empty={data:[],count:0,error:null};
 const [agreements,evidence,assignments]=await Promise.all([
 ai.length?s.from("aadland_agreements").select("*",{count:"exact"}).in("id",ai):empty,
 ai.length?s.from("aadland_signing_evidence").select("*",{count:"exact"}).in("agreement_id",ai):empty,
 hi.length?s.from("rental_group_unit_assignments").select("*",{count:"exact"}).in("report_id",hi).limit(1000):empty]);
 if(![agreements,evidence,assignments].every(complete)||agreements.data.length!==ai.length)return {ok:false};
 const rows=[];
 for(const group of groups.data){
 const pointer=p.data.find(x=>x.group_id===group.id),agreement=agreements.data.find(x=>x.id===pointer?.agreement_id),record=evidence.data.find(x=>x.agreement_id===agreement?.id),report=h.data.find(x=>x.group_id===group.id);
 const signed=record?!!verifiedCurrentRentalAgreement({group,agreement,pointer,record,key:evidenceKey(record.key_id),now:new Date().toISOString()}):false;
 if(record&&!signed)return {ok:false};
 const row=groupAdminRow({group,bookings:b.data.filter(x=>x.group_id===group.id),agreementId:agreement?.id,signed,claim:c.data.find(x=>x.group_id===group.id),deposit:d.data.find(x=>x.group_id===group.id),report,assignments:assignments.data.filter(x=>x.report_id===report?.id),returns:r.data.filter(x=>x.group_id===group.id),settlement:t.data.find(x=>x.group_id===group.id),damageCount:dam.data.filter(x=>x.group_id===group.id).length});
 if(!row)return {ok:false};rows.push(row);
 }
 return {ok:true,rows};
 }catch{return {ok:false};}
}
