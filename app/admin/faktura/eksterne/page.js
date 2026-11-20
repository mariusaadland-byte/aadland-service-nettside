import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import ExternalInvoiceRegisterClient from "./ExternalInvoiceRegisterClient";

export const dynamic="force-dynamic";
export default async function ExternalInvoiceRegisterPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(admin.role!=="owner")redirect("/admin/faktura/arkiv");
 return <ExternalInvoiceRegisterClient/>;
}
