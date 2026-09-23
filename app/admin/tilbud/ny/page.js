import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import QuoteEditorClient from "../QuoteEditorClient";

export default async function NewQuotePage({searchParams}){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||admin.canUpdateOrders||admin.canManageProducts))redirect("/admin");
 const resolved=await searchParams;
 const sourceOrderId=String(resolved?.orderId||"").trim()||null;
 const initialCustomer=sourceOrderId?null:{
  name:String(resolved?.name||"").trim().slice(0,120),
  email:String(resolved?.email||"").trim().slice(0,254),
  phone:String(resolved?.phone||"").trim().slice(0,40),
  address:String(resolved?.address||"").trim().slice(0,300)
 };
 return <QuoteEditorClient sourceOrderId={sourceOrderId} initialCustomer={initialCustomer}/>;
}
