import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../lib/auth";
import {searchBrregCompanies} from "../../../../lib/brregCompanyLookup";
export const runtime="nodejs";
export const maxDuration=15;
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(req){
 const user=await getAdminUser();
 if(!user||!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))
  return json({error:"Du har ikke tilgang til firmasøk."},403);
 const q=new URL(req.url).searchParams.get("q")||"";
 try{
  const companies=await searchBrregCompanies(q);
  return json({companies,source:"Brønnøysundregistrene",contactInformationIncluded:false});
 }catch(e){
  return json({error:e.message||"Kunne ikke hente selskapsopplysninger."},
   /minst tre tegn/.test(e.message||"")?400:503);
 }
}
