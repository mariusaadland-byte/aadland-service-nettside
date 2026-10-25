import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import RentalInventoryClient from "./RentalInventoryClient";
export const metadata={title:"Utleieutstyr – administrasjon",robots:{index:false,follow:false}};
export default async function RentalInventoryPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||await hasPermission("canManageProducts")))redirect("/admin");
 return <RentalInventoryClient/>;
}
