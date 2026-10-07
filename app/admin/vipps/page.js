import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import VippsStatusClient from "./VippsStatusClient";

export default async function VippsAdminPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 const allowed=user.role==="owner"||await hasPermission("canUpdateOrders");
 if(!allowed)redirect("/admin");
 return <VippsStatusClient/>;
}
