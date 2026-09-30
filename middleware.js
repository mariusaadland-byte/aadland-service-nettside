import {NextResponse} from "next/server";

const mutatingMethods=new Set(["POST","PUT","PATCH","DELETE"]);
const rentalHosts=new Set(["aadlandutleie.no","www.aadlandutleie.no"]);

export function middleware(req){
 const host=String(req.headers.get("host")||"").split(":")[0].toLowerCase();
 const pathname=req.nextUrl.pathname;

 if((req.method==="GET"||req.method==="HEAD")&&rentalHosts.has(host)){
  const url=req.nextUrl.clone();
  if(pathname==="/"){
   url.pathname="/utleie";
   return NextResponse.rewrite(url);
  }
  if(pathname==="/sitemap.xml"){
   url.pathname="/rental-sitemap.xml";
   return NextResponse.rewrite(url);
  }
  if(pathname==="/robots.txt"){
   url.pathname="/rental-robots.txt";
   return NextResponse.rewrite(url);
  }
 }

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
 matcher:["/","/sitemap.xml","/robots.txt","/api/admin/:path*"]
};
