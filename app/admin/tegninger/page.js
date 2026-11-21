import {redirect} from "next/navigation";
import {getAdminUser} from "../../../lib/auth";
import {canReadProjectDrawings,canEditProjectDrawings} from "../../../lib/projectDrawingPermissions";
import DrawingArchiveClient from "./DrawingArchiveClient";
export const metadata={title:"Tegningsarkiv | Aadland Service"};
export default async function DrawingArchivePage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(!canReadProjectDrawings(user))redirect("/admin");
 return <DrawingArchiveClient canEdit={canEditProjectDrawings(user)}/>;
}
