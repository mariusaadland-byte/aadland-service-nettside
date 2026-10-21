import {redirect,notFound} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import CustomerCardClient from "./CustomerCardClient";
export default async function CustomerCardPage({params,searchParams}){
 const user=await getAdminUser();if(!user)redirect("/admin/login");
 if(!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))redirect("/admin");
 const {id}=await params;const query=await searchParams;
 const s=db();if(!s)notFound();
 const {data,error}=await s.from("admin_customer_contacts").select("id,name,email,phone,address,payment_terms_days,updated_at").eq("id",id).maybeSingle();
 if(error||!data)notFound();
 const invoiceId=/^[0-9a-f-]{36}$/i.test(query?.invoiceId||"")?query.invoiceId:null;
 return <CustomerCardClient contact={{...data,paymentTermsDays:data.payment_terms_days,updatedAt:data.updated_at}} invoiceId={invoiceId}/>;
}
