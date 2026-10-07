import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../lib/auth";
import PaymentReminderClient from "./PaymentReminderClient";

export default async function PaymentReminderPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 const allowed=user.role==="owner"||await hasPermission("canUpdateOrders");
 if(!allowed)redirect("/admin");
 return <PaymentReminderClient/>;
}
