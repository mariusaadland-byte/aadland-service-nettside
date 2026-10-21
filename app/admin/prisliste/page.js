import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import PriceListClient from "./PriceListClient";
export const metadata={title:"Egen prisliste"};
export default async function Page(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");
 if(!(user.role==="owner"||await hasPermission("canUpdateOrders")||await hasPermission("canManageProducts")))redirect("/admin");
 return <PriceListClient/>;
}
