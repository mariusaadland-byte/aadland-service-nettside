import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import PlanJobClient from "./PlanJobClient";

export default async function PlanJobPage({params}){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||admin.canUpdateOrders))redirect("/admin");
 const resolved=await params;
 return <PlanJobClient jobId={resolved.id}/>;
}
