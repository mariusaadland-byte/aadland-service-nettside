import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

export async function POST(req){
 try{
  const {token,password}=await req.json();
  const nextPassword=String(password||"");
  if(!token||nextPassword.length<8||nextPassword.length>128)return NextResponse.json({error:"Ugyldig lenke eller passord. Passordet må være mellom 8 og 128 tegn."},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return NextResponse.json({error:"Passordendring er ikke konfigurert."},{status:503});const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.auth.getUser(token);
  if(error||!data.user)return NextResponse.json({error:"Lenken er ugyldig eller utløpt."},{status:401});
  const {error:updateError}=await supabase.auth.admin.updateUserById(data.user.id,{password:nextPassword});
  if(updateError)return NextResponse.json({error:"Kunne ikke lagre nytt passord."},{status:500});
  return NextResponse.json({ok:true});
 }catch{
  return NextResponse.json({error:"Kunne ikke lagre nytt passord."},{status:500});
 }
}
