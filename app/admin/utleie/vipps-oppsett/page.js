import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import RentalVippsSetupClient from "./RentalVippsSetupClient";

export const metadata={
 title:"Vipps-oppsett for Aadland Utleie",
 robots:{index:false,follow:false}
};
export default async function RentalVippsSetupPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login?next=%2Fadmin%2Futleie%2Fvipps-oppsett");
 if(user.role!=="owner")redirect("/admin");
 return <RentalVippsSetupClient/>;
}
