import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {buildQuotePdf,quotePdfFilename} from "../../../../../lib/quotePdf";
import {loadQuoteDrawings} from "../../../../../lib/quoteDrawingLoader";

export const runtime="nodejs";

export async function GET(request){
 const user=await getAdminUser();
 if(!user||!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts)){
  return NextResponse.json({error:"Ingen tilgang."},{status:403});
 }
 const id=String(new URL(request.url).searchParams.get("id")||"").trim().slice(0,100);
 if(!/^[a-z0-9-]{8,100}$/i.test(id)){
  return NextResponse.json({error:"Ugyldig tilbuds-ID."},{status:400});
 }
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data:quote,error}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(error||!quote)return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});
 try{
  const drawings=await loadQuoteDrawings(s,quote);
  const pdf=await buildQuotePdf(quote,drawings);
  const filename=quotePdfFilename(quote);
  return new NextResponse(new Uint8Array(pdf),{
   status:200,
   headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":'attachment; filename="'+filename+'"',
    "Content-Length":String(pdf.length),
    "Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff"
   }
  });
 }catch(err){
  console.error("ADMIN QUOTE PDF ERROR",{quoteId:id,message:err?.message});
  return NextResponse.json({error:"PDF-filen kunne ikke genereres."},{status:500});
 }
}
