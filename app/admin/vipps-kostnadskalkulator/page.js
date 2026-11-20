import {redirect} from "next/navigation";
import {getAdminUser} from "../../../lib/auth";
import VippsCostCalculatorClient from "./VippsCostCalculatorClient";

export const metadata={
 title:"Vipps-kostnad og forventet utbetaling",
 robots:{index:false,follow:false}
};
export default async function VippsCostCalculatorPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login?next=%2Fadmin%2Fvipps-kostnadskalkulator");
 if(user.role!=="owner")redirect("/admin");
 return <VippsCostCalculatorClient/>;
}
