# Aadland Service – systemkontroll uten utleie
Opprettet 21.11.2026. Løpende funnliste. **Ingen av punktene under er utbedret eller godkjent gjennom denne kontrollen.** Utleiedelen holdes utenfor. De 36 tidligere avsluttede utviklingsoppgavene beholdes uendret.

## Arbeidsmåte
- Hvert funn får en stabil ID. Nye funn føyes til denne samme filen.
- Prioritet: **P1** = risiko for økonomifeil, dobbeltutsending eller feil regnskap; **P2** = sikkerhet, dokumentasjon eller driftssikkerhet; **P3** = forbedring/vedlikehold.
- Dokumentasjon: **Påvist** = demonstrert ved kode eller database; **Kontrolleres** = krever reell avstemming, konfigurasjon eller brukertest. Påvist kodefeil er ikke bevis på at en kunde allerede er rammet.
- Status for alle: **IKKE BEHANDLET**. Ingen endringer i regnskapsdata, e-postutsending eller prisinnstillinger under kontrollen.

| ID | Prioritet | Type | Område | Funn / hva vi skal gå gjennom |
| --- | --- | --- | --- | --- |
| S-01 | P1 | Påvist | Prising og materialer | Tilbud har hovedstandard/minimum 15 % påslag, mens seks leverandørstandarder og kostnadskalkulator står på 20 %. Kalkulatoren omskriver dessuten lagret 15 % til 20 % ved åpning. Bestemme en autoritativ sats, korrigere synkronisering og teste at brukerens valg beholdes. |
| S-02 | P1 | Påvist | Send tilbud | Vanlig tilbudsutsending sender e-post før lokal status aktiveres og bruker ikke en dokumentert Resend-idempotensnøkkel. Ved avbrutt svar kan man være usikker på om kunden fikk e-posten. Utsendingshistorikk er også «best effort». Lage robust sendelås/kvitteringsstatus og testes med simulator, ikke ekte kunder. |
| S-03 | P1 | Påvist | Automatiske tilbudspåminnelser | Ved uavklart Resend-feil nullstilles sendemarkøren, mens kallet mangler en eksplisitt idempotensnøkkel. Mulig duplisert e-post ved senere automatisk forsøk. Innføre stabil nøkkel og manuell kontroll av usikker status. |
| S-04 | P1 | Påvist | Fakturavarslinger | Daglig intern fakturaoppfølging henter ikke feltet credited_ore, selv om betalingsberegningen bruker det. Dette kan varsle om feil restkrav på kreditert faktura. Må hente og avstemme kreditnotaer/Vipps før varsel. |
| S-05 | P1 | Kontrolleres | Tripletex, kjøpsbilag | 18 kjøpsbilag har «accepted» ved e-postleverandør/e-bilag, men dette beviser ikke bokføring i Tripletex. Avstem dokument for dokument med faktisk bilagsnummer, MVA-kode og regnskapsført status. |
| S-06 | P1 | Kontrolleres | MVA-terminer | Det finnes MVA-registreringsprofil, men 0 registrerte terminstatusrader i Aadland Service. Kontroller faktiske innsendte terminer hos Skatteetaten/Tripletex og registrer status manuelt uten å anta manglende innlevering. |
| S-07 | P1 | Påvist | MVA-påminnelser | Ingen dedikert MVA-fristvarsler i vercel.json blant planlagte jobber. Må etablere korrekte varsler, deduplisering, lokale datoer og kontroll mot terminstatus før varsling. |
| S-08 | P1 | Kontrolleres | Intern faktura til Tripletex | Faktura AS-WEB-2026-000004 er utstedt og sendt (16.11., forfall 23.11.) men har ingen bekreftet direkteoverføring, og er registrert ubetalt. Avklar om dette er ønsket, allerede manuelt bokført, eller skal overføres senere; sjekk først for duplikat i Tripletex. |
| S-09 | P2 | Kontrolleres | Vipps-oppgjør, Service | To gebyrbilag er bekreftet i Tripletex, men ingen registrerte Vipps-bankutbetalinger fra samme overføringsmodul. Avstem første faktiske bankoppgjør og gebyrer mot Vipps og Tripletex; 0 overføringer trenger ikke være feil. |
| S-10 | P2 | Påvist | Sikkerhet/database | Supabase varsler at funksjonen protect_vat_external_sales_file har en søkesti som kan endres. Vurder kontrollert search_path-herding med kompatibilitetstest. |
| S-11 | P2 | Påvist | Sikkerhet/innlogging | Supabase Auth-advisor angir at kontroll mot lekkede passord er deaktivert. Verifiser Auth-oppsett og vurder å aktivere funksjonen uten å låse ute eksisterende brukere. |
| S-12 | P2 | Kontrolleres | Leverandørprislister | Bygger’n har 8 991 aktive produkter sist importert 08.10.2026; Ahlsell, Byggmakker Proff, Megaflis og Optimera har foreløpig ingen importerte aktive produkter. Avklar hvilke leverandører som faktisk skal brukes og hvordan prislisten oppdateres. |
| S-13 | P2 | Kontrolleres | Personvern | Publisert erklæring er sist oppdatert september 2026, og omtaler ikke alle dagens tjenesteleverandører og integrasjoner (Vipps, Tripletex m.m.). Gjennomgå behandlingsgrunnlag, databehandlere, lagringstid, innsyn/sletting og oppdater tekst der det er relevant. |
| S-14 | P2 | Kontrolleres | Backup og gjenoppretting | Ingen verifisert dokumentasjon på gjennomført gjenopprettingstest av fakturaoriginaler, kjøpsbilag, kundedata og filvedlegg. Kontroller Supabase backup-/PITR-nivå og test kontrollert gjenoppretting uten å påvirke produksjon. |
| S-15 | P2 | Kontrolleres | Mobil-/PC-brukertest | Tidligere rapporterte kontrast- og layoutfeil har fått automatiske kodesjekker, men en full innlogget ende-til-ende-test på mobil og PC er ikke verifisert i denne gjennomgangen. Test tilbud, fakturaarkiv, betalingshandlinger, MVA-visning og lange modaler, uten utleie. |
| S-16 | P2 | Kontrolleres | Følge opp kunder | Null registrerte reelle inkassovarsler/kreditnotaer i aktuell database betyr at ny intern saksoversikt og refusjons-/purringsflyt i stor grad er kodetestet, ikke sluttprøvd på en ekte sak. Bruk kontrollerte testdata uten å sende juridiske krav. |
| S-17 | P3 | Kontrolleres | Driftskontroll | Vercel viste READY og ingen aggregerte kjøretidsfeil siste 7 dager, men dette beviser ikke at planlagte jobber, e-postvarsler og fakturagenerering kjører feilfritt hver dag. Etabler oversikt over siste vellykkede kjøring, feilstilling og eieralarm. |
| S-18 | P3 | Påvist | Kalkulator-vedlikehold | Separate standardverdier (timepris og kilometersats) og hardkodede bomtakster ligger i klientkode. Kontrollér at standardsatsene og takstene er aktuelle og at de ikke avviker fra priser/avtaler ellers i systemet; ikke endre satser uten godkjenning. |

## Observasjoner som ser riktige ut
- Siste bekreftede produksjonsdeploy var READY på revisjon 854fa0da6a54a5d39af15a10f75763d967ac68ff.
- Ingen duplikatgrupper av faktura- eller tilbudsnummer i databasen.
- Fire utstedte interne fakturaer hadde lagret original-PDF, og betalings-/kreditnotabeløp stemte med registrerte poster ved kontrolltidspunktet.
- Tre av fire interne fakturaer hadde bekreftet direktekobling og sist registrert null restbeløp i Tripletex; den fjerde er tatt opp under S-08.
- Supabase hadde RLS aktivert på samtlige undersøkte vanlige tabeller i public, og ingen public/anon-EXECUTE på undersøkte security-definer-funksjoner.
- Original-PDF for eksterne fakturaer 10035 og 10036 er bekreftet vedlagt Tripletex-bilag.
- Ingen registrerte Vercel-kjøretidsfeil i siste tilgjengelige 7-dagers rapport. Ikke det samme som full funksjonstest.

## Referanser til koden
- `app/admin/kalkulator/CalculatorClient.js`, `app/admin/arbeidsklokke/WorkClockClient.js`
- `app/api/admin/quotes/send/route.js`, `app/api/cron/quote-followups/route.js`
- `app/api/cron/invoice-review-alerts/route.js`, `lib/invoiceAdminAlerts.js`, `lib/invoicePaymentStatus.js`
- `app/api/admin/invoices/tripletex/route.js`, `app/api/admin/invoices/vat-reporting-control/route.js`
- `app/personvern/page.js`, `vercel.json`
- Supabase: `admin_development_tasks`, `quote_admin_preferences`, `material_suppliers`, `vat_tripletex_receipt_transfers`, `tripletex_direct_invoice_claims`.

## Neste arbeidsrunde
Gjennomgå hvert funn i prioritert rekkefølge etter at kartleggingen er ferdig. Dokumenter test, utbedring, produksjonspublisering og godkjenning per ID. Hold utleie adskilt.
