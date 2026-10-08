import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {buildDrawingReportPdf} from "../../../../../lib/drawingReportPdf";
export const runtime="nodejs";

export async function POST(request){
 const guard=sameOriginGuard(request);if(guard)return guard;
 const user=await getAdminUser();
 if(!user||!(user.role==="owner"||user.canManageProducts||user.canViewOrders)){
  return NextResponse.json({error:"Ingen tilgang."},{status:403});
 }
 const raw=await request.text().catch(()=>"");
 if(!raw||raw.length>2_000_000)return NextResponse.json({error:"Tegningen er for stor for PDF-generering."},{status:413});
 let doc;
 try{doc=JSON.parse(raw).drawingData}catch{return NextResponse.json({error:"Ugyldig tegning."},{status:400})}
 if(!doc||!Array.isArray(doc.walls)||!Array.isArray(doc.items)||doc.walls.length>40||doc.items.length>600){
  return NextResponse.json({error:"Tegningen er ugyldig eller inneholder for mange elementer."},{status:400});
 }
 try{
  const pdf=buildDrawingReportPdf(doc);
  const filename="Tegning-"+String(doc.name||"prosjekt").replace(/[^a-z0-9_-]+/gi,"-").slice(0,70)+".pdf";
  return new NextResponse(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="'+filename+'"',"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"}});
 }catch(error){
  console.error("DRAWING PDF REPORT",error);
  return NextResponse.json({error:"PDF-rapport kunne ikke lages: "+String(error?.message||"ukjent feil").slice(0,150)},{status:500});
 }
}
