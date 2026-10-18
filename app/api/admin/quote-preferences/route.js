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
 const value=Number(body.minimumMaterialMarkup);
 if(!Number.isFinite(value)||value<0||value>1000)return NextResponse.json({error:"Grensen må være mellom 0 og 1000 %."},{status:400});
 const defaultValue=body.defaultMaterialMarkup===undefined?null:Number(body.defaultMaterialMarkup);
 if(defaultValue!==null&&(!Number.isFinite(defaultValue)||defaultValue<0||defaultValue>1000))return NextResponse.json({error:"Standardpåslag må være mellom 0 og 1000 %."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const record={id:"main",minimum_material_markup:value,updated_at:new Date().toISOString()};
 if(defaultValue!==null)record.default_material_markup=defaultValue;
 const {error}=await s.from("quote_admin_preferences").upsert(record);
 if(error)return NextResponse.json({error:"Kunne ikke lagre påslagsgrensen."},{status:500});
 return NextResponse.json({minimumMaterialMarkup:value,defaultMaterialMarkup:defaultValue});
}
