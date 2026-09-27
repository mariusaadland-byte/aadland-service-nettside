import "server-only";
import {NextResponse} from "next/server";

export function cronGuard(req){
 const secret=String(process.env.CRON_SECRET||"").trim();
 if(!secret){
  console.error("CRON_SECRET is not configured.");
  return NextResponse.json({error:"Cron er ikke konfigurert."},{status:503});
 }
 const authorization=String(req.headers.get("authorization")||"");
 if(authorization!==("Bearer "+secret)){
  return NextResponse.json({error:"Ingen tilgang."},{status:401});
 }
 return null;
}
