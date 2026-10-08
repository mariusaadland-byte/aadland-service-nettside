import {redirect} from "next/navigation";
import {getAdminUser} from "../../../lib/auth";
import DrawingArchiveClient from "./DrawingArchiveClient";
export const metadata={title:"Tegningsarkiv | Aadland Service"};
export default async function DrawingArchivePage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(!(user.role==="owner"||user.canViewOrders||user.canManageProducts))redirect("/admin");
 return <DrawingArchiveClient/>;
}
