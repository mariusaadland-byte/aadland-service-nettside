import {COMPANY_ADDRESS,COMPANY_INFO,RENTAL_CHANGE_DEADLINE_HOURS} from "../../../lib/companyInfo";

export const metadata={
 title:{absolute:"Utleiebetingelser | Aadland Utleie"},
 description:"Utleiebetingelser for leie av utstyr fra Aadland Utleie, en del av Aadland Service.",
 alternates:{canonical:"https://www.aadlandutleie.no/vilkar/utleie"}
};

export default function RentalTerms(){
 return <main className="legalPage"><div className="legalWrap">
  <a href="/utleie">← Tilbake til utleie</a>
  <div className="kicker">AADLAND UTLEIE</div>
  <h1>Utleiebetingelser</h1>
  <p className="legalLead">Disse betingelsene gjelder ved leie av utstyr fra Aadland Utleie, utleiedelen av Aadland Service, til privatkunder. Vilkårene skal leses og godtas før booking og før eventuell elektronisk betaling startes.</p>

  <h2>1. Partene og kontaktinformasjon</h2>
  <p><b>Utleier:</b> {COMPANY_INFO.name}, org.nr. {COMPANY_INFO.orgNumber}.<br/>
  <b>Adresse:</b> {COMPANY_ADDRESS}.<br/>
  <b>Telefon:</b> {COMPANY_INFO.phone}.<br/>
  <b>E-post:</b> {COMPANY_INFO.email}.</p>

  <h2>2. Leieperiode, pris og betaling</h2>
  <p>Leieperioden følger datoene i bookingen. Samlet leiepris, eventuelt depositum og valgt henting eller levering vises før kunden sender bookingforespørselen. Dersom elektronisk betaling tilbys, skal kunden godta gjeldende vilkår før betalingen initieres. Betaling håndteres etter betalingsinformasjonen som vises for bookingen.</p>

  <h2>3. Booking, bekreftelse og inngåelse av leieforholdet</h2>
  <p>En innsendt bookingforespørsel er ikke endelig bekreftet før Aadland Utleie har bekreftet tilgjengelighet og avtalen. Kunden mottar bekreftelse på oppgitt e-postadresse. Leieforholdet gjelder for perioden og utstyret som fremgår av den bekreftede bookingen.</p>

  <h2>4. Endring, ombooking og avbestilling</h2>
  <p>En bookingforespørsel kan trekkes eller endres før den er bekreftet. Etter bekreftelse kan kunden endre, ombooke eller avbestille kostnadsfritt frem til <b>{RENTAL_CHANGE_DEADLINE_HOURS} timer før avtalt leiestart</b>. Endring eller avbestilling gjøres ved å kontakte Aadland Utleie på {COMPANY_INFO.email} eller {COMPANY_INFO.phone}. Etter fristen må kunden kontakte Aadland Utleie så raskt som mulig; eventuell betaling eller kostnad vurderes ut fra hva som faktisk er avtalt og levert, samt ufravikelige forbrukerrettigheter.</p>

  <h2>5. Avslutning av leieforholdet</h2>
  <p>Leieforholdet avsluttes når utstyret er levert tilbake eller hentet etter avtale, og eventuelt oppgjør for leie, depositum, skade eller manglende deler er ferdig behandlet. Kunden skal levere tilbake utstyret senest til avtalt tid.</p>

  <h2>6. Utlevering og tilbakelevering</h2>
  <p>Utstyret skal leveres tilbake til avtalt tid og i samme stand som ved utlevering, med unntak av normal slitasje. Forsinket retur kan medføre ekstra leie dersom dette er avtalt og lovlig.</p>

  <h2>7. Bruk og ansvar</h2>
  <p>Leietaker skal bruke utstyret forsvarlig, følge bruksanvisning og nødvendige sikkerhetskrav og hindre at uvedkommende bruker utstyret. Leietaker kan bli ansvarlig for tap og skade som skyldes feil eller uforsvarlig bruk.</p>

  <h2>8. Skade, feil, mangler og reklamasjon</h2>
  <p>Feil, skade eller manglende deler skal meldes til Aadland Utleie så snart som mulig. Utstyret skal ikke repareres eller endres uten avtale. Reklamasjon sendes til {COMPANY_INFO.email} med bookingnummer og en beskrivelse av problemet. Kundens ufravikelige rettigheter etter norsk forbrukerlovgivning begrenses ikke av disse vilkårene.</p>

  <h2>9. Rengjøring og drivstoff</h2>
  <p>Utstyr skal returneres rengjort og, der det er relevant, med avtalt drivstoffnivå. Nødvendig ekstra rengjøring eller påfyll kan belastes leietaker når dette er opplyst for utstyret og kostnaden er saklig.</p>

  <h2>10. Angrerett ved fjernsalg</h2>
  <p>Ved avtaler inngått ved fjernsalg gjelder angrerettloven der den kommer til anvendelse. For tjenester er angrefristen normalt 14 dager fra dagen etter at avtalen ble inngått, forutsatt at kunden har mottatt lovpålagt informasjon. Dersom kunden uttrykkelig ber om at tjenesten starter før angrefristen er utløpt, kan kunden ved bruk av angreretten måtte betale et forholdsmessig beløp for det som allerede er levert. Den separate {RENTAL_CHANGE_DEADLINE_HOURS}-timersregelen ovenfor gjelder i tillegg der den er gunstigere for kunden.</p>
  <p>Standard angreskjema finnes hos <a href="https://www.regjeringen.no/no/dokument/dep/bld/skjema/skjema-2/skjema-om-angrerett/id614564/" target="_blank" rel="noreferrer">Barne- og familiedepartementet</a>. Kunden kan også gi en tydelig skriftlig melding om at angreretten ønskes brukt.</p>

  <h2>11. Dersom utstyret blir utilgjengelig</h2>
  <p>Dersom utstyret blir utilgjengelig på grunn av skade, service eller andre forhold før leiestart, kontakter Aadland Utleie kunden for ny avtale, ombooking eller tilbakebetaling av innbetalt beløp.</p>

  <h2>12. Konfliktløsning</h2>
  <p>Ved uenighet ber vi kunden først kontakte Aadland Utleie, slik at saken kan forsøkes løst direkte. Dersom partene ikke kommer til enighet, kan en forbruker be Forbrukertilsynet om mekling. Saker som fyller vilkårene kan deretter behandles av Forbrukerklageutvalget.</p>

  <h2>13. Henting og levering</h2>
  <p>Henting og levering avtales i bestillingen. Kunden er ansvarlig for at oppgitt adresse og kontaktinformasjon er korrekt.</p>

  <h2>14. Kontakt</h2>
  <p>{COMPANY_INFO.name} · org.nr. {COMPANY_INFO.orgNumber}<br/>{COMPANY_ADDRESS}<br/>{COMPANY_INFO.email} · {COMPANY_INFO.phone}</p>

  <p className="muted">Versjon 2026-10. Bookingen lagrer hvilken versjon som ble godtatt.</p>
 </div></main>
}
