import {COMPANY_ADDRESS,COMPANY_INFO} from "../../lib/companyInfo";

export const metadata={
 title:"Personvern",
 description:"Hvordan Aadland Service behandler personopplysninger ved henvendelser, bestillinger, betalinger og kundekonto.",
 alternates:{canonical:"/personvern"}
};

export default function Personvern(){
 return <main className="legalPage"><div className="legalWrap">
  <a href="/">← Tilbake til Aadland Service</a>
  <div className="kicker">AADLAND SERVICE</div>
  <h1>Personvernerklæring</h1>
  <p className="legalLead">Her forklarer vi hvilke personopplysninger vi kan behandle når du besøker nettstedet, kontakter oss, får tilbud, bestiller varer eller tjenester, betaler eller bruker Min side.</p>
  <p className="muted">Sist oppdatert: 26. november 2026.</p>

  <h2>1. Hvem er ansvarlig?</h2>
  <p><strong>{COMPANY_INFO.name}</strong> er behandlingsansvarlig for opplysninger som virksomheten samler inn og bruker til sine tjenester, også utleiedelen Aadland Utleie.</p>
  <p>Organisasjonsnummer: {COMPANY_INFO.orgNumber}. Adresse: {COMPANY_ADDRESS}. Telefon: <a href={COMPANY_INFO.phoneHref}>{COMPANY_INFO.phone}</a>. E-post: <a href={COMPANY_INFO.emailHref}>{COMPANY_INFO.email}</a>.</p>

  <h2>2. Hvilke opplysninger behandler vi?</h2>
  <ul>
   <li><strong>Henvendelser og befaringer:</strong> navn, e-postadresse, telefon, eventuell adresse, beskrivelse av oppdraget og bilder eller dokumenter du sender oss.</li>
   <li><strong>Kunder, tilbud og bestillinger:</strong> kontaktinformasjon, produkter/tjenester, avtaler, tegninger som deles med deg, ordre- og tilbudshistorikk, levering og relevant korrespondanse.</li>
   <li><strong>Utleie:</strong> leieperiode, bookingnummer, utstyr, godkjente utleiebetingelser, registrert utlevering/retur, depositumstatus og relevante kontrollnotater og korrespondanse.</li>
   <li><strong>Faktura og betaling:</strong> fakturaopplysninger, beløp, forfallsdatoer, betalingsstatus, transaksjonsreferanser, kvitteringer og nødvendig regnskapsdokumentasjon.</li>
   <li><strong>Min side:</strong> kontoinformasjon, e-postbekreftelse, innloggings- og sikkerhetsopplysninger samt historikk som knyttes til kontoen din.</li>
   <li><strong>Teknisk bruk:</strong> nødvendige sesjonsopplysninger og tekniske data som kan inngå i drift, sikkerhet og feilsøking, for eksempel tidspunkt for forespørsler og nettverksopplysninger.</li>
  </ul>
  <p>Opplysninger kommer hovedsakelig fra det du oppgir til oss, eller fra kontakt og avtaler med virksomheten. Vi ber deg unngå å sende sensitive opplysninger som ikke er nødvendige for oppdraget.</p>

  <h2>3. Formål og behandlingsgrunnlag</h2>
  <ul>
   <li><strong>Svare på henvendelser, avtale befaring og gi tilbud:</strong> for å gjennomføre tiltak på din forespørsel før en eventuell avtale (personvernforordningen artikkel 6 nr. 1 bokstav b), eller ut fra en berettiget interesse i å besvare henvendelser som ikke gjelder en konkret avtale (bokstav f).</li>
   <li><strong>Gjennomføre bestillinger, oppdrag, levering, betaling og nødvendig kundekommunikasjon:</strong> for å oppfylle en avtale (bokstav b).</li>
   <li><strong>Utleiekontroll og oppfølging:</strong> for å gjennomføre leieavtalen (bokstav b) og, ved behov, ivareta berettiget interesse i å dokumentere og avklare krav (bokstav f). Eventuell tilstandsfotografering av utstyr skal være relevant og begrenset til nødvendig dokumentasjon. Unngå ansikter, legitimasjon og andre unødvendige personopplysninger.</li>
   <li><strong>Fakturering, bokføring og lovpålagt dokumentasjon:</strong> for å oppfylle rettslige forpliktelser (bokstav c).</li>
   <li><strong>Sikkerhet, feilsøking og forebygging av misbruk:</strong> ut fra vår berettigede interesse i å beskytte nettstedet, virksomheten og kundene (bokstav f).</li>
  </ul>
  <p>Vi bruker ikke kontaktopplysningene til nyhetsbrev eller annen direkte markedsføring bare fordi du har bedt om et tilbud eller kjøpt noe. Eventuell markedsføring krever et eget gyldig grunnlag.</p>

  <h2>4. Opplysninger som deles med tjenesteleverandører</h2>
  <p>Vi benytter eksterne leverandører der det er nødvendig for drift og leveranse. Hvilke opplysninger som deles, avhenger av hvilke funksjoner som brukes.</p>
  <ul>
   <li><strong>Supabase:</strong> database, innlogging og lagring av opplysninger og vedlegg.</li>
   <li><strong>Vercel:</strong> drift av nettstedet og teknisk håndtering av forespørsler.</li>
   <li><strong>Resend:</strong> utsending av nødvendige e-poster som bekreftelser, tilbud, fakturaer, kvitteringer og varsler.</li>
   <li><strong>Have I Been Pwned (Pwned Passwords):</strong> kontroll av nye passord mot kjente datalekkasjer. Vi sender kun de fem første tegnene av en SHA-1-hash av passordet i oppslaget, ikke passordet i klartekst.</li>
   <li><strong>Vipps:</strong> betalingsopplysninger ved bruk av Vipps, blant annet beløp, betalingsreferanse og status.</li>
   <li><strong>Tripletex:</strong> kunde-, faktura-, betalings- og bilagsopplysninger når data overføres til regnskapssystemet.</li>
  </ul>
  <p>Relevante opplysninger kan også måtte gis til regnskapsfører, offentlige myndigheter eller andre mottakere når det er nødvendig for avtalen eller følger av lov. Tjenesteleverandørene kan ha egne personvernvilkår som gjelder for deres behandling.</p>

  <h2>5. Betaling og regnskap</h2>
  <p>Ved Vipps-betaling kan Vipps behandle opplysninger som er nødvendige for betalingstransaksjonen. Hos oss kan betalingsstatus, beløp og referanser knyttes til bestilling eller faktura. Fakturaer og tilhørende bilag kan overføres til Tripletex for regnskapsføring og avstemming. En slik overføring betyr ikke nødvendigvis at fakturaen allerede er bokført.</p>

  <h2>6. Bilder og vedlegg</h2>
  <p>Bilder og dokumenter du laster opp ved en forespørsel, brukes til å vurdere og følge opp oppdraget. Last bare opp materiale som er relevant, og som du har rett til å dele. Originale bilag og dokumentasjon knyttet til faktura eller regnskap kan måtte oppbevares også etter at et kundeforhold er avsluttet.</p>

  <h2>7. Min side og innlogging</h2>
  <p>Det er frivillig å opprette kundekonto. En konto kan koble til tidligere bestillinger, tilbud og relevant historikk ved hjelp av bekreftet e-postadresse. Vi bruker nødvendig sesjonsinformasjon for å holde brukeren innlogget og beskytte kontoen. Opplysninger om passord håndteres gjennom innloggingsløsningen, ikke ved å vise passordet i Min side.</p>
  <p>Ved opprettelse eller endring av passord kontrollerer vi om det nye passordet er kjent fra tidligere datalekkasjer. Kontrollen skjer med et begrenset hash-prefiks, ikke ved å sende selve passordet til oppslagstjenesten.</p>
  <p>Hvis du ønsker å avslutte kontoen, kan du kontakte oss. Opplysninger som må oppbevares for fakturering, dokumentasjon eller andre rettslige plikter, slettes ikke nødvendigvis samtidig med kontoen.</p>

  <h2>8. Informasjonskapsler og lokal lagring</h2>
  <p>Ved innlogging bruker vi nødvendige sesjonsinformasjonskapsler. Kundesesjonen kan vare i opptil 30 dager, og administrasjonssesjonen i opptil 14 dager dersom du ikke logger ut tidligere. Disse brukes til innlogging og tilgangsstyring, ikke til markedsføring.</p>
  <p>For å gjennomføre handlinger du selv velger, kan nettleseren midlertidig lagre valgt tjeneste, produktvalg for et gjenkjøp og tilgangsinformasjon til et tilbud i den aktuelle nettleserøkten. Tilgangsinformasjonen gir ikke lengre gyldighet enn det tilbudslenken tillater på serveren.</p>
  <p>Noen interne administrasjonsfunksjoner, blant annet kalkulator, utkast i materialverktøy, testfremdrift og skriverinnstillinger, kan lagre arbeidsdata lokalt i nettleseren. Skriverens PIN kan lagres lokalt når administrator uttrykkelig velger dette, og kan fjernes i skannerverktøyet. På delt utstyr bør slik lagring unngås. Lokal lagring er ikke det samme som at opplysningene automatisk er sendt til en ekstern leverandør.</p>
  <p>Du kan fjerne lokalt lagrede opplysninger og informasjonskapsler gjennom nettleserens innstillinger. Det kan føre til utlogging eller tap av lokale utkast. Sletting i nettleseren sletter ikke opplysninger som allerede er lagret på serveren.</p>

  <h2>9. Hvor lenge lagrer vi opplysninger?</h2>
  <p>Vi oppbevarer opplysningene så lenge de trengs for formålet de ble samlet inn for, for å følge opp et kundeforhold, håndtere eventuelle krav eller oppfylle lovpålagt dokumentasjonsplikt. Fakturaer og regnskapsbilag kan derfor bli oppbevart lenger enn vanlige henvendelser. Konkrete lagringstider avhenger av dokumenttype og gjeldende krav.</p>
  <p>Primærdokumentasjon etter bokføringsreglene, blant annet fakturaer og regnskapsbilag, skal som hovedregel oppbevares i fem år etter regnskapsårets slutt. For enkelte dokumenttyper kan andre eller lengre lovpålagte frister gjelde. Denne oppbevaringsplikten betyr ikke at alle andre kundeopplysninger skal oppbevares like lenge.</p>
  <p>Dokumentasjon av tilstand, kontroll og skade ved utleie skal ikke beholdes lenger enn nødvendig for oppgjøret, eventuelle uavklarte krav eller lovpålagt dokumentasjon. Ved bruk av tilstandsbilder må konkret oppbevarings- og sletterutine være avklart før funksjonen tas i bruk.</p>
  <p>Du kan spørre oss hvor lenge opplysninger om deg lagres og be om sletting når vilkårene for det er oppfylt.</p>

  <h2>10. Behandling utenfor EU/EØS</h2>
  <p>Internasjonale tjenesteleverandører kan bruke infrastruktur og underleverandører i flere land. Ved eventuell overføring av personopplysninger utenfor EU/EØS gjelder egne krav til overføringsgrunnlag og beskyttelse. Kontakt oss for nærmere informasjon om hvilke overføringer og garantier som gjelder for en konkret tjeneste.</p>

  <h2>11. Dine rettigheter</h2>
  <p>Avhengig av behandlingen og gjeldende regler kan du be om innsyn, retting, sletting, begrensning av behandlingen eller utlevering av opplysninger i et overførbart format. Du kan også ha rett til å protestere mot behandling som bygger på berettiget interesse. Vi vurderer henvendelsen opp mot rettigheter og eventuelle plikter til å bevare dokumentasjon.</p>
  <p>Kontakt <a href={COMPANY_INFO.emailHref}>{COMPANY_INFO.email}</a> for å bruke rettighetene dine. Du kan også klage til <a href="https://www.datatilsynet.no/" target="_blank" rel="noopener noreferrer">Datatilsynet</a> dersom du mener vi behandler opplysningene i strid med regelverket.</p>

  <h2>12. Er det nødvendig å oppgi opplysninger?</h2>
  <p>Det er frivillig å sende forespørsler og opprette Min side. For at vi skal kunne svare, levere varer eller tjenester og sende korrekt faktura, trenger vi nødvendige kontakt- og bestillingsopplysninger. Bilder og annen tilleggsinformasjon er normalt frivillig. Uten nødvendige opplysninger kan vi ikke alltid behandle forespørselen eller gjennomføre avtalen.</p>

  <h2>13. Kontakt om personvern</h2>
  <p>Spørsmål om innsyn, retting, sletting, lagringstid og databehandling kan sendes til <a href={COMPANY_INFO.emailHref}>{COMPANY_INFO.email}</a> eller per post til {COMPANY_ADDRESS}.</p>
 </div></main>;
}
