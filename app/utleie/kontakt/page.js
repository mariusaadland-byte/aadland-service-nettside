import Link from "next/link";
import {CatalogHeader,CatalogFooter} from "../../produkter/ProductChrome";
import {COMPANY_INFO,RENTAL_CHANGE_DEADLINE_HOURS} from "../../../lib/companyInfo";
import RentalContactForm from "./RentalContactForm";
export const dynamic="force-dynamic";
export const metadata={title:"Kontakt og vanlige spørsmål",description:"Kontakt Aadland Utleie i Bergen. Spør om verktøy, booking, depositum, henting og tilbakelevering.",alternates:{canonical:"https://www.aadlandutleie.no/utleie/kontakt"},openGraph:{title:"Kontakt og vanlige spørsmål | Aadland Utleie",url:"https://www.aadlandutleie.no/utleie/kontakt",siteName:"Aadland Utleie",description:"Spør om verktøyutleie i Bergen.",images:["https://www.aadlandutleie.no/aadland-utleie-logo.png"]}};
const faq=[
 ["Hvordan bestiller jeg?","Åpne ønsket produkt, velg leieperioden i kalenderen og fyll inn kontaktopplysninger. Se leiepris og godta vilkårene før du sender booking."],
 ["Hvordan betaler jeg?","Følg betalingsinformasjonen i bookingen. Vipps tilbys når utleiebetalingen er aktivert. Godkjente bedriftskunder kan ha særskilt fakturaavtale."],
 ["Må jeg betale depositum?","Eventuelt depositum vises på produktet og før booking. Det håndteres separat fra leiebeløpet."],
 ["Hvor henter jeg utstyret?","Henting eller levering velges der det tilbys. Følg avtalen om sted og tidspunkt; ikke møt opp uten avtale."],
 ["Kan jeg endre eller avbestille?","En forespørsel kan trekkes før bekreftelse. Etter bekreftelse kan du endre eller avbestille kostnadsfritt frem til "+RENTAL_CHANGE_DEADLINE_HOURS+" timer før avtalt leiestart. Se vilkårene og kontakt oss også dersom fristen er passert."],
 ["Kan jeg forlenge leien?","Kontakt oss før returdatoen. Forlengelse krever ny avtale og tilgjengelighet; opprinnelig returdato gjelder inntil den nye avtalen er bekreftet."],
 ["Hva hvis utstyret blir skadet?","Stans bruk hvis utstyret er utrygt, og kontakt oss så snart som mulig. Ikke reparer eller endre utstyret uten avtale."],
 ["Hvor finner jeg bookingen?","Logg inn på Min side med e-postadressen som er knyttet til bookingen, eller kontakt oss med bookingnummeret."]
];
export default function RentalContact(){
 const enabled=process.env.VERCEL_ENV==="production"&&process.env.RENTAL_CONTACT_ENABLED==="true";
 return <main className="catalogPage rentalPage"><CatalogHeader rental/><section className="catalogWrap rentalContactPage">
  <span className="catalogEyebrow">AADLAND UTLEIE</span><h1>Kontakt og vanlige spørsmål</h1><p>Spør oss om utstyr, tilgjengelighet eller en eksisterende booking.</p>
  <div className="rentalContactGrid"><section className="rentalContactForm"><h2>Kontakt oss direkte</h2><p><a className="catalogGoldButton" href={COMPANY_INFO.phoneHref}>Ring {COMPANY_INFO.phone}</a></p><p><a href={COMPANY_INFO.emailHref}>{COMPANY_INFO.email}</a></p><p>Henting og retur etter avtale.</p><p><Link href="/min-side">Mine bookinger</Link></p><p>Aadland Utleie er en del av {COMPANY_INFO.name} · org.nr. {COMPANY_INFO.orgNumber}.</p></section>
  {enabled?<RentalContactForm/>:<section className="rentalContactForm"><h2>Send oss en e-post</h2><p>Kontaktskjemaet er foreløpig ikke aktivert. Bruk e-post eller telefon.</p><a className="catalogGoldButton" href={COMPANY_INFO.emailHref+"?subject="+encodeURIComponent("Henvendelse – Aadland Utleie")}>Åpne e-post</a></section>}</div>
  <section className="rentalFaq"><h2>Ofte stilte spørsmål</h2>{faq.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}<p><Link href="/vilkar/utleie">Les fullstendige utleiebetingelser</Link></p></section>
 </section><CatalogFooter rental/></main>;
}
