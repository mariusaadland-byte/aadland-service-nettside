import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import NewCustomerClient from "./NewCustomerClient";
export default async function NewCustomerPage({searchParams}){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))redirect("/admin");
 const query=await searchParams;
 const id=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(query?.invoiceId||""))?String(query.invoiceId):"";
 return <NewCustomerClient invoiceId={id}/>;
}
