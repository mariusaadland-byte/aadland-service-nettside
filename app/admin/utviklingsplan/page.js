import {redirect} from "next/navigation";
import {getAdminUser} from "../../../lib/auth";
import RoadmapClient from "./RoadmapClient";
export default async function AdminDevelopmentPlanPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(user.role!=="owner")redirect("/admin");
 return <RoadmapClient/>;
}
