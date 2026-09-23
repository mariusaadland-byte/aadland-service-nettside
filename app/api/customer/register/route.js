import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export async function POST(req){try{
 const b=await req.json(),email=String(b.email||"").trim().toLowerCase(),name=String(b.name||"").trim(),phone=String(b.phone||"").trim(),password=String(b.password||"");
 if(name.length>120||email.length>254||phone.length>40||String(b.address||"").trim().length>300)return NextResponse.json({error:"Kontaktinformasjonen er for lang."},{status:400});
 if(!name||!email||password.length<8||password.length>128)return NextResponse.json({error:"Fyll inn navn og e-post. Passordet må ha minst 8 tegn."},{status:400});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return NextResponse.json({error:"Kundekonto er ikke konfigurert."},{status:503});
 const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await s.auth.signUp({email,password,options:{data:{customer:true,name:name.slice(0,120)}}});
 if(error||!data.user)return NextResponse.json({error:"Kunne ikke opprette konto. E-postadressen kan allerede være registrert."},{status:400});
 const profile={id:data.user.id,email,name:name.slice(0,120),phone:phone.slice(0,40),address:String(b.address||"").trim().slice(0,300)};
 const {error:profileError}=await s.from("customer_profiles").upsert(profile,{onConflict:"id"});
 if(profileError){
  if(["42P01","42703"].includes(String(profileError.code||"")))return NextResponse.json({error:"Kundekonto er ikke aktivert i databasen ennå.",setupRequired:true},{status:409});
  console.error("CUSTOMER REGISTER PROFILE",profileError);
  // Behold auth-brukeren. Innloggingen kan reparere en manglende profil etter e-postbekreftelse.
 }
 return NextResponse.json({ok:true,verificationRequired:true,message:"Kontoen er opprettet. Bekreft e-postadressen før du logger inn."});
}catch(e){console.error("CUSTOMER REGISTER",e);return NextResponse.json({error:"Kunne ikke opprette konto."},{status:500})}}