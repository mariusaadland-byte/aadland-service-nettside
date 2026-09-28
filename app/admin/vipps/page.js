import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import VippsSetupClient from "./VippsSetupClient";

export const metadata={title:"Vipps-oppsett"};

export default async function VippsSetupPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(!(await hasPermission("canUpdateOrders")))redirect("/admin");
 return <VippsSetupClient/>;
}
