import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import TestReceiptClient from "./TestReceiptClient";

export const metadata={title:"Test kvittering"};

export default async function TestReceiptPage(){
 if(process.env.VERCEL_ENV!=="preview")redirect("/admin");
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(!(await hasPermission("canUpdateOrders")))redirect("/admin");
 return <TestReceiptClient/>;
}
