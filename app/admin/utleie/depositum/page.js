import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import RentalDepositClient from "./RentalDepositClient";
export const metadata={title:"Depositum og returkontroll – Aadland Utleie",robots:{index:false,follow:false}};
export default async function RentalDepositPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(!(user.role==="owner"||await hasPermission("canViewOrders")))redirect("/admin");
 return <RentalDepositClient/>;
}
