import {redirect} from "next/navigation";
import {getAdminUser} from "../../../lib/auth";
import RoadmapClient from "./RoadmapClient";
export default async function AdminDevelopmentPlanPage({searchParams}){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(user.role!=="owner")redirect("/admin");
 const params=await searchParams;
 return <RoadmapClient initialScope={params?.vis==="utleie"?"rental-final":"service-final"}/>;
}
