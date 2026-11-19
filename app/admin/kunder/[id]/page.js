import {redirect,notFound} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import CustomerCardClient from "./CustomerCardClient";
import {storedTripletexConnection} from "../../../../lib/tripletexCredentials";
export default async function CustomerCardPage({params,searchParams}){
 const user=await getAdminUser();if(!user)redirect("/admin/login");
 if(!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))redirect("/admin");
 const {id}=await params;const query=await searchParams;
 const s=db();if(!s)notFound();
 const {data,error}=await s.from("admin_customer_contacts").select("id,name,email,phone,address,payment_terms_days,customer_type,organization_number,contact_person,internal_note,preferred_payment_method,updated_at").eq("id",id).maybeSingle();
 if(error||!data)notFound();
 const invoiceId=/^[0-9a-f-]{36}$/i.test(query?.invoiceId||"")?query.invoiceId:null;
 let autoSyncTripletex=false;
 if(invoiceId&&user.role==="owner"){
  const {data:invoice,error:invoiceError}=await s.from("invoice_drafts")
   .select("id,status,customer,paid_ore,credited_ore").eq("id",invoiceId).maybeSingle();
  if(!invoiceError&&invoice?.status==="sent"&&invoice.customer?.contactId===id&&
   Number(invoice.paid_ore)===0&&Number(invoice.credited_ore)===0){
   try{
    const connection=await storedTripletexConnection(s);
    if(connection){
     const {data:linked,error:linkError}=await s.from("tripletex_customer_links")
      .select("status,tripletex_customer_id").eq("source_type","contact")
      .eq("source_id",id).eq("environment",connection.environment).maybeSingle();
     autoSyncTripletex=!linkError&&linked?.status==="linked"&&
      Number.isSafeInteger(Number(linked.tripletex_customer_id))&&Number(linked.tripletex_customer_id)>0;
    }
   }catch{}
  }
 }
 return <CustomerCardClient contact={{...data,paymentTermsDays:data.payment_terms_days,customerType:data.customer_type||"private",organizationNumber:data.organization_number||"",contactPerson:data.contact_person||"",internalNote:data.internal_note||"",preferredPaymentMethod:data.preferred_payment_method||"bank",updatedAt:data.updated_at}} invoiceId={invoiceId} autoSyncTripletex={autoSyncTripletex}/>;
}
