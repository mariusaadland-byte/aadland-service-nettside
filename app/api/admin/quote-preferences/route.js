import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";

async function allowed(){return Boolean(await getAdminUser())&&await hasPermission("canManageProducts");}
export async function GET(){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data,error}=await s.from("quote_admin_preferences").select("minimum_material_markup,default_material_markup").eq("id","main").maybeSingle();
 if(error)return NextResponse.json({error:"Kunne ikke hente påslagsgrensen."},{status:500});
 return NextResponse.json({minimumMaterialMarkup:Number(data?.minimum_material_markup??15),defaultMaterialMarkup:Number(data?.default_material_markup??15)});
}
export async function PUT(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const hasMinimum=Object.prototype.hasOwnProperty.call(body,"minimumMaterialMarkup");
 const hasDefault=Object.prototype.hasOwnProperty.call(body,"defaultMaterialMarkup");
 if(!hasMinimum&&!hasDefault)return NextResponse.json({error:"Ingen innstillinger å oppdatere."},{status:400});
 const minimum=hasMinimum?Number(body.minimumMaterialMarkup):null;
 const defaultValue=hasDefault?Number(body.defaultMaterialMarkup):null;
 if(hasMinimum&&(!Number.isFinite(minimum)||minimum<0||minimum>1000))return NextResponse.json({error:"Grensen må være mellom 0 og 1000 %."},{status:400});
 if(hasDefault&&(!Number.isFinite(defaultValue)||defaultValue<0||defaultValue>1000))return NextResponse.json({error:"Standardpåslag må være mellom 0 og 1000 %."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data:existing,error:readError}=await s.from("quote_admin_preferences").select("minimum_material_markup,default_material_markup").eq("id","main").maybeSingle();
 if(readError)return NextResponse.json({error:"Kunne ikke hente gjeldende påslag."},{status:500});
 const record={
  id:"main",
  minimum_material_markup:hasMinimum?minimum:Number(existing?.minimum_material_markup??15),
  default_material_markup:hasDefault?defaultValue:Number(existing?.default_material_markup??15),
  updated_at:new Date().toISOString()
 };
 const {error}=await s.from("quote_admin_preferences").upsert(record,{onConflict:"id"});
 if(error)return NextResponse.json({error:"Kunne ikke lagre påslagsinnstillingene."},{status:500});
 return NextResponse.json({minimumMaterialMarkup:record.minimum_material_markup,defaultMaterialMarkup:record.default_material_markup});
}
