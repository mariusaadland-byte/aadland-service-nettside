import {redirect} from "next/navigation";
import {getAdminUser} from "../../../lib/auth";
import RentalCategoriesClient from "./RentalCategoriesClient";

export default async function RentalCategoriesAdminPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||admin.canManageProducts))redirect("/admin");
 return <RentalCategoriesClient/>;
}
