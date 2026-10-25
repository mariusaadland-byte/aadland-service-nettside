import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import NewRentalItemClient from "../ny/NewRentalItemClient";
export const metadata={title:"Rediger utleieprodukt",robots:{index:false,follow:false}};
export default async function EditRentalItemPage({params}){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||await hasPermission("canManageProducts")))redirect("/admin");
 const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(String(id||"")))redirect("/admin/utleie");
 return <NewRentalItemClient itemId={id}/>;
}
