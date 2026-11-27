import "server-only";
import {db} from "./supabase";
import {damageWriteEnabled} from "./damageStorage";
import {damageReview} from "./damageReview.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export async function adminDamageReview(groupId){
 if(!damageWriteEnabled()||groupId!==undefined&&!rentalUnitId(groupId))return {ok:false};
 const s=db();if(!s)return {ok:false};
 try{
 let q=s.from("rental_group_damage_claims").select("id,group_id,booking_id,description,amount_ore,photo_digests,cost_proof_digest,claim_digest",{count:"exact"}).limit(100);
 if(groupId)q=q.eq("group_id",groupId);
 const c=await q;
 if(c.error||!Array.isArray(c.data)||c.count!==c.data.length)return {ok:false};
 if(!c.data.length)return {ok:true,rows:[]};
 const ids=[...new Set(c.data.map(x=>x.group_id))];
 const [g,b,r,a,d,t]=await Promise.all([
 s.from("rental_order_groups").select("id,customer_user_id,order_number,deposit_ore,status",{count:"exact"}).in("id",ids),
 s.from("rental_bookings").select("id,group_id,customer_user_id,booking_number,status",{count:"exact"}).in("group_id",ids).limit(1000),
 s.from("rental_group_returns").select("booking_id,group_id",{count:"exact"}).in("group_id",ids).limit(1000),
 s.from("rental_group_damage_responses").select("claim_id,customer_id,claim_digest,response,note",{count:"exact"}).in("claim_id",c.data.map(x=>x.id)),
 s.from("rental_group_deposit_receipts").select("group_id,amount_ore,proof_digest",{count:"exact"}).in("group_id",ids),
 s.from("rental_group_return_settlements").select("group_id,refund_ore,retained_ore,closed_at",{count:"exact"}).in("group_id",ids)]);
 if([g,b,r,a,d,t].some(x=>x.error||!Array.isArray(x.data)||x.count!==x.data.length)||g.data.length!==ids.length)return {ok:false};
 const rows=[];
 for(const group of g.data){
 const claims=c.data.filter(x=>x.group_id===group.id),row=damageReview({group,claims,bookings:b.data.filter(x=>x.group_id===group.id),returns:r.data.filter(x=>x.group_id===group.id),responses:a.data.filter(x=>claims.some(y=>y.id===x.claim_id)),deposit:d.data.find(x=>x.group_id===group.id),settlement:t.data.find(x=>x.group_id===group.id)});
 if(!row)return {ok:false};rows.push(row);
 }
 return {ok:true,rows};
 }catch{return {ok:false};}
}
