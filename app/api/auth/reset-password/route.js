import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

export async function POST(req){
 try{
  const {email}=await req.json();
  const value=String(email||"").trim().toLowerCase();
  if(!value)return NextResponse.json({error:"Skriv inn e-postadressen din."},{status:400});
  if(value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return NextResponse.json({error:"Passordgjenoppretting er ikke konfigurert."},{status:503});const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const redirectTo=new URL("/admin/nytt-passord",req.url).toString();
  await supabase.auth.resetPasswordForEmail(value,{redirectTo});
  return NextResponse.json({ok:true,message:"Hvis e-postadressen er registrert, sender vi en lenke for å velge nytt passord."});
 }catch(e){console.error("ADMIN PASSWORD RESET",e);
  return NextResponse.json({ok:true,message:"Hvis e-postadressen er registrert, sender vi en lenke for å velge nytt passord."});
 }
}
