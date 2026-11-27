# U-36B – BankID-signert leieavtale (beslutnings- og integrasjonsgrunnlag)
Status: ikke aktivert. Behold U-36 kontrollrapport som separat, ikke økonomisk godkjenning.

## Leverandør og kostnad
Kandidat: esigner.no, https://esigner.no/priser – offentlig oppgitt 22 kr inkl. mva per undertegner med forhåndsbetalt saldo, alternativt 1490 kr inkl. mva per år for 100 forespørsler; gratis testnøkkel. Alternativer: Posten signering API, Scrive. Avklar databehandleravtale, lagring, signaturbevis, API-tilgang og vilkår før valg. Ingen konto, kjøp, bestilling eller ekte forespørsel er autorisert her. Vipps Login er identitetskontroll, ikke dokumentsignering. Vipps-betaling beholdes separat.

## Flyt og sikkerhetskrav
1. Server genererer endelig avtale-PDF fra verifisert booking og gjeldende vilkår (nå 2026-11-25), med partene, utstyr/antall, leieperiode/returtid, priser inkl. mva, frakt/forbruksmateriell ved avtale, depositum separat, ansvar og vilkår for dokumenterte krav. Oppgi beregningsgrunnlag for eventuelle tillegg, normal slitasje er ikke skade. Bedrift: bekreft signaturfullmakt separat.
2. Vis dokumentet og betalingsforpliktelsen før kunden signerer. For fjernsalg: § 16 angrerettloven, og separat uttrykkelig anmodning om oppstart før angrefrist når relevant. Ingen automatisk aksept av fremtidig uspesifisert krav. Juridisk gjennomgang av endelige vilkår før aktivering.
3. Lås PDF-bytes og SHA-256 med booking-ID og avtaleversjon; generer unik signeringsforespørsel server-side etter autorisasjon. Leverandørnøkler kun på server. Test og live holdes adskilt. Ikke send ekte personopplysninger i test.
4. Tilstand: ikke sendt / venter / signert / avvist / utløpt / erstattet / feil. Ikke stol på redirect, klientstatus eller ubekreftet webhook. Verifiser leverandørsvar via autentisert server-API, eventuelt verifiser webhook etter dokumentert protokoll, kontroller forespørsels-ID, dokumentbinding, identitet og signaturbevis. Idempotens og atomisk oppdatering; gammel forespørsel kan aldri oppfylle nyere versjon.
5. Lagre signert original-PDF og signaturbevis i privat arkiv; autorisert kunde får egen kopi via Min side/trygg lenke. Ingen fødselsnummer i appen med mindre nødvendig og lovlig. Rolle-/RLS-kontroll, ingen rå dokumenter i åpne API-er, dokumentert slette-/oppbevaringsrutine og revisjonsspor.
6. Når BankID er påkrevd skal manglende/utløpt/avvist/erstattet signatur sperre utlevering server-side. Betaling/depositum kontrolleres separat. Avtalt endring av pris/periode/ansvar krever ny avtale og signatur. Returkontroll for tilstand forblir egen rapport. Tvist om skader behandles separat med bilder, dokumentasjon, innsigelser og saklig oppgjør; ingen automatisk kort-/depositumtrekk basert på signaturen.
7. Før live: test signering, avvist, utløpt, webhook-replay, feil dokument, testbevis i live, endret pris, samtidige forespørsler, uautorisert tilgang, kundekopi og refusjon/avbrutt reservasjon. Bevar eksisterende 30-minutters betalingsreservasjon eller redesign tidsvindu med kapasitetstest før endring. Ingen aktivering før avtale med leverandør og godkjenning.

## Admin
Planlagte separate innstillinger for signering av leieavtale og kontrollrapport. BankID obligatorisk som anbefalt standard ved produksjonsaktivering; eventuell unntaksprosess krever særskilt godkjenning og sporbar alternativ dokumentasjon. Vis tydelig status, send på nytt først etter kansellering når mulig, last ned signert avtale og se historikk.

## Sperrer
RENTAL_PUBLIC_BOOKING_ENABLED og RENTAL_SIGNING_ENABLED beholdes uendret. Ny BankID-funksjon skal være av som standard. Ingen SQL kjøres, ingen deploy til main, ingen eksterne kall. U-36B er ikke ferdig før faktisk integrasjon, test og personvernkontroll. U-37 (forbruksmateriell) kan utvikles isolert; prisene må inngå i endelig signert avtale dersom de er avtalt før utlevering.
