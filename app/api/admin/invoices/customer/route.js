import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
const fail=(error,status=400)=>NextResponse.json({error},{status});
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(!user||!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))return fail("Ingen tilgang.",403);
 const {id}=await req.json().catch(()=>({}));
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const found=await s.from("invoice_drafts").select("id,status,customer").eq("id",id).maybeSingle();
 if(found.error||!found.data)return fail("Fakturaen ble ikke funnet.",404);
 const invoice=found.data,c=invoice.customer||{},email=String(c.email||"").trim().toLowerCase();
 let contact=null;
 if(c.contactId){
  const r=await s.from("admin_customer_contacts").select("*").eq("id",c.contactId).maybeSingle();
  if(r.error)return fail("Kundekortet kunne ikke hentes.",500);contact=r.data;
 }
 if(!contact&&email){
  const r=await s.from("admin_customer_contacts").select("*").eq("email",email).maybeSingle();
  if(r.error)return fail("Kunden kunne ikke kontrolleres.",500);contact=r.data;
 }
 if(!contact){
  if(!String(c.name||"").trim())return fail("Fyll inn kundenavn først.");
  const r=await s.from("admin_customer_contacts").insert({name:c.name,email:email||null,phone:c.phone||null,address:c.address||null}).select("*").single();
  if(r.error){
   if(r.error.code==="23505"&&email){const existing=await s.from("admin_customer_contacts").select("*").eq("email",email).maybeSingle();contact=existing.data;}
   if(!contact)return fail("Kundekortet kunne ikke opprettes.",500);
  }else contact=r.data;
 }
 if(invoice.status==="draft"){
  const linked=await s.from("invoice_drafts").update({customer:{...c,contactId:contact.id},updated_at:new Date().toISOString()}).eq("id",id).eq("status","draft");
  if(linked.error)return fail("Kundekortet kunne ikke knyttes til kladden.",500);
 }
 return NextResponse.json({contactId:contact.id,url:"/admin/kunder/"+contact.id+"?invoiceId="+encodeURIComponent(id)});
}
