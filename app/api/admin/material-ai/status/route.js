import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../../lib/auth";
import {materialSupplierStatuses} from "../../../../../lib/materialSupplierAdapters";

export async function GET(){
 const user=await getAdminUser();
 const allowed=Boolean(user&&(user.role==="owner"||await hasPermission("canUpdateOrders")||await hasPermission("canManageProducts")));
 if(!allowed)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 return NextResponse.json({
  aiConfigured:Boolean(process.env.OPENAI_API_KEY),
  model:process.env.MATERIAL_AI_MODEL||"gpt-5.6-terra",
  suppliers:materialSupplierStatuses()
 });
}
