import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import WorkClockClient from "./WorkClockClient";

export default async function WorkClockPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 const allowed=user.role==="owner"||await hasPermission("canUpdateOrders");
 if(!allowed)redirect("/admin");
 return <WorkClockClient userName={user.name||user.email||"Admin"}/>;
}
