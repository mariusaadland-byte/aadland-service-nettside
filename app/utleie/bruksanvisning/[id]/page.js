import Link from "next/link";
import {CatalogHeader,CatalogFooter} from "../../../produkter/ProductChrome";
import {db} from "../../../../lib/supabase";
import {rentalUnitId} from "../../../../lib/rentalUnitQr.mjs";
import {rentalManualUrl} from "../../../../lib/rentalManuals.mjs";
export const dynamic="force-dynamic";
export const metadata={title:"Bruksanvisning og sikkerhet",robots:{index:false,follow:false}};
export default async function ManualPage({params}){
 const {id}=await params;let item=null,manual=null;
 if(rentalUnitId(id)&&process.env.VERCEL_ENV==="production"&&process.env.RENTAL_MANUALS_ENABLED==="true"&&process.env.RENTAL_MANUALS_PUBLIC_ENABLED==="true"){
 const s=db();
 if(s){const a=await s.from("rental_items").select("id,name").eq("id",id).eq("active",true).neq("status","hidden").maybeSingle();
 if(!a.error&&a.data){const b=await s.from("rental_manual_versions").select("manufacturer,model,manual_url,language,safety_note,published,created_at").eq("rental_item_id",id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle();
 if(!b.error&&b.data?.published===true&&rentalManualUrl(b.data.manual_url)){item=a.data;manual=b.data;}}}
 }
 return <main className="catalogPage rentalPage"><CatalogHeader rental/><section className="catalogWrap" style={{padding:"32px 16px 60px",maxWidth:820}}><h1>Bruksanvisning og sikkerhet</h1>{manual?<><h2>{item.name}</h2><p>{manual.manufacturer} · {manual.model} · {manual.language}</p><p>Kontroller at modellbetegnelsen på maskinen stemmer. Les produsentens komplette bruksanvisning før bruk.</p><a className="catalogGoldButton" href={rentalManualUrl(manual.manual_url)} target="_blank" rel="noopener noreferrer">Åpne produsentens bruksanvisning</a>{manual.safety_note&&<><h2>Supplerende sikkerhetsinformasjon</h2><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{manual.safety_note}</p></>}<p>Informasjonen erstatter ikke bruksanvisningen eller nødvendig opplæring. Stans bruk ved feil, skade eller usikkerhet om riktig fremgangsmåte.</p></>:<p>Ingen kontrollert bruksanvisning er tilgjengelig her nå. Kontakt Aadland Utleie før bruk hvis du mangler nødvendig informasjon.</p>}<Link href="/utleie/kontakt">Kontakt Aadland Utleie</Link></section><CatalogFooter rental/></main>;
}
