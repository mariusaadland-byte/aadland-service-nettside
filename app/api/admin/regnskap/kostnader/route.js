import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {costHistoryEnabled} from "../../../../../lib/costAllocationConfig";
import {costHistoryInput,costHistoryRows} from "../../../../../lib/purchaseCostHistory.mjs";
export const dynamic="force-dynamic";
const reply=(b,status=200)=>NextResponse.json(b,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(req){
 const user=await getAdminUser();if(user?.role!=="owner")return reply({status:"forbidden"},403);
 if(!costHistoryEnabled())return reply({status:"disabled"});
 const raw=new URL(req.url).searchParams.get("year"),year=Number(raw);
 if(!/^\d{4}$/.test(raw||"")||year<2000||year>2100)return reply({status:"invalid"},400);
 const s=db();if(!s)return reply({status:"unconfirmed"},503);
 try{
 const r=await s.from("vat_purchase_cost_effective").select("id,document_date,supplier_name,supplier_document_number,kind,base_ore,vat_ore,voided_at,cost_unit,cost_revision",{count:"exact"}).is("voided_at",null).gte("document_date",raw+"-01-01").lte("document_date",raw+"-12-31").order("document_date",{ascending:false}).order("id").limit(501);
 if(r.error||!Array.isArray(r.data)||r.count!==r.data.length)return reply({status:"unconfirmed"},503);
 const rows=costHistoryRows(r.data,year);return rows?reply({status:"ok",rows}):reply({status:"review"},409);
 }catch{return reply({status:"unconfirmed"},503);}
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({status:"forbidden"},403);
 if(!costHistoryEnabled())return reply({status:"disabled"},503);
 const limited=await rateLimitValue(user.id,{scope:"purchase-cost-history",max:60,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const len=Number(req.headers.get("content-length"));if(!Number.isFinite(len)||len<=0||len>4096)return reply({status:"invalid"},400);
 try{
 const b=costHistoryInput(await req.json());if(!b)return reply({status:"invalid"},400);
 const s=db();if(!s)return reply({status:"unconfirmed"},503);
 const r=await s.rpc("draft_purchase_cost_classify",{p_id:b.id,p_expected:b.expectedRevision,p_unit:b.unit,p_reason:b.reason,p_actor:user.id,p_request:b.requestId});
 return r.error?reply({status:"unconfirmed"},503):["recorded","existing"].includes(r.data)?reply({status:r.data}):reply({status:"review"},409);
 }catch{return reply({status:"unconfirmed"},503);}
}
