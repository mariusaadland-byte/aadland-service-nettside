// Felles startliste for utviklingsplanen. Brukerens endringer lagres i Supabase.
export const DEVELOPMENT_STATUSES=["todo","progress","test","done"];
export const DEVELOPMENT_PRIORITIES=["high","normal","low"];
export const DEVELOPMENT_GROUPS=[
 {id:"drawing",label:"Tegning og 3D"},
 {id:"business",label:"Salg, økonomi og kalkyle"},
 {id:"rental",label:"Utleie og kunder"},
 {id:"site",label:"Nettside og administrasjon"}
];
export const DEVELOPMENT_TASKS=[
 {id:"drawing_precision",category:"drawing",title:"Slutteste presis møbelplassering",description:"Kontroller innvendige rommål, seng sentrert på sidevegger, skap helt inntil hjørner, rotasjon, flytting og kollisjon i 2D/3D.",priority:"high",status:"test"},
 {id:"drawing_builder",category:"drawing",title:"Ferdigstille møbelbygger og veggvisning",description:"Test egne møbelmaler, hyller automatisk mellom skap, nøyaktige åpninger, høyder og direkte redigering i 3D.",priority:"high",status:"progress"},
 {id:"quote_pdf",category:"business",title:"PDF som vedlegg på sendte tilbud",description:"Legg ved profesjonell PDF-kopi når tilbud sendes med e-post, og test mottaker, utskrift og revisjoner.",priority:"high",status:"todo"},
 {id:"suppliers",category:"business",title:"Importere og kontrollere leverandørprisene",description:"Importer XLSX/CSV-prisfilene i felles prisbase. Test varenummer, priser eks./inkl. MVA, påslag og søk i kalkulator.",priority:"high",status:"progress"},
 {id:"vipps",category:"business",title:"Godkjenne Vipps-testene før live",description:"Test begge salgssteder med nøkler, webhook, betaling, reservering, capture, kansellering, refusjon og kvittering.",priority:"high",status:"test"},
 {id:"calculator",category:"business",title:"Teste priser og standardpåslag",description:"Bekreft avtalt materialpåslag, timepris, statens km-sats, bom, fastpris og MVA før kalkulatoren brukes mot kunder.",priority:"normal",status:"test"},
 {id:"quotes_orders",category:"business",title:"Teste komplett tilbud → oppdrag",description:"Sjekk e-post, godkjenning, revisjon, delbetaling, opprettet oppdrag, planlagt startdato og kundebekreftelse.",priority:"normal",status:"test"},
 {id:"rental_booking",category:"rental",title:"Slutteste utleiebestillinger og kalender",description:"Test datokollisjoner, antall, depositum, blokkeringer, kundebekreftelser og betaling på begge domener.",priority:"high",status:"test"},
 {id:"customer_drawings",category:"rental",title:"Teste kundetilgang til prosjekttegninger",description:"Lagre tegninger i oppdrag, del kun med riktig kunde og kontroller at 2D/3D fungerer på Min side.",priority:"normal",status:"test"},
 {id:"emails",category:"rental",title:"Kontrollere e-post og kvitteringer",description:"Test avsendere for service og utleie, ordre- og leiebekreftelser, kvitteringer, lenke til Min side og PDF-kopi.",priority:"normal",status:"test"},
 {id:"project_gallery",category:"site",title:"Legge inn faktiske prosjektbilder",description:"Opprett prosjektinnhold med før- og etterbilder, beskrivelse og forrige/neste prosjekt.",priority:"normal",status:"todo"},
 {id:"responsive",category:"site",title:"Teste hele admin på PC og mobil",description:"Sjekk mobilmeny, sammenleggbare grupper, rettigheter, lesbarhet, lange lister, zoom og varsler ved feil.",priority:"high",status:"test"},
 {id:"roadmap",category:"site",title:"Bruke og vedlikeholde utviklingsplanen",description:"Oppdater status, prioritet og notater etter hver test. Nye oppgaver legges inn fortløpende.",priority:"normal",status:"test"}
].map((task,index)=>({...task,notes:"",sortOrder:index+1,custom:false}));
