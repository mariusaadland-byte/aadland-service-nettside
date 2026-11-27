import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {costAllocationEnabled} from "../../../../lib/costAllocationConfig";
import InvoiceVatTermClient from "./InvoiceVatTermClient";
export default async function InvoiceVatTermPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(user.role!=="owner")redirect("/admin");
 return <InvoiceVatTermClient costAllocationEnabled={costAllocationEnabled()}/>;
}
