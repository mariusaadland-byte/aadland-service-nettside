import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import SupplierCatalogClient from "./SupplierCatalogClient";

export const metadata={title:"Leverandørpriser"};

export default async function SupplierCatalogPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 const allowed=user.role==="owner"||await hasPermission("canUpdateOrders")||await hasPermission("canManageProducts");
 if(!allowed)redirect("/admin");
 return <SupplierCatalogClient/>;
}
