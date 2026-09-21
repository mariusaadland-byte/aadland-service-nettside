import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

export async function POST(req){
 try{
  const {email}=await req.json();
  const value=String(email||"").trim().toLowerCase();
  if(!value)return NextResponse.json({error:"Skriv inn e-postadressen din."},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return NextResponse.json({error:"Passordgjenoppretting er ikke konfigurert."},{status:503});const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const redirectTo=new URL("/admin/nytt-passord",req.url).toString();
  const {error}=await supabase.auth.resetPasswordForEmail(value,{redirectTo});
  if(error)return NextResponse.json({error:"Kunne ikke sende e-post akkurat nå."},{status:500});
  return NextResponse.json({ok:true});
 }catch{
  return NextResponse.json({error:"Kunne ikke sende e-post akkurat nå."},{status:500});
 }
}
