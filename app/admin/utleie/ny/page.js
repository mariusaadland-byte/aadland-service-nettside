import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import NewRentalItemClient from "./NewRentalItemClient";

export default async function NewRentalItemPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||admin.canManageProducts))redirect("/admin");
 return <NewRentalItemClient/>;
}
