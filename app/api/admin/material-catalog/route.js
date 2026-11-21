import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {materialMarkupOrFallback} from "../../../../lib/materialMarkupPolicy";
import {supplierPriceFreshness} from "../../../../lib/materialPriceFreshness";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 if(user.role==="owner"||await hasPermission("canUpdateOrders")||await hasPermission("canManageProducts"))return user;
 return null;
}
function supplierRow(row,companyMarkup=15){
 return {
  id:row.id,
  name:row.name,
  isPrimary:row.is_primary===true,
  defaultMarkupPercent:Number(row.default_markup_percent??companyMarkup),
  inheritsCompanyMarkup:row.default_markup_percent===null,
  lastImportAt:row.last_import_at||null,
  lastSourceFilename:row.last_source_filename||"",
  ...supplierPriceFreshness({id:row.id,lastImportAt:row.last_import_at})
 };
}
function productRow(row,companyMarkup=15){
 return {
  supplierId:row.supplier_id,
  supplierName:row.supplier_name,
  supplierIsPrimary:row.supplier_is_primary===true,
  defaultMarkupPercent:Number(row.default_markup_percent??companyMarkup),
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

 const {data:companyPreference,error:preferenceError}=await s.from("quote_admin_preferences")
  .select("default_material_markup").eq("id","main").maybeSingle();
 if(preferenceError)return NextResponse.json({error:"Kunne ikke hente bedriftens standardpåslag."},{status:503});
 const companyMarkup=materialMarkupOrFallback(companyPreference?.default_material_markup);
 const params=new URL(req.url).searchParams;
 const q=String(params.get("q")||"").trim().slice(0,240);
 const supplier=String(params.get("supplier")||"").trim().slice(0,80);
 const limit=Math.min(50,Math.max(1,Number(params.get("limit"))||20));
 const suppliers=(supplierData||[]).map(row=>supplierRow(row,companyMarkup));

 if(!q)return NextResponse.json({suppliers,products:[],companyMarkup});

 const {data,error}=await s.rpc("search_material_supplier_products",{
  search_query:q,
  supplier_filter:supplier||null,
  result_limit:limit
 });
 if(error)return NextResponse.json({error:"Kunne ikke søke i materialkatalogen."},{status:500});
 const markupBySupplier=new Map(suppliers.map(row=>[row.id,row.defaultMarkupPercent]));
 const freshnessBySupplier=new Map(suppliers.map(row=>[row.id,{priceStatus:row.priceStatus,priceReviewRequired:row.priceReviewRequired,priceAgeDays:row.priceAgeDays,lastImportAt:row.lastImportAt}]));
 const manualSkus=(data||[]).filter(row=>row.supplier_id==="egne-varer").map(row=>row.supplier_sku);
 const manualPrices=new Map();
 if(manualSkus.length){
  const {data:prices,error:priceError}=await s.from("material_supplier_products").select("supplier_sku,sale_ex_vat_ore").eq("supplier_id","egne-varer").in("supplier_sku",manualSkus);
  if(priceError)return NextResponse.json({error:"Kunne ikke hente lagrede salgspriser."},{status:500});
  for(const price of prices||[])if(price.sale_ex_vat_ore!=null)manualPrices.set(price.supplier_sku,Number(price.sale_ex_vat_ore)/100);
 }
 return NextResponse.json({suppliers,products:(data||[]).map(row=>({...productRow(row,companyMarkup),defaultMarkupPercent:markupBySupplier.get(row.supplier_id)??companyMarkup,...(freshnessBySupplier.get(row.supplier_id)||{priceStatus:"unknown",priceReviewRequired:true,priceAgeDays:null,lastImportAt:null}),...(row.supplier_id==="egne-varer"&&manualPrices.has(row.supplier_sku)?{saleExVat:manualPrices.get(row.supplier_sku)}:{})}))});
}

export async function PATCH(req){
 const originError=sameOriginGuard(req);
 if(originError)return originError;
 const user=await getAdminUser();
 if(!user||user.role!=="owner")return NextResponse.json({error:"Bare eier kan endre standardpåslag."},{status:403});
 const body=await req.json().catch(()=>({}));
 const supplierId=String(body.supplierId||"").trim().slice(0,80);
 const inherit=Object.prototype.hasOwnProperty.call(body,"markupPercent")&&body.markupPercent===null;
 const markup=inherit?null:Number(body.markupPercent);
 if(!supplierId||(!inherit&&(!Number.isFinite(markup)||markup<0||markup>1000)))return NextResponse.json({error:"Ugyldig leverandør eller påslag."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data,error}=await s.from("material_suppliers").update({default_markup_percent:markup}).eq("id",supplierId).eq("active",true).select("id,default_markup_percent").maybeSingle();
 if(error)return NextResponse.json({error:"Kunne ikke lagre standardpåslaget."},{status:500});
 if(!data)return NextResponse.json({error:"Leverandøren ble ikke funnet."},{status:404});
 return NextResponse.json({supplierId:data.id,markupPercent:data.default_markup_percent===null?null:Number(data.default_markup_percent),inheritsCompanyMarkup:data.default_markup_percent===null});
}
