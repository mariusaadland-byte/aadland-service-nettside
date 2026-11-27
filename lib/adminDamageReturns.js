import "server-only";
import {db} from "./supabase";
import {damageWriteEnabled} from "./damageStorage";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export async function adminDamageReturns(){
 if(!damageWriteEnabled())return {ok:false};
 const s=db();if(!s)return {ok:false};
 try{
 const r=await s.from("rental_group_returns").select("group_id,booking_id,condition,note",{count:"exact"}).in("condition",["damage","missing_accessory"]).limit(100);
 if(r.error||!Array.isArray(r.data)||r.count!==r.data.length)return {ok:false};
 if(!r.data.length)return {ok:true,rows:[]};
 const [g,b,c]=await Promise.all([
 s.from("rental_order_groups").select("id,customer_user_id,order_number,deposit_ore,status").in("id",[...new Set(r.data.map(x=>x.group_id))]),
 s.from("rental_bookings").select("id,group_id,customer_user_id,booking_number").in("id",r.data.map(x=>x.booking_id)),
 s.from("rental_group_damage_claims").select("id,booking_id,group_id,amount_ore").in("booking_id",r.data.map(x=>x.booking_id))]);
 if([g,b,c].some(x=>x.error||!Array.isArray(x.data)))return {ok:false};
 const rows=[];
 for(const ret of r.data){
 const group=g.data.find(x=>x.id===ret.group_id),booking=b.data.find(x=>x.id===ret.booking_id);
 if(!group||!booking||booking.group_id!==group.id||booking.customer_user_id!==group.customer_user_id||!rentalUnitId(group.id)||!rentalUnitId(booking.id))return {ok:false};
 if(group.status!=="fulfilled")continue;
 const claim=c.data.find(x=>x.booking_id===booking.id);
 if(claim&&claim.group_id!==group.id)return {ok:false};
 rows.push({groupId:group.id,bookingId:booking.id,label:"Ordre "+group.order_number+" · "+booking.booking_number,condition:ret.condition,note:ret.note,depositOre:group.deposit_ore,published:!!claim});
 }
 return {ok:true,rows};
 }catch{return {ok:false};}
}
