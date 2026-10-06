import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import CalculatorClient from "./CalculatorClient";

export default async function CalculatorPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 const allowed=user.role==="owner"||await hasPermission("canUpdateOrders");
 if(!allowed)redirect("/admin");
 return <CalculatorClient/>;
}
