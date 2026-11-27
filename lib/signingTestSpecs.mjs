export const SIGNING_TESTS=[
 {id:"document",title:"1. Avtale og dokumentkontroll",description:"Generer ekte PDF-bytes fra fiktivt ordregrunnlag. Kontroller hash og endret versjon."},
 {id:"otp",title:"2. Engangskode og e-post",description:"Kjør kodeforespørsel med falsk e-postleverandør. Test avvisning og utløp."},
 {id:"commit",title:"3. Signering og gjenbruk",description:"Test feilforsøk og engangsforbruk mot simulert atomisk lagring."},
 {id:"archive",title:"4. Arkiv og dokumenttilgang",description:"Test eierkontroll, bevisintegritet og begge PDF-vedlegg."},
 {id:"payment",title:"5. Betalingssperre og utlevering",description:"Test gyldig bevis, endret pris, manglende kontroll og retur."},
 {id:"rpc",title:"6. Databaseadapter",description:"Kontroller parametere, tillatte svar og feil fra simulerte RPC-kall."},
 {id:"stock",title:"7. Reservasjon og lager",description:"Kontroller utløp, reservasjon, utlevering og gjentatt lagerføring med fiktive data."},
 {id:"damage",title:"8. Skadesak og depositum",description:"Kontroller godtatt/bestridt krav, sikker retur og dokumentbinding."},
 {id:"invoice",title:"9. Fakturagrunnlag og mva",description:"Kontroller fiktiv leie og varelinjer, depositum separat. Ingen faktura sendes."},
 {id:"pdf",title:"10. Dokumentfilkontroll",description:"Test PDF-formatkontroll, avvis avkortet fil. Ikke en malware-test."},
 {id:"finance",title:"11. Økonomi og oppgjør",description:"Syntetisk test av kostnadsdeling, manglende rapporter, bankgrunnlag og dobbeltføring. Ingen ekte overføring."}
];