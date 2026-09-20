import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

export async function POST(req){
 try{
  const {token,password}=await req.json();
  if(!token||String(password||"").length<8)return NextResponse.json({error:"Ugyldig lenke eller passord."},{status:400});
  const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.auth.getUser(token);
  if(error||!data.user)return NextResponse.json({error:"Lenken er ugyldig eller utløpt."},{status:401});
  const {error:updateError}=await supabase.auth.admin.updateUserById(data.user.id,{password:String(password)});
  if(updateError)return NextResponse.json({error:"Kunne ikke lagre nytt passord."},{status:500});
  return NextResponse.json({ok:true});
 }catch{
  return NextResponse.json({error:"Kunne ikke lagre nytt passord."},{status:500});
 }
}
