import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {db} from "../../../../../lib/supabase";
import {createQuoteToken,QUOTE_LINK_MAX_AGE_SECONDS} from "../../../../../lib/quoteLinks";
import {osloDateKey} from "../../../../../lib/osloTime";

export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(error,status=400)=>NextResponse.json({error},{status,headers:{"Cache-Control":"no-store"}});
const output=data=>NextResponse.json(data,{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
const validForReissue=q=>
 q?.status==="sent"&&Boolean(q.sent_at)&&!q.archived_at&&
 (!q.valid_until||String(q.valid_until).slice(0,10)>=osloDateKey(new Date()));

async function owner(){
 const user=await getAdminUser();
 return user?.role==="owner"?user:null;
}
export async function GET(req){
 if(!(await owner()))return fail("Bare eier kan administrere tilbudslenker.",403);
 const id=String(new URL(req.url).searchParams.get("id")||"");
 if(!UUID.test(id))return fail("Ugyldig tilbud.",400);
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const {data,error}=await s.from("quotes")
  .select("id,status,valid_until,sent_at,archived_at,quote_link_generation,quote_link_disabled_at")
  .eq("id",id).maybeSingle();
 if(error)return fail("Lenkestatus kunne ikke kontrolleres.",503);
 if(!data)return fail("Tilbudet ble ikke funnet.",404);
 return output({
  enabled:!data.quote_link_disabled_at,
  disabledAt:data.quote_link_disabled_at||null,
  generation:Number(data.quote_link_generation)||1,
  canReissue:validForReissue(data),
  maxLinkAgeDays:Math.round(QUOTE_LINK_MAX_AGE_SECONDS/(24*60*60))
 });
}

export async function POST(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 if(!(await owner()))return fail("Bare eier kan administrere tilbudslenker.",403);
 const body=await req.json().catch(()=>({}));
 const id=String(body.id||""),action=String(body.action||"");
 if(!UUID.test(id)||!["disable","rotate"].includes(action))return fail("Ugyldig lenkehandling.",400);
 if(action==="disable"&&body.confirmation!=="SPERR LENKE")return fail("Skriv SPERR LENKE for å bekrefte.",400);
 if(action==="rotate"&&body.confirmation!=="NY LENKE")return fail("Skriv NY LENKE for å bekrefte.",400);
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const {data:quote,error}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(error)return fail("Tilbudsstatus kunne ikke kontrolleres.",503);
 if(!quote)return fail("Tilbudet ble ikke funnet.",404);
 if(action==="rotate"&&!validForReissue(quote))
  return fail("Ny delingslenke kan bare lages for et aktivt, sendt tilbud. Bruk en ny revisjon for utløpte tilbud.",409);
 if(action==="disable"&&quote.quote_link_disabled_at)
  return output({ok:true,enabled:false,alreadyDisabled:true,disabledAt:quote.quote_link_disabled_at});
 const generation=Number(quote.quote_link_generation||1);
 if(!Number.isSafeInteger(generation)||generation<1||generation>=2147483647)
  return fail("Kan ikke opprette flere lenkeversjoner.",409);
 // Compare-and-swap guarantees that stale concurrent actions cannot restore
 // a previously revoked URL or return a link for the wrong generation.
 const now=new Date().toISOString();
 const updated=await s.from("quotes")
  .update({
   quote_link_generation:generation+1,
   quote_link_disabled_at:action==="disable"?now:null
  })
  .eq("id",id)
  .eq("quote_link_generation",generation)
  .select("id,quote_number,customer,status,valid_until,sent_at,archived_at,quote_link_generation,quote_link_disabled_at")
  .maybeSingle();
 if(updated.error)return fail("Lenken kunne ikke oppdateres.",503);
 if(!updated.data)return fail("Lenkestatus ble endret samtidig. Oppdater siden før du prøver på nytt.",409);
 if(action==="disable")
  return output({ok:true,enabled:false,disabledAt:now});
 const token=createQuoteToken(updated.data);
 const site=String(process.env.NEXT_PUBLIC_SITE_URL||"https://www.aadland-service.no").replace(/\/$/,"");
 if(!/^https:\/\//i.test(site))return fail("Sikker nettadresse mangler. Ikke del lenken.",503);
 const link=site+"/tilbud/"+encodeURIComponent(id)+"#token="+encodeURIComponent(token);
 return output({ok:true,enabled:true,link,createdAt:now,
  note:"Den gamle lenken er sperret. Kopier denne bare til riktig mottaker. Gyldighet er begrenset av 60 dager og tilbudets dato."});
}
