# U-28 – Klargjøring, IKKE lansering

Eier har uttrykkelig sagt at utleie ikke skal lanseres ennå; først registrere utstyr og få Vipps på plass. Produksjonskontroll av produktregisteret: 2 produkttyper, 0 offentlig synlige, 0 aktive tilgjengelige med positiv døgnpris. Ikke opprett fiktive varer. Ny serverstyrt RENTAL_PUBLIC_BOOKING_ENABLED er av som standard; blokkerer nye offentlige booking-POST før DB/ekstern handling. Kundevisning viser klargjøring, uten bestillingsskjema. Katalog og admin kan brukes til oppbygging. Eksisterende bookinger og betalingsoppfølging endres ikke. Dette er ingen total passordbeskyttelse av domenet, ingen endring av Vipps-innstillinger, ingen lansering. Ikke sett flagget true uten uttrykkelig ny godkjenning.

## Før åpning

1. Legg inn virkelige produkter, serienummer/antall, priser, bilder, kategorier, henting og depositumsbetingelser. Hold produkter skjult til de er klare.
2. Egen Vipps-avtale og salgssted, nødvendige nøkler i sikre miljøvariabler, webhook, kontrollert betaling/capture/refusjon/kvittering. Behold offentlige betalingsbrytere av til godkjent.
3. Egen utleiepostkasse og faktisk mottak/svaradresse; e-postmaler, kontaktskjema og returlogg kontrollert.
4. Isolert testdatabase, atomisk vern for forsinkelse/manuell blokkering, kundeskille, privat fotolagring og sletterutine.
5. Individregister/service: SQL-utkast, bookingtilordning, vedlikeholdssperre og skannetesting. Ingen automatisk endring av tilgjengelighet før dette er klart.
6. Regnskap: utleiefaktura, Tripletex, avstemming, refusjon, depositum, avtalebevis og juridisk gjennomgang.
7. Gjennomfør relevante U01–U27 manuelle tester; behold alle uferdige punkter åpne. U28 er ikke en godkjenning. Ikke aktiver booking, Vipps eller e-post i denne oppgaven.

U27 tidligere byggetest stoppet på manglende komma i developmentTaskLinks; rettet her. Ingen databaseendringer, e-post, ekte betaling eller produktregistrering.
