import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import ClosedInvoicesReportClient from "./ClosedInvoicesReportClient";
export default async function ClosedInvoicesReportPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(user.role!=="owner")redirect("/admin");
 return <ClosedInvoicesReportClient/>;
}
