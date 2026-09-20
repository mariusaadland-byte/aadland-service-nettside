import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

export async function POST(req){
 try{
  const {email}=await req.json();
  const value=String(email||"").trim().toLowerCase();
  if(!value)return NextResponse.json({error:"Skriv inn e-postadressen din."},{status:400});
  const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const redirectTo=new URL("/admin/nytt-passord",req.url).toString();
  const {error}=await supabase.auth.resetPasswordForEmail(value,{redirectTo});
  if(error)return NextResponse.json({error:"Kunne ikke sende e-post akkurat nå."},{status:500});
  return NextResponse.json({ok:true});
 }catch{
  return NextResponse.json({error:"Kunne ikke sende e-post akkurat nå."},{status:500});
 }
}
