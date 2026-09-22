import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import RentalCategoriesClient from "./RentalCategoriesClient";

export default async function RentalCategoriesAdminPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||await hasPermission("canManageProducts")))redirect("/admin");
 return <RentalCategoriesClient/>;
}
