import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 if(user.role==="owner"||await hasPermission("canUpdateOrders")||await hasPermission("canManageProducts"))return user;
 return null;
}
function supplierRow(row){
 return {
  id:row.id,
  name:row.name,
  isPrimary:row.is_primary===true,
  defaultMarkupPercent:Number(row.default_markup_percent)||15,
  lastImportAt:row.last_import_at||null,
  lastSourceFilename:row.last_source_filename||""
 };
}
function productRow(row){
 return {
  supplierId:row.supplier_id,
  supplierName:row.supplier_name,
  supplierIsPrimary:row.supplier_is_primary===true,
  sku:row.supplier_sku,
  name:row.product_name,
  unit:row.unit||"STK",
  costExVat:Number(row.cost_ex_vat_ore||0)/100,
  categoryCode:row.category_code||"",
  categoryName:row.category_name||"",
  ean:row.ean||"",
  moduleNumber:row.module_number||""
 };
}

export async function GET(req){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const {data:supplierData,error:supplierError}=await s
  .from("material_suppliers")
  .select("id,name,is_primary,default_markup_percent,last_import_at,last_source_filename")
  .eq("active",true)
  .order("is_primary",{ascending:false})
  .order("name",{ascending:true});
 if(supplierError)return NextResponse.json({error:"Kunne ikke hente leverandører."},{status:500});

 const params=new URL(req.url).searchParams;
 const q=String(params.get("q")||"").trim().slice(0,240);
 const supplier=String(params.get("supplier")||"").trim().slice(0,80);
 const limit=Math.min(50,Math.max(1,Number(params.get("limit"))||20));
 const suppliers=(supplierData||[]).map(supplierRow);

 if(!q)return NextResponse.json({suppliers,products:[]});

 const {data,error}=await s.rpc("search_material_supplier_products",{
  search_query:q,
  supplier_filter:supplier||null,
  result_limit:limit
 });
 if(error)return NextResponse.json({error:"Kunne ikke søke i materialkatalogen."},{status:500});
 return NextResponse.json({suppliers,products:(data||[]).map(productRow)});
}
