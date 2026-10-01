import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {vippsPublicStatus} from "../../../../lib/vippsConfig";

export const runtime="nodejs";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return false;
 return user.role==="owner"||await hasPermission("canUpdateOrders");
}

export async function GET(){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 return NextResponse.json({
  environment:String(process.env.VIPPS_ENV||"production").trim().toLowerCase()==="test"?"test":"production",
  units:vippsPublicStatus(),
  paymentIntegrationImplemented:false,
  note:"API-nøkler vises aldri her. Statusen viser bare om nødvendige miljøvariabler finnes."
 });
}
