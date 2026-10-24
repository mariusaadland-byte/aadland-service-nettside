import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import SystimaConnectionClient from "./SystimaConnectionClient";
export default async function SystimaConnectionPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(user.role!=="owner")redirect("/admin");
 return <SystimaConnectionClient/>;
}
