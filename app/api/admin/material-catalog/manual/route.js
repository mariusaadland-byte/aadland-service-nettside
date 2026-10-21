import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {MANUAL_SUPPLIER_ID,parseManualProduct} from "../../../../../lib/manualMaterialProducts";
async function allowed(){
 const user=await getAdminUser();
 return Boolean(user&&(user.role==="owner"||await hasPermission("canUpdateOrders")||await hasPermission("canManageProducts")));
}
export async function GET(req){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const offset=Math.max(0,Math.floor(Number(new URL(req.url).searchParams.get("offset"))||0));
 const {data,error}=await s.from("material_supplier_products").select("supplier_sku,name,unit,cost_ex_vat_ore,sale_ex_vat_ore,category_name,ean,updated_at").eq("supplier_id",MANUAL_SUPPLIER_ID).eq("active",true).order("updated_at",{ascending:false}).order("supplier_sku").range(offset,offset+100);
 if(error)return NextResponse.json({error:"Kunne ikke hente egen prisliste."},{status:500});
 return NextResponse.json({products:(data||[]).slice(0,100),hasMore:(data||[]).length>100});
}
export async function POST(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>null);if(!body)return NextResponse.json({error:"Ugyldig vare."},{status:400});
 const parsed=parseManualProduct(body);if(parsed.error)return NextResponse.json({error:parsed.error},{status:400});
 const sku=String(body.sku||"").trim();
 if(sku.length>120||!sku)return NextResponse.json({error:"Oppgi varenummer, eller bruk det foreslåtte nummeret."},{status:400});
 const originalSku=String(body.originalSku||"").trim();
 if(originalSku&&originalSku!==sku)return NextResponse.json({error:"Varenummeret beholdes ved redigering. Opprett en ny vare dersom du trenger et annet nummer."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {error:supplierError}=await s.from("material_suppliers").upsert({id:MANUAL_SUPPLIER_ID,name:"Egne varer",active:true,default_markup_percent:20},{onConflict:"id",ignoreDuplicates:true});
 if(supplierError)return NextResponse.json({error:"Kunne ikke klargjøre prislisten."},{status:500});
 const record={...parsed.record,updated_at:new Date().toISOString()};
 const result=originalSku
  ?await s.from("material_supplier_products").update(record).eq("supplier_id",MANUAL_SUPPLIER_ID).eq("supplier_sku",originalSku).eq("active",true).select("supplier_sku").maybeSingle()
  :await s.from("material_supplier_products").insert({...record,supplier_id:MANUAL_SUPPLIER_ID,supplier_sku:sku,active:true,source_filename:"Manuelt registrert"}).select("supplier_sku").single();
 if(result.error)return NextResponse.json({error:result.error.code==="23505"?"Varenummeret finnes allerede. Velg Rediger på varen, eller bruk et annet nummer.":"Varen kunne ikke lagres."},{status:result.error.code==="23505"?409:500});
 if(!result.data)return NextResponse.json({error:"Varen finnes ikke lenger. Oppdater listen."},{status:404});
 return NextResponse.json({ok:true,sku:result.data.supplier_sku});
}
