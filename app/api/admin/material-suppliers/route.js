import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {materialSupplierStatuses,lookupMaterialSupplier} from "../../../../lib/materialSupplierAdapters";

async function allowed(){
 const user=await getAdminUser();
 return Boolean(user&&(user.role==="owner"||await hasPermission("canUpdateOrders")||await hasPermission("canManageProducts")));
}

export async function GET(req){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const params=new URL(req.url).searchParams,supplier=params.get("supplier"),q=params.get("q");
 if(!supplier)return NextResponse.json({suppliers:materialSupplierStatuses()});
 if(!q)return NextResponse.json({error:"Søk mangler."},{status:400});
 try{
  const result=await lookupMaterialSupplier(supplier,q);
  if(result.error)return NextResponse.json({error:result.error},{status:result.status||500});
  return NextResponse.json(result);
 }catch{
  return NextResponse.json({error:"Kunne ikke hente leverandørpris."},{status:502});
 }
}
