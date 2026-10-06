import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import MaterialAiClient from "./MaterialAiClient";

export const metadata={title:"Materialkalkulator"};

export default async function MaterialAiPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 const allowed=user.role==="owner"||await hasPermission("canUpdateOrders")||await hasPermission("canManageProducts");
 if(!allowed)redirect("/admin");
 return <MaterialAiClient/>;
}
