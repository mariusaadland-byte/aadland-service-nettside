import {redirect} from "next/navigation";
import {getAdminUser} from "../../../lib/auth";
import QuotesClient from "./QuotesClient";

export default async function QuotesPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||admin.canUpdateOrders||admin.canManageProducts))redirect("/admin");
 return <QuotesClient/>;
}
