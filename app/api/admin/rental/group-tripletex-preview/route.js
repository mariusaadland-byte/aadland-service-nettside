import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {db} from "../../../../../lib/supabase";
import {ownerGroupArchive,groupArchiveEnabled} from "../../../../../lib/groupOrderArchive";
import {storedTripletexConnection,unprotectTripletexToken} from "../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead} from "../../../../../lib/tripletexApi";
import {rentalCustomerMatch,rentalTripletexPreview} from "../../../../../lib/rentalTripletexPreview.mjs";
import {rentalUnitId} from "../../../../../lib/rentalUnitQr.mjs";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!groupArchiveEnabled()||process.env.AADLAND_GROUP_TRIPLETEX_PREVIEW_ENABLED!=="true")return reply({status:"disabled"},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({status:"forbidden"},403);
 const limited=await rateLimitValue(user.id,{scope:"group-tripletex-preview",max:5,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const len=Number(req.headers.get("content-length"));if(!Number.isFinite(len)||len<=0||len>4096)return reply({status:"invalid"},400);
 try{
 const body=await req.json();if(!rentalUnitId(body?.groupId))return reply({status:"invalid"},400);
 const s=db();if(!s)return reply({status:"unconfirmed"},503);
 const data=await ownerGroupArchive(body.groupId);if(!data?.signed||!data.invoice)return reply({status:"review"},409);
 const val=r=>{if(r.error)throw Error("PREVIEW");return r.data;};
 const group=val(await s.from("rental_order_groups").select("id,customer_user_id").eq("id",body.groupId).single());
 const [profile,auth,link,prior,connection]=await Promise.all([
 s.from("customer_profiles").select("id,name,email").eq("id",group.customer_user_id).single(),
 s.auth.admin.getUserById(group.customer_user_id),
 s.from("tripletex_customer_links").select("status,tripletex_customer_id").eq("source_type","profile").eq("source_id",group.customer_user_id).eq("environment","production").maybeSingle(),
 s.from("rental_group_tripletex_transfers").select("state,remote_invoice_id").eq("group_id",group.id).maybeSingle(),
 storedTripletexConnection(s)]);
 const p=val(profile),account=auth.data?.user,existing=val(link),transfer=val(prior);
 if(auth.error||account?.id!==group.customer_user_id||!account.email_confirmed_at||typeof account.email!=="string"||p.email?.trim().toLowerCase()!==account.email.trim().toLowerCase()||!p.name?.trim())return reply({status:"review"},409);
 const agreement=val(await s.from("aadland_agreements").select("id,signing_email").eq("id",data.agreementId).eq("group_id",group.id).single());
 if(agreement.signing_email!==account.email.trim().toLowerCase())return reply({status:"review"},409);
 if(!connection||connection.environment!=="production")return reply({status:"disabled"},503);
 const session=await tripletexOpenSession(unprotectTripletexToken(connection),"production");
 const [customers,vat]=await Promise.all([tripletexRead("/customer?email="+encodeURIComponent(account.email.trim().toLowerCase())+"&count=100",session,"production"),tripletexRead("/ledger/vatType?count=100",session,"production")]);
 if(!Array.isArray(customers.values)||!Array.isArray(vat.values)||customers.values.length>=100||vat.values.length>=100||Number.isInteger(customers.fullResultSize)&&customers.fullResultSize!==customers.values.length||Number.isInteger(vat.fullResultSize)&&vat.fullResultSize!==vat.values.length)return reply({status:"review"},409);
 const preview=rentalTripletexPreview({groupId:group.id,invoice:data.invoice,customerMatch:rentalCustomerMatch({name:p.name,email:account.email},customers.values,existing),vatTypes:vat.values,prior:transfer});
 return preview?reply({status:"preview",...preview}):reply({status:"review"},409);
 }catch{return reply({status:"unconfirmed"},503);}
}
