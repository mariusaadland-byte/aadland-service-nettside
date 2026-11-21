// Concrete acceptance criteria based on the saved owner roadmap and testing
// notes. These are not claims that a real customer/payment/email test has passed.
// Only status==="test" tasks enter the approval queue; "todo" and "progress"
// stay out until the underlying work is actually implemented.
export const APPROVAL_GROUPS={
 quick:{label:"Kan gjennomgås i admin",help:"Krever normalt kontroll av skjermbilder, lagring eller en ufarlig testkladd."},
 workflow:{label:"Krever kontroll av en hel brukerflyt",help:"Må prøves fra start til slutt, ofte med egen testadresse eller to kontoer."},
 dependent:{label:"Venter på ekstern bekreftelse eller oppsett",help:"Ikke ferdigmerk før virkelig betaling, e-post, prisfil eller avstemming er bekreftet."}
};
export const APPROVAL_CHECKS={
 "custom-invoice-customer-card-20261021":{
  group:"quick",order:1,
  checks:[
   "Åpne kundekort og kontroller navn, adresse, telefon og e-post mot en eksisterende kunde.",
   "Endre én kontrollert testopplysning og se at den følger en ny fakturakladd.",
   "Kontroller at en allerede utstedt faktura og PDF ikke endres når kundekortet oppdateres."
  ]},
 "custom-invoice-archive-payments-20261021":{
  group:"quick",order:2,
  checks:[
   "Åpne fakturaarkivet og kontroller betalt, ubetalt og forfalt mot kjente fakturaer.",
   "Test delbetaling, restbeløp og reversering bare på en trygg testfaktura, ikke på en ekte innbetaling.",
   "Kontroller at oppdatering ikke lager dobbeltbetaling og at arkivstatusen følger innbetalingene."
  ]},
 "custom-manual-product-price-list-20261021":{
  group:"quick",order:3,
  checks:[
   "Opprett eller velg en kontrollert testvare med leverandør, varenummer og innkjøpspris eks. MVA.",
   "Kontroller påslag, enhet og salgspris både eks. og inkl. MVA.",
   "Bruk varen i kalkulator og tilbudskladd og kontroller at intern kostnad beholdes."
  ]},
 "custom-material-shared-prices-20261008":{
  group:"quick",order:4,
  checks:[
   "Søk etter Bygger’n-vare i Material-AI på varenummer, EAN og produktnavn.",
   "Kontroller innkjøpspris eks. MVA, enhet og korrekt 15 % bedriftspåslag (eller dokumentert overstyring).",
   "Legg varen inn i en usendt tilbudskladd og sammenlign prisene."
  ]},
 "custom-quote-private-margin-pdf-20261009":{
  group:"quick",order:5,
  checks:[
   "Opprett en usendt tilbudskladd med leverandørvare, intern kostnad og dekningsbidrag.",
   "Lagre, åpne på nytt og kontroller at interne kostnader er bevart.",
   "Last ned kunde-PDF og kontroller visuelt at interne kostnader og dekningsbidrag IKKE vises."
  ]},
 "custom-vipps-fee-price-preview-20261022":{
  group:"quick",order:6,
  checks:[
   "Åpne intern kostnadskalkulator for faktura og utleie og kontroller estimert Vipps-kostnad.",
   "Sammenlign sats og fastbeløp mot din faktiske Vipps-avtale (ikke anta at standardsatsen gjelder).",
   "Kontroller ønsket utbetaling, øreavrunding og at depositum holdes utenfor."
  ]},
 calculator:{
  group:"quick",order:7,
  checks:[
   "Kontroller avtalt timepris og materialpåslag, inkludert eventuelle særpriser.",
   "Kontroller reise, bom, statens kilometersats og fastpris etter gjeldende avtaler.",
   "Sammenlign pris eks./inkl. MVA og summen i en usendt tilbudskladd."
  ]},
 "custom-drawing-report-20261008":{
  group:"quick",order:8,
  checks:[
   "Last ned en samlet PDF fra en lagret tegning og se plantegning og alle relevante veggvisninger.",
   "Kontroller rommål, skapplassering og at innholdet er lesbart ved utskrift.",
   "Åpne tilbuds-PDF med valgt tegning og kontroller at pris og avtalevilkår fortsatt følger med."
  ]},
 "custom-kitchen-open-walls-20261008":{
  group:"quick",order:9,
  checks:[
   "Test rett kjøkkenvegg, venstre/høyre L og U med ulike vegglengder i 2D.",
   "Plasser skap og kontroller innside, hjørner og veggvisning i 3D.",
   "Lagre og åpne igjen, last ned PDF og prøv mobilgrensesnittet."
  ]},
 "custom-drawing-customer-20261008":{
  group:"quick",order:10,
  checks:[
   "Opprett en intern testkunde direkte fra tegneprogrammet, uten å opprette Min side-konto.",
   "Velg kunden på en tegning, lagre og åpne den igjen fra serveren.",
   "Kontroller at kunden finnes i kunderegisteret, og at kundevalget fungerer også på mobil."
  ]},
 "custom-drawing-customer-archive-20261008":{
  group:"quick",order:11,
  checks:[
   "Lagre en tegning på kunden uten å knytte den til et prosjekt.",
   "Åpne kundens tegningsarkiv på en annen enhet og rediger tegningen.",
   "Hent tegningen til en ny tilbudskladd og kontroller riktig kundetilknytning."
  ]},
 "custom-drawing-mobile-menu-20261008":{
  group:"quick",order:12,
  checks:[
   "Åpne tegneprogrammet på mobil og kontroller hamburgermenyen.",
   "Prøv 3D, veggvisning, møbelbygger, EL, zoom og angre uten at menyen låser skjermen.",
   "Prøv kundevalg, lagring og PDF på mobil."
  ]},
 responsive:{
  group:"quick",order:13,
  checks:[
   "På PC og iPhone: åpne Admin. Kontroller sidemeny, lengre lister, knapper og tekst ved normal zoom og 200 % zoom. Ingen elementer skal ligge oppå hverandre.",
   "Åpne en USENDT tilbudskladd på iPhone. Se at materiallinjer, påslagsknapp og leverandørsøk har hver sin plass, også med langt varenavn.",
   "I tilbudskladden: åpne «Send til annen e-post» UTEN å trykke «Lagre og send». Prøv stående/liggende mobil med tastaturet oppe: dialogen skal kunne rulles, og Avbryt skal alltid være tilgjengelig.",
   "I fakturaarkivet: åpne en faktura og velg én handling om gangen. Kontroller at handlingene ikke overlapper og at de kan lukkes. IKKE registrer reell betaling eller send e-post.",
   "I MVA-registreringen: åpne et eksisterende bilag eller en PDF. Prøv zoom, scroll og Lukk på iPhone; felt og scrollposisjon skal være bevart etter lukking. IKKE lagre endringer.",
   "Gjenta fakturaarkiv og MVA-PDF på PC, også ved smal nettleser. Kontroller lesbar kontrast, fullt synlige knapper og at fokus ikke forsvinner bak dialogen."
  ]},
 "custom-invoice-issue-email-20261021":{
  group:"workflow",order:14,
  checks:[
   "Utsted en kontrollert testfaktura til egen adresse; verifiser dato og fakturanummer.",
   "Kontroller at e-post kommer fram og at vedlagt fryst PDF viser riktige beløp.",
   "Prøv «Fakturer og skriv ut» og se at utstedt faktura ikke kan endres."
  ]},
 quote_pdf:{
  group:"workflow",order:15,
  checks:[
   "Send et testtilbud kun til din egen e-postadresse og kontroller mottaker og avsender.",
   "Åpne e-postvedlegget og sjekk plantegning, veggtegninger, priser og sideinndeling.",
   "Kontroller utskrift og at en senere revisjon ikke endrer tidligere sendt PDF."
  ]},
 "custom-invoice-reminders-20261021":{
  group:"workflow",order:16,
  checks:[
   "Bruk en ufarlig testfaktura og kontroller purringstekst, restbeløp og original-PDF.",
   "Kontroller minst 14 dagers frist, og at inkassovarsel sperres før purrefristen er utløpt.",
   "Test e-post kun til egen adresse og kontroller historikk og duplikatvern."
  ]},
 quotes_orders:{
  group:"workflow",order:17,
  checks:[
   "Test tilbud → godkjenning → oppdrag med en kontrollert testkunde, uten å sende til ekte kunde.",
   "Kontroller at kunde, sum og delbetalingskladd opprettes én gang uten duplikat.",
   "Test planlagt oppstart, endring av dato og riktig bekreftelse/påminnelse."
  ]},
 "custom-drawing-customer-publication-20261008":{
  group:"workflow",order:18,
  checks:[
   "Send et kontrollert testtilbud med valgt tegning til riktig testkunde.",
   "Kontroller at tegningen vises i PDF og på riktig kundes Min side, men ikke ved bare lagring.",
   "Test at en alternativ testadresse/annen kunde ikke får tilgang."
  ]},
 "custom-customer-access-isolation-20261021":{
  group:"workflow",order:19,
  checks:[
   "Bruk to testkundekontoer og bekreft at hver bare ser egne oppdrag, tilbud og leieavtaler.",
   "Kontroller at skjulte/ikke delte tegninger ikke kan vises fra den andre kontoen.",
   "Test direkte URL til en annen kundes element og bekreft avvist tilgang."
  ]},
 customer_drawings:{
  group:"workflow",order:20,
  checks:[
   "Lagre tegning på et testoppdrag og del den uttrykkelig med riktig kunde.",
   "Logg inn som testkunden og kontroller 2D/3D på Min side.",
   "Bekreft at andre kunder og udelt materiale er sperret."
  ]},
 emails:{
  group:"workflow",order:21,
  checks:[
   "Kontroller avsender og mottaker for Aadland Service og utleie med egne testadresser.",
   "Kontroller ordre-/leiebekreftelse, betalingskvittering og riktig PDF-vedlegg.",
   "Åpne lenke til Min side og bekreft riktig kundetilgang."
  ]},
 "custom-invoice-admin-alerts-20261021":{
  group:"workflow",order:22,
  checks:[
   "Bekreft at daglig jobb kjører, og at varsler går bare til post@aadland-service.no.",
   "Kontroller en faktisk varsling ved 14 dager over forfall, utløpt purring eller inkassovarsel.",
   "Bekreft at betalte fakturaer ikke varsles, og at samme dags varsel ikke sendes dobbelt."
  ]},
 "custom-rental-deposit-reminders-20261021":{
  group:"workflow",order:23,
  checks:[
   "Kontroller booking med manglende depositum som starter innen to dager.",
   "Bekreft at intern e-post til post@aadland-service.no mottas ved riktig dato.",
   "Kontroller at registrert depositum, kansellering og ferdig leie stopper varselet."
  ]},
 "custom-external-ledger-review-20261120":{
  group:"workflow",order:24,
  checks:[
   "Kontroller at faktura 10035 og 10036 vises i samlet fakturaarkiv og regnskapsoversikt.",
   "Sammenlign betalt/utestående og betalingsår med de faktisk bekreftede Tripletex-posteringene.",
   "Eksporter regnskapsark og kontroller at eksterne beløp ikke blir telt dobbelt."
  ]},
 suppliers:{
  group:"dependent",order:25,
  dependency:"Øvrige leverandørprisfiler må være tilgjengelige.",
  checks:[
   "Kontroller at importerte Bygger’n-priser og varenummer stemmer med siste prisfil.",
   "Importer og kontroller de resterende leverandørfilene du ønsker å bruke.",
   "Test søk, 20 % påslag og tilbudskalkyle etter hver fil."
  ]},
 rental_booking:{
  group:"dependent",order:26,
  dependency:"Ekte Vipps-/utleie-test og depositumsoppsett gjenstår.",
  checks:[
   "Test kollisjon i kalender, antall ledige eksemplarer, sperring og frigjort kapasitet.",
   "Test leiebekreftelse og depositum i reell brukerflyt.",
   "Kontroller ekte Vipps-betaling eller godkjent testmiljø, og riktig kvittering."
  ]},
 vipps:{
  group:"dependent",order:27,
  dependency:"Vipps-avtaler, riktige nøkler og webhook for begge salgssteder.",
  checks:[
   "Kontroller korrekt Vipps-salgssted, API-nøkler og webhook.",
   "Test betaling, reservering, capture og avbrutt/kansellert forsøk.",
   "Test refusjon, kvittering og ingen dobbeltbelastning."
  ]},
 "custom-invoice-vipps-payment-20261021":{
  group:"dependent",order:28,
  dependency:"Aktivert Vipps-avtale og bekreftet webhook kreves før reell sluttest.",
  checks:[
   "Lag kontrollert faktura og betalingslenke med mottaker som du eier.",
   "Gjennomfør godkjent Vipps-test med korrekt capture og beløp.",
   "Kontroller kvittering, PDF og én betalingsregistrering uten duplikat."
  ]},
 "custom-tripletex-original-pdf-20261120":{
  group:"dependent",order:30,
  dependency:"Eier må bekrefte opplasting av de to virkelige PDF-originalene og kontrollere vedlegg i Tripletex.",
  checks:[
   "Åpne ekstern faktura 10035, og bruk knappen «Legg original-PDF ved Tripletex-bilaget». Bekreft kun hvis originalen ikke allerede ligger der.",
   "Åpne det eksisterende bilaget for faktura 10035 i Tripletex, og kontroller at riktig PDF følger bilaget uten ny faktura eller innbetaling.",
   "Gjenta for faktura 10036. Kontroller at begge står som vedlagt, at kundene ikke har fått en ny faktura, og at bilagene ikke er dobbeltført."
  ]},
 "custom-external-vat-double-count-20261120":{
  group:"dependent",order:29,
  dependency:"Må avstemmes mot tidligere bokføring/MVA-terminer og faktisk bank i Tripletex.",
  checks:[
   "Finn historisk bokføring og MVA-termin for faktura 10035 og 10036 før de ble importert.",
   "Avstem de nye Tripletex-posteringene mot tidligere regnskap og faktisk bankoppgjør.",
   "Bekreft at omsetning og MVA ikke er rapportert dobbelt; korriger eventuelle avvik før godkjenning."
  ]}
};
export function approvalMeta(task){
 if(!task||task.status!=="test")return null;
 const specific=APPROVAL_CHECKS[task.id];
 if(specific)return specific;
 return {group:"workflow",order:999,checks:[
  "Les oppgavens beskrivelse og tidligere testnotater.",
  "Test funksjonen med ufarlige data på relevant enhet.",
  "Kontroller forventet resultat og noter avvik før godkjenning."
 ]};
}
export function developmentApprovalQueue(tasks){
 if(!Array.isArray(tasks))return [];
 const weight={quick:0,workflow:1,dependent:2};
 return tasks.filter(t=>t?.status==="test")
  .map(t=>({...t,approval:approvalMeta(t)}))
  .sort((a,b)=>(weight[a.approval.group]??9)-(weight[b.approval.group]??9)||
   (a.approval.order-b.approval.order)||
   String(a.id).localeCompare(String(b.id)));
}
