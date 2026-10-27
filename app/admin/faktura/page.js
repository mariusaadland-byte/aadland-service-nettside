import {redirect} from "next/navigation";
import {getAdminUser} from "../../../lib/auth";
import InvoicesClient from "./InvoicesClient";
export default async function InvoicePage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||admin.canUpdateOrders||admin.canManageProducts))redirect("/admin");
 return <InvoicesClient isOwner={admin.role==="owner"}/>;
}