import {NextResponse} from "next/server";

export function sameOriginGuard(req){
 const requestOrigin=new URL(req.url).origin;
 const supplied=String(req.headers.get("origin")||"").trim();
 if(!supplied){
  return NextResponse.json({error:"Ugyldig forespørsel."},{status:403});
 }

 let origin;
 try{
  origin=new URL(supplied).origin;
 }catch{
  return NextResponse.json({error:"Ugyldig forespørsel."},{status:403});
 }

 if(origin===requestOrigin)return null;

 const configured=String(process.env.NEXT_PUBLIC_SITE_URL||"").trim();
 if(configured){
  try{
   if(origin===new URL(configured).origin)return null;
  }catch{}
 }

 return NextResponse.json({error:"Ugyldig forespørsel."},{status:403});
}
