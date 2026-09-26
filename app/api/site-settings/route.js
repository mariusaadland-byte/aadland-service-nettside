import {NextResponse} from "next/server";
import {db} from "../../../lib/supabase";
import {safeSiteHref} from "../../../lib/safeUrl";
import {safeEmail,safePhone} from "../../../lib/contactValues";

export const DEFAULT_SITE_SETTINGS={
 heroEyebrow:"BYGG · RENOVERING · UTEOMRÅDER · VEDLIKEHOLD",
 heroTitle:"Kvalitet som varer.",
 seasonalTitle:"",seasonalText:"",seasonalCtaLabel:"",seasonalCtaHref:"",seasonalFrom:null,seasonalUntil:null,showSeasonal:false,
 heroText:"Aadland Service leverer solide løsninger innen bygg, oppussing, vedlikehold og uteområder. Vi kombinerer fagkunnskap, nøyaktighet og god oppfølging – tilpasset dine behov.",
 aboutTitle:"Lokalt håndverk med stolthet.",
 aboutText:"Vi hjelper med oppussing, vedlikehold, uteområder og spesialtilpassede løsninger. Målet er enkelt: ryddig kommunikasjon, praktiske valg og et resultat du kan være fornøyd med.",
 phone:"471 54 898",email:"post@aadland-service.no",orgNumber:"937 781 873 MVA",location:"Bergen og omegn",
 showServices:true,showProjects:true,showAbout:true,showSurvey:true
};
function map(row){return {...DEFAULT_SITE_SETTINGS,heroEyebrow:row.hero_eyebrow??DEFAULT_SITE_SETTINGS.heroEyebrow,heroTitle:row.hero_title??DEFAULT_SITE_SETTINGS.heroTitle,heroText:row.hero_text??DEFAULT_SITE_SETTINGS.heroText,aboutTitle:row.about_title??DEFAULT_SITE_SETTINGS.aboutTitle,aboutText:row.about_text??DEFAULT_SITE_SETTINGS.aboutText,phone:safePhone(row.phone)||DEFAULT_SITE_SETTINGS.phone,email:safeEmail(row.email)||DEFAULT_SITE_SETTINGS.email,orgNumber:row.org_number??DEFAULT_SITE_SETTINGS.orgNumber,location:row.location??DEFAULT_SITE_SETTINGS.location,seasonalTitle:row.seasonal_title||"",seasonalText:row.seasonal_text||"",seasonalCtaLabel:row.seasonal_cta_label||"",seasonalCtaHref:safeSiteHref(row.seasonal_cta_href||""),seasonalFrom:row.seasonal_from||null,seasonalUntil:row.seasonal_until||null,showSeasonal:row.show_seasonal===true,showServices:row.show_services!==false,showProjects:row.show_projects!==false,showAbout:row.show_about!==false,showSurvey:row.show_survey!==false};}
export async function GET(){const s=db();if(!s)return NextResponse.json({settings:DEFAULT_SITE_SETTINGS,degraded:true},{status:503});const {data,error}=await s.from("site_settings").select("*").eq("id","main").maybeSingle();if(error){console.error("SITE SETTINGS GET ERROR:",error);return NextResponse.json({settings:DEFAULT_SITE_SETTINGS,degraded:true},{status:503})}if(!data)return NextResponse.json({settings:DEFAULT_SITE_SETTINGS});return NextResponse.json({settings:map(data)});}
