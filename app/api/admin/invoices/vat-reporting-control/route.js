import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {validateVatReportingProfile,validateVatReportingStatus,vatPeriodKey} from "../../../../../lib/vatReportingControl";
export const runtime="nodejs";
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const currentDay=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan se oppfølgingsstatus for MVA."},403);
 const url=new URL(req.url),year=Number(url.searchParams.get("year"));
 if(!vatPeriodKey(year,1))return json({error:"Velg gyldig år."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 const [profile,terms,suggestion]=await Promise.all([
  s.from("vat_reporting_profile").select("registration_date,first_term_year,first_term,updated_at").eq("id","primary").maybeSingle(),
  s.from("vat_reporting_term_status").select("year,term,status,filed_on,submission_reference,notes,updated_at").eq("year",year).order("term",{ascending:true}),
  s.from("vat_registration_public_hint").select("observed_date,source_name,source_url,source_note,confirmed_effective_date").eq("id","primary").maybeSingle()
 ]);
 if(profile.error||terms.error||suggestion.error||!Array.isArray(terms.data))
  return json({error:"Kunne ikke hente komplett MVA-oppfølgingsstatus."},503);
 return json({profile:profile.data||null,terms:terms.data,suggestion:suggestion.data||null,verifiedWithSkatteetaten:false});
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan oppdatere MVA-oppfølging."},403);
 if(process.env.VERCEL_ENV==="preview")return json({error:"MVA-status lagres bare på produksjonssiden."},403);
 const body=await req.json().catch(()=>({}));
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 if(body.action==="registration"){
  let settings;
  try{settings=validateVatReportingProfile(body,currentDay());}catch(e){return json({error:e.message},400);}
  const {data,error}=await s.from("vat_reporting_profile").upsert({
   ...settings,confirmed_by:user.id,updated_at:new Date().toISOString()
  },{onConflict:"id"}).select("registration_date,first_term_year,first_term,updated_at").single();
  if(error||!data)return json({error:"Kunne ikke lagre MVA-registreringsdatoen."},503);
  return json({ok:true,profile:data,verifiedWithSkatteetaten:false});
 }
 if(body.action==="status"){
  let entry;
  try{entry=validateVatReportingStatus(body,currentDay());}catch(e){return json({error:e.message},400);}
  const {data,error}=await s.from("vat_reporting_term_status").upsert({
   ...entry,confirmed_by:user.id,updated_at:new Date().toISOString()
  },{onConflict:"year,term"}).select("year,term,status,filed_on,submission_reference,notes,updated_at").single();
  if(error||!data)return json({error:"Kunne ikke lagre terminstatus."},503);
  return json({ok:true,term:data,verifiedWithSkatteetaten:false});
 }
 return json({error:"Ukjent handling."},400);
}
