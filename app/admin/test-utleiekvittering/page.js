import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import TestRentalReceiptClient from "./TestRentalReceiptClient";

export const metadata={title:"Test utleiekvittering"};

export default async function TestRentalReceiptPage(){
 if(process.env.VERCEL_ENV!=="preview")redirect("/admin");
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(!(await hasPermission("canUpdateOrders")))redirect("/admin");
 return <TestRentalReceiptClient/>;
}
