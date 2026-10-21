import {redirect,notFound} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import InvoicePrintClient from "./InvoicePrintClient";
export default async function InvoicePrintPage({params}){
 const user=await getAdminUser();if(!user)redirect("/admin/login");
 if(!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))redirect("/admin");
 const {id}=await params;const s=db();if(!s)notFound();
 const {data,error}=await s.from("invoice_drafts").select("id,status,invoice_number").eq("id",id).maybeSingle();
 if(error||!data)notFound();
 if(data.status==="draft")redirect("/admin/faktura?id="+encodeURIComponent(id));
 return <InvoicePrintClient id={data.id} invoiceNumber={data.invoice_number}/>;
}
