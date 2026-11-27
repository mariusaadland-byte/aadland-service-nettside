// Evidence is from development branch review, not a live production audit.
// No status in this catalog authorizes activation.
export const RENTAL_RELEASE_BLOCKERS=Object.freeze([
 {id:"products",title:"Utstyr og priser",status:"owner",detail:"Registrer reelt utstyr, antall, serienummer, priser, bilder og depositum. Verifiser individuell tilordning og vedlikehold.",href:"/admin/utleie"},
 {id:"database",title:"Database og rettigheter",status:"integration",detail:"Isolerte PostgreSQL-tester bestått for signering, reservasjon, betaling og retur. Utkast er ikke produksjonsmigrasjoner. Fullt skjema, RLS, minstetilgang og migrasjonskontroll gjenstår."},
 {id:"checkout",title:"Samlet bestilling",status:"integration",detail:"Handlekurv gir kun pris og tilgjengelighet (checkoutEnabled:false). Koble autentisert ordreopprettelse til atomisk reservasjon; avstem kapasitet, pris og reservert lager i alle eldre ruter."},
 {id:"signing",title:"Kundesigneringsflyt",status:"integration",detail:"PDF, OTP og transaksjon er testet separat. Faktiske utstedelses- og bekreftelsesruter, avtalearkiv, signeringsnøkler og e-postkø må kobles sammen.",href:"/admin/utleie/signering"},
 {id:"vipps",title:"Vipps Utleie",status:"owner",detail:"Eget salgssted og tilgang må kontrolleres. Gruppebetaling må kobles til autentisert leverandørstatus, webhook, capture, avbrudd og refusjon. Ikke bruk serviceavtalen som utleieavtale.",href:"/admin/utleie/vipps-oppsett"},
 {id:"handover",title:"Utlevering, QR og depositum",status:"integration",detail:"Bind varig kontrollrapport, individ-ID, identitet og verifisert depositumsbevis til samme ordre. Test faktisk fysisk utlevering og retur.",href:"/admin/utleie/depositum"},
 {id:"damage",title:"Skadesaker og dokumenter",status:"integration",detail:"Privat lagringsområde, tilgangsregler, dokumentkontroll, opprydding og varsling er ikke aktivert. PDF er kun formatkontroll i demo; skanning, omtvistede krav og oppgjørsavstemming gjenstår.",href:"/admin/utleie/signering/skadesaker"},
 {id:"accounting",title:"Regnskap og avstemming",status:"integration",detail:"Utleie, salg, mva, depositum og refusjon må avstemmes mot faktura, bank og Tripletex. Ikke dobbelttell gruppens underbookinger."},
 {id:"mail",title:"E-post og varslinger",status:"owner",detail:"Verifiser avsender, svaradresse og egen postkasse. Koble varige køer for signering/skadesaker med kontrollert utsending, ikke automatisk gjentakelse ved ukjent resultat."},
 {id:"browser",title:"Full nettleser- og lanseringskontroll",status:"manual",detail:"Kjør hele flyten på mobil og PC i isolert miljø, inkludert tilgang, feiltilfeller, dobbeltklikk og betaling. Eier må uttrykkelig godkjenne lansering."}
]);
export function releaseReadiness(){return {ready:false,open:RENTAL_RELEASE_BLOCKERS.length,blockers:RENTAL_RELEASE_BLOCKERS};}
