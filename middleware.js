import {NextResponse} from "next/server";

const mutatingMethods=new Set(["POST","PUT","PATCH","DELETE"]);

export function middleware(req){
 if(!mutatingMethods.has(req.method))return NextResponse.next();

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

 const requestOrigin=req.nextUrl.origin;
 if(origin===requestOrigin)return NextResponse.next();

 const configured=String(process.env.NEXT_PUBLIC_SITE_URL||"").trim();
 if(configured){
  try{
   if(origin===new URL(configured).origin)return NextResponse.next();
  }catch{}
 }

 return NextResponse.json({error:"Ugyldig forespørsel."},{status:403});
}

export const config={
 matcher:["/api/admin/:path*"]
};
