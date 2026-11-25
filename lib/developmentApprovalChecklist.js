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
   "Test søk, 15 % bedriftspåslag og tilbudskalkyle etter hver fil."
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
  ]},
 "service-final-calc":{group:"quick",order:101,dependency:"",checks:["Åpne en usendt kalkyle på PC og iPhone. Kontroller standard 15 % materialpåslag og 400 kr/time eks. MVA (500 inkl.).","Kontroller 5,30 kr/km og at bom ikke legges til uten valgt rute; sammenhold med faktisk reise og biltype.","Overfør en usendt kalkyle til tilbud og sammenlign summer, MVA og bom. Ikke send tilbud."]},
 "service-final-mobile":{group:"quick",order:102,dependency:"",checks:["Åpne admin på iPhone stående og liggende, med tastatur og lange lister. Kontroller kontrast og at knapper ikke overlapper.","Åpne en usendt tilbudskladd og fakturaarkivets handlingsvinduer. Kontroller rulling, avbryt og synlige knapper uten å utføre handlinger.","Åpne MVA-PDF og prøv zoom, lukk og fokus på iPhone og PC, også ved 200 % zoom. Ikke endre bilag."]},
 "service-final-public-content":{group:"quick",order:103,dependency:"Ekte tjenestetekster og godkjente referansebilder må være tilgjengelige.",checks:["Åpne forsiden og tjenestelenker på mobil og PC. Sjekk at Les mer går til riktig tjeneste.","Kontroller at skjulte tjenester ikke vises, og at tomme gallerier ikke påstår at prosjekter er publisert.","Kontroller ekte tjenestebeskrivelser og godkjente referansebilder. Ikke opprett fiktive referanseprosjekter."]},
 "service-final-price-age":{group:"quick",order:104,dependency:"Oppdatert godkjent prisfil fra aktuelle leverandører må være tilgjengelig.",checks:["Åpne prislisten og kontroller dato og varsel ved manglende eller gammel katalog.","Sammenlign varenummer, enhet og kostpris eks. MVA med leverandørens gjeldende godkjente prisliste.","Kontroller at prisalder og bedriftspåslag vises i kalkulator og tilbud. Ikke masseimport før S-36 er godkjent."]},
 "service-final-price-import":{group:"dependent",order:105,dependency:"Bruk godkjent isolert testleverandør og syntetiske filer. Ikke aktiver ny Bygger’n-prisliste før sluttkontroll.",checks:["Last opp syntetisk fil og kontroller forhåndsvisning: nye, endrede, prisøkninger, reduksjoner og deaktiverte. Avbryt uten å endre katalog.","Kontroller at bare eier kan godkjenne og at minst 20 % bortfall krever ekstra frase; prøv feil frase og utløpt kladd.","Dokumenter faktisk samtidig aktivering i isolert miljø, feiltilbakeføring og samme kladd på nytt. Kontroller at ingen delvis import blir liggende."]},
 "service-final-backup":{group:"dependent",order:106,dependency:"Blokkerende: godkjent kryptert eksternt lagringsmål og isolert restoremiljø må finnes.",checks:["Dokumenter database-, Auth- og Storage-sikkerhetskopi med dato og kontrollsum; ikke legg kundeopplysninger i testnotatet.","Gjenopprett kopiene i isolert miljø uten utgående e-post eller betaling. Kontroller tabeller, dokumenter og filinnhold.","Bekreft at gjenoppretting faktisk fungerer, og dokumenter rutine for kopiering, tilgang og jevnlig restoretest."]},
 "service-final-auth":{group:"dependent",order:107,dependency:"Bruk egne testkontoer. Ingen abonnement eller eksisterende passord endres.",checks:["Kontroller Supabase Auth-innstilling for direkte offentlig registrering og at applikasjonens passordkontroll ikke kan omgås.","Test avvisning av kjent kompromittert testpassord og kontrollert feil når passordtjenesten er utilgjengelig.","Dokumenter kompensasjon for manglende innebygd lekkasjekontroll på Free og eventuelle avvik. Ikke endre abonnement."]},
 "service-final-privacy":{group:"dependent",order:108,dependency:"Databehandleravtaler, lagringsplan og autorisert intern testidentitet må være tilgjengelig.",checks:["Kontroller databehandleravtaler, lagringsregioner, overføringsgrunnlag og faktisk bruk av informasjonskapsler.","Dokumenter lagringstid, sletting og lovpålagt oppbevaring per datakategori.","Test rutinen for innsyn og sletting med egen testidentitet. Ikke slett ekte kundedata eller regnskapsdokumenter."]},
 "service-final-receipt-accounting":{group:"dependent",order:109,dependency:"Krever faktisk Tripletex-tilgang; e-postaksept er ikke bokføringsbevis.",checks:["Finn de 18 opprinnelige kjøpsbilagene fra 21.11 i oversikten og sammenhold med faktiske Tripletex-bilags-ID-er.","Kontroller original, leverandør, beløp, konto, MVA-kode, fradragsrett og dubletter for hvert bilag.","Bruk Kontroller bokføring og registrer bare dokumenterte treff. Ikke opprett bilag for å få testen godkjent."]},
 "service-final-vat":{group:"dependent",order:110,dependency:"Krever faktiske innsendingskvitteringer og mottatt intern varsling.",checks:["Sammenhold MVA-terminene med Skatteetaten eller Tripletex og registrer kun dokumentert leveringsstatus.","Kontroller kommende frist og faktisk varsellogg for MVA-påminnelser. Ikke send inn en testmelding.","Bekreft mottak og at levert termin ikke varsles; avklar avvik i status uten å endre historikk."]},
 "service-final-invoice-tripletex":{group:"dependent",order:111,dependency:"Krever faktisk Tripletex-oppslag.",checks:["Åpne AS-WEB-2026-000004 og kontroller original, kunde, beløp og lokal overføringsstatus.","Bruk Sjekk Tripletex før overføring. Sammenhold med fakturaer som faktisk finnes der, også eventuelle manuelle fakturaer.","Dokumenter om fakturaen finnes og avklar eventuelt duplikat. Ikke overfør en test eller lag ny faktura."]},
 "service-final-vipps-settlement":{group:"dependent",order:112,dependency:"Krever faktiske Service-rapporter, bank og Tripletex.",checks:["Hent oppdaterte Service-oppgjørsrapporter og kontroller at det ikke mangler dager.","Avstem fangede betalinger, gebyrer og saldo; sammenlign eventuell faktisk bankutbetaling.","Kontroller de faktiske Tripletex-posteringene mot oppgjør. Ingen fiktive gebyrer eller bankbilag."]},
 "service-final-invoice-followup":{group:"workflow",order:113,dependency:"Bruk isolerte testfakturaer; ikke send purring, inkasso eller kreditnota til ekte kunde.",checks:["Kontroller restbeløp for betalt, delbetalt og kreditert faktura mot dokumentert saksgrunnlag.","Kontroller varselgrense, tvist og ukjent tidligere sending i isolert test. Gamle usikre sendinger skal ikke gjentas automatisk.","Bekreft dokumentert intern varseltest og korrekt PDF på testdata uten reell purring eller regnskapspostering."]},
 "service-final-vipps-payment":{group:"dependent",order:114,dependency:"Kun avtalt testmiljø eller særskilt godkjent kontrollert Service-test; utleie og ekte kunder holdes utenfor.",checks:["Prøv bestilling, lagerreservasjon, avbrutt checkout og dobbeltklikk. Kontroller én ordre og én betalingsreferanse.","Kontroller godkjent capture, kansellering og refusjon med faktisk testbevis. Ikke gjennomfør reell pengehandling uten separat godkjenning.","Kontroller oppgjør og kvittering; gjentatt offentlig statusoppslag skal ikke sende e-post eller dobbeltbelaste."]},
 "service-final-manual-payment":{group:"dependent",order:115,dependency:"Krever isolert testordre eller særskilt godkjent kontrollert betalingsprøve.",checks:["Kontroller mottatt testbetaling og riktig beløp/referanse før registrering. Ikke marker ekte ordre betalt som test.","Prøv gjentatt registrering på testordren og kontroller at betalingsbeløp og kvitteringsjournal ikke dupliseres.","Kontroller mottatt kvitterings-PDF og eieravstemming av ukjent sending. Ingen automatisk gjensending."]},
 "service-final-quote-mail":{group:"workflow",order:116,dependency:"Bruk bare godkjent intern testadresse og testtilbud; ikke send ekte tilbud.",checks:["Kontroller testtilbudets pris, kunde-PDF og mottaker før kontrollert sending.","Kontroller mottak og Resend-ID, og at gjentatt sending av samme versjon sperres.","Kontroller påminnelsesjournal, ukjent sending og eieravstemming uten å sende dobbelt."]},
 "service-final-cron":{group:"dependent",order:117,dependency:"Krever observerte produksjonskjøringer og dokumentert intern eieralarm.",checks:["Åpne driftsoversikten og kontroller siste kjøring og siste vellykkede kjøring for Service-jobbene.","Bekreft intern eieralarm og at nye jobber for ordre, tilbud og kontaktbilder inngår i overvåkingen. Noter hull.","Dokumenter separat overvåking av scheduler og rutine ved database- eller Resend-brudd. Ikke utløse ekte kundevarsler."]},
 "service-final-quote-response":{group:"workflow",order:118,dependency:"Bruk kontrollert testkunde og egne mottakere.",checks:["Test aksept og avslag på separate testtilbud. Kontroller at kundesvaret lagres én gang.","Kontroller at kunde og eier får hver sin dokumenterte bekreftelse, og at samme svar ikke sender dobbelt.","Prøv ukjent sending og tilbud uten e-post i isolert miljø. Kontroller gjenoppretting og journal."]},
 "service-final-appointments":{group:"workflow",order:119,dependency:"Bruk egne testavtaler og godkjent mottaker.",checks:["Kontroller bekreftelse og påminnelse for en testbefaring og et testoppdrag med dato og tidspunkt.","Endre testavtalen og kontroller ny planrevisjon og korrekt tidspunkt, uten å sende til ekte kunde.","Kontroller at identisk plan ikke sender på nytt, og at ukjent sending vises for eieravstemming."]},
 "service-final-registration":{group:"workflow",order:120,dependency:"Kun egne testkontoer og godkjent intern e-postadresse.",checks:["Registrer egen testkunde, kontroller mottatt bekreftelse og logg inn.","Kontroller at uavklart sending ikke sletter konto, og at ny forespørsel ikke skaper doble e-poster.","Bekreft at preview ikke sender ekte e-post, og at kunde- og eieradresse i produksjon er korrekt."]},
 "service-final-order-mail":{group:"workflow",order:121,dependency:"Bruk egen testordre i kontrollert miljø, ikke en eksisterende kundeordre.",checks:["Kontroller at en manuell produktordre blir registrert én gang, og at ordrebekreftelsen går til egen godkjent adresse.","Kontroller kø, filter for uavklarte bekreftelser og faktisk cron-kjøring; påse at usikker sending ikke automatisk gjentas.","Avstem Resend-ID og status med eierfunksjonen. Historiske ukjente forsøk skal ikke sendes automatisk."]},
 "service-final-quote-links":{group:"workflow",order:122,dependency:"Krever to egne testkundekontoer og kontrollert testtilbud.",checks:["Kontroller gyldig, utløpt og sperret lenke på testtilbud.","Logg inn som hver av to testkunder og kontroller at kun egne tilbud vises.","Prøv direkte lenke til den andre testkundens tilbud. Bekreft avvist tilgang uten personopplysninger."]},
 "service-final-contact-images":{group:"workflow",order:123,dependency:"Bruk ufarlige egne testbilder i isolert miljø; ikke slett ekte filer.",checks:["Last opp et testbilde på mobil og PC og kontroller kvitteringsbinding til egen forespørsel.","Kontroller at direkte offentlig sletting og gjenbruk av bildekvittering er avvist.","Bekreft 24-timers opprydding og karantene på isolerte testfiler, og dokumenter identitetskontroll ved slettesaker."]},
 "service-final-drawing-roles":{group:"workflow",order:124,dependency:"Krever egne testbrukere med lese- og skriverett.",checks:["Logg inn som testleser og åpne egen testtegning i 2D, 3D og PDF.","Kontroller at opprett, endre og slett er sperret for testleseren, også direkte API.","Prøv autorisert redigering på egen testtegning, og kontroller at originaler ikke er endret."]},
 "service-final-history":{group:"workflow",order:125,dependency:"Krever egne testkontoer med mer enn 100 syntetiske Service-poster i isolert miljø.",checks:["Kontroller Vis eldre historikk for bestillinger, tilbud og oppdrag, med riktig total for hver kildesamling.","Hent eldre tegninger og kontroller at delte/egne tegninger ikke vises dobbelt og at tellerne er tydelig merket.","Bytt testkonto under innlasting og kontroller ingen fremmede poster. Ved samtidige endringer, last siden på nytt."]},
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
