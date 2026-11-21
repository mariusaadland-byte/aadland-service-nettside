# Aadland Service – systemkontroll uten utleie
Opprettet 21.11.2026. Løpende funnliste. **S-01 er teknisk rettet og produksjonsverifisert, men venter på siste manuelle kontroll av brukergrensesnittet. S-02 til S-35 er ennå ikke utbedret.** Utleiedelen holdes utenfor. De 36 tidligere avsluttede utviklingsoppgavene beholdes uendret.

## Arbeidsmåte
- Hvert funn får en stabil ID. Nye funn føyes til denne samme filen.
- Prioritet: **P1** = risiko for økonomifeil, dobbeltutsending eller feil regnskap; **P2** = sikkerhet, dokumentasjon eller driftssikkerhet; **P3** = forbedring/vedlikehold.
- Dokumentasjon: **Påvist** = demonstrert ved kode eller database; **Kontrolleres** = krever reell avstemming, konfigurasjon eller brukertest. Påvist kodefeil er ikke bevis på at en kunde allerede er rammet.
- Status: **S-01: teknisk ferdig, produksjonsverifisert, avventer brukerens UI-godkjenning.** S-02–S-35: **IKKE BEHANDLET**. Kartleggingen i seg selv endret ikke priser eller regnskap; S-01-utbedringen er dokumentert i loggen nedenfor.

| ID | Prioritet | Type | Område | Funn / hva vi skal gå gjennom |
| --- | --- | --- | --- | --- |
| S-01 | P1 | Teknisk rettet – UI-test gjenstår | Prising og materialer | **21.11.2026:** Bedriftens 15 % er nå kilde for nye kalkyler og leverandører uten egen overstyring. Kalkulatoren beholder gamle lokale verdier uten tvangsendring, og tilbyr «Bruk bedriftens standard». Seks leverandører arver bedriftens sats i produksjonsdatabasen. Eksisterende tilbud, fakturaer og varepriser er uendret. PR #177, produksjon READY, database migrert og testet. Gjør siste praktiske nettleserkontroll før endelig godkjenning. |
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


| S-19 | P2 | Påvist | Tilbudslenker / personvern | `lib/quoteLinks.js` oppretter en HMAC-lenke uten tidsstempel eller revokering; `GET /api/quotes/[id]` returnerer fortsatt tilbudsdetaljer med gyldig lenketoken selv etter utløpt gyldighet. Dette er ikke en gjettbar offentlig URL, men vurder tidsstyring, revokering og trygg kundehistorikk for videresendte/utgåtte lenker. |
| S-20 | P2 | Påvist | Bekreftelse etter tilbudsaksept | Kundens godkjenning/avslag lagres før bekreftelses-e-post sendes. Koden kontrollerer ikke `Resend.errors` for disse to sendene og logger ingen varig leverings-/retry-status; feil kan bety at kunden ikke får bekreftelse selv om saken er godkjent. Legg til pålitelig varsling med idempotens, uten dobbel godkjenning. |
| S-21 | P2 | Påvist | Kontaktbilders slettinger | `DELETE /api/contact-images` krever samme opprinnelsesdomene, men ingen bruker-/eierskapsautentisering eller kvittering for at innringer eier den private filreferansen. Kjent filreferanse kan derfor brukes til å slette bildet. Design trygg opplastingskvittering/eierbinding og tidsbegrenset opprydding uten å slette andres materiale. |

| S-22 | P2 | Kontrolleres | Produkter, lager og ordre | Tre produkter er aktive, men de fire registrerte produkt-/serviceordrene er alle arkivert. En avsluttet arkivordre står med `payment_status=pending`, uten registrert Vipps-innbetaling; kan være en gammel test. Kontroller full reell kjøpsflyt, reservasjon/lager, bekreftelse, levering, betaling, refusjon og historikk med testordre uten å belaste en kunde. Ikke endre arkiverte historiske oppføringer før formålet er avklart. |


| S-23 | P1 | Påvist | Tegninger / ansattrettigheter | `POST`, `PATCH` og `DELETE /api/admin/project-drawings` bruker samme adgangsvilkår som lesing: `canManageProducts` **eller** `canViewOrders`. En fremtidig ansatt med kun visning av ordre kan dermed endre eller slette tegninger. Del lese- og skriverettigheter og test rollegrenser. De tre eksisterende administratorene har utvidede rettigheter; ingen kjent hendelse er påvist. |
| S-24 | P2 | Påvist | Automatiske befaring-/oppstartspåminnelser | `/api/cron/survey-reminders` og `/api/cron/job-reminders` nullstiller sendemarkøren etter uavklart e-postfeil uten stabil Resend-idempotensnøkkel. En omplanlegging under jobben kan også kreve mer presis dato-/statuskontroll. Test mot simulert timeout og endret tidspunkt; ingen aktive oppdrag utløser nå disse jobbene. |
| S-25 | P1 | Påvist | Bestillinger og lager | `POST /api/orders` genererer nytt ordrenummer for hvert forsøk og har ingen transaksjonsbasert idempotensnøkkel for klientens gjentatte forespørsel. Et dobbeltklikk, timeout eller nettverksretry kan opprette dobbel ordre/reservere lager på nytt. Behold lagertransaksjon, men legg til trygg ordre-identitet og replay-kontroll. |
| S-26 | P1 | Påvist | Manuelt betalte produktordre | `record-paid-and-send-receipt` i `app/api/admin/orders/route.js` oppdaterer ordre til `paid` og sender kvittering uten kontroll på at ordre ikke allerede er registrert betalt, eller sikring mot et gjentatt klikk. Må verifisere betalingen og låse hendelsen idempotent uten å miste historikk. Ingen påvist dobbeltbetaling. |
| S-27 | P2 | Påvist | Oppdragsplanlegging og e-post | `POST /api/admin/jobs/plan` lagrer ny plan **før** e-postutsending, men kan få uavklart sendestatus ved timeout eller feil når `job_confirmation_sent_at` lagres. Mangler dokumentert idempotensnøkkel. Sikre status etter retry og avtalte endringer før ny utsending. |
| S-28 | P3 | Kontrolleres | Publisert innhold | Produksjonsdatabasen har 0 registrerte tjenester og 0 publiserte referanseprosjekter; prosjektgalleriet viser derfor «Ingen prosjekter publisert ennå». Noen tjenestesider har statisk fallback. Avklar hva som skal vises, kvalitetssikre tekst, bilder og om lenker peker til aktivt innhold. |
| S-29 | P2 | Påvist | Kunderegistrering / e-post | `POST /api/customer/register` sletter nyopprettet Auth-bruker ved uavklart feil fra verifiserings-e-posttilbyderen. Dersom e-posten faktisk ble levert, kan kunden få bekreftelseslenke til en slettet konto. Innfør varig registrerings-/sendestatus og sikker gjenutsending fremfor destruktiv håndtering av usikre svar. |


| S-30 | P1 | Påvist | Vipps for Service: belastning og refusjon | Generisk `POST /api/admin/vipps-payment` utfører `capture/cancel/refund` uten en vedvarende handlingslås. Når ingen nøkkel gis, lager `lib/vippsClient.js` en **ny tilfeldig idempotensnøkkel** per kall; samtidige forsøk kan derfor få forskjellige nøkler. Innfør låst handling, entydig nøkkel per forsøk og avstem mot leverandør etter timeout. Faktura-Vipps har separat deterministisk refusjonsnøkkel; det er ikke påvist en dobbel transaksjon. |
| S-31 | P2 | Påvist | Testmiljø og kunde-e-post | Flere sendeflyter bruker `RESEND_PREVIEW_API_KEY || RESEND_API_KEY` i preview, og mottaker hentes fra reelle kundedata. Hvis testnøkkel mangler, kan forhåndsvisning sende via produksjonsnøkkel til en ekte kunde. Innfør tydelig sperre eller trygt testmottakerregime før videre testarbeid. |
| S-32 | P3 | Kontrolleres | Vipps: offentlige statusendepunkter | `GET /api/vipps/payment-status` kan ved vanlig statusoppslag også trigge kvitterings- eller refusjons-e-post via underliggende «send if needed»-funksjoner. Det er ratebegrensning og dedupliseringshjelpere; kontroller at anonyme gjentatte oppslag ikke kan skape unødvendige utsendinger eller utilsiktede leverandørkall. |
| S-33 | P2 | Påvist | Ordrebekreftelser | `POST /api/orders` kan returnere vellykket ordre med `confirmationSent=false` når e-post feiler, og setter bare `confirmation_sent_at` etter registrert send. Det finnes manuell resend i admin, men ingen bekreftet automatisk gjenoppretting for ordinære manuelle produktordre. Legg til varsling til eier / synlig usendt-oversikt og sikker retry. |
| S-34 | P3 | Kontrolleres | Databaseytelse og indekser | Supabase performance-advisor rapporterer ni fremmednøkler uten dekkende indeks (åtte uten utleie) og 43 indekser uten registrert bruk. Vurder reelle spørringer og framtidig datavolum; **ikke** slett indekser bare fordi de ennå ikke er brukt. |
| S-35 | P3 | Påvist | Min side: historikk ved vekst | `GET /api/customer/me` begrenser ordre, tilbud og annen historikk til blant annet 100 rader per kategori, uten synlig paginering. I dagens lille datamengde er det ikke et problem, men ved vekst kan eldre registreringer bli usynlige. Legg til sidetall og tydelig totalantall. |

## Observasjoner som ser riktige ut
- Siste bekreftede produksjonsdeploy var READY på revisjon 854fa0da6a54a5d39af15a10f75763d967ac68ff.
- Ingen duplikatgrupper av faktura- eller tilbudsnummer i databasen.
- Fire utstedte interne fakturaer hadde lagret original-PDF, og betalings-/kreditnotabeløp stemte med registrerte poster ved kontrolltidspunktet.
- Tre av fire interne fakturaer hadde bekreftet direktekobling og sist registrert null restbeløp i Tripletex; den fjerde er tatt opp under S-08.
- Supabase hadde RLS aktivert på samtlige undersøkte vanlige tabeller i public, og ingen public/anon-EXECUTE på undersøkte security-definer-funksjoner.
- Original-PDF for eksterne fakturaer 10035 og 10036 er bekreftet vedlagt Tripletex-bilag.
- Innlogging for administrator har ratebegrensning i `app/api/auth/login/route.js` (10 forsøk per 15 minutter), og publikum kan bare laste opp kontaktbilder med kontroll av type, størrelse og filsignatur.
- Resend-kontoens aggregerte leveringsmetrikker for 01.–21.11.2026 viste 30 sendt og 30 levert, uten rapporterte bounce/feil. Dette verifiserer ikke spesifikt hver tilbudsutsending og dekker ikke uregistrerte sendeforsøk.
- Ingen registrerte Vercel-kjøretidsfeil i siste tilgjengelige 7-dagers rapport. Ikke det samme som full funksjonstest.
- Alle 18 aktive kjøpsbilag har en lagret originalfil; 7 er PDF, de andre er andre filtyper. De to registrerte betalte faktura-Vipps-betalingene har begge kvittering sendt, og de 2 kansellerte har ingen manglende kvittering.
- Alle fire eldre ordrene er arkivert, og lageret på de tre aktive produktene har ingen negative lagerantall. I privat kontaktbilde-bucket var det 0 filer ved kontrollen.
- Begge Vercel-domenene for hovednettsiden er verifisert, og DNS rapporteres riktig konfigurert. Eksternt web-crawl ga gammelt/inkonsistent svar og er ikke brukt til å påstå nedetid.

## Referanser til koden
- `app/admin/kalkulator/CalculatorClient.js`, `app/admin/arbeidsklokke/WorkClockClient.js`
- `app/api/admin/quotes/send/route.js`, `app/api/cron/quote-followups/route.js`
- `app/api/cron/invoice-review-alerts/route.js`, `lib/invoiceAdminAlerts.js`, `lib/invoicePaymentStatus.js`
- `app/api/admin/invoices/tripletex/route.js`, `app/api/admin/invoices/vat-reporting-control/route.js`
- `app/personvern/page.js`, `vercel.json`
- `lib/quoteLinks.js`, `app/api/quotes/[id]/route.js`, `app/api/contact-images/route.js`
- Supabase: `admin_development_tasks`, `quote_admin_preferences`, `material_suppliers`, `vat_tripletex_receipt_transfers`, `tripletex_direct_invoice_claims`.


## Kartlegging avsluttet – 21.11.2026

**Avsluttet for statisk kode- og konfigurasjonskontroll; ikke godkjent som full ende-til-ende driftstest.** S-01 er nå teknisk rettet og produksjonsverifisert (manuell UI-godkjenning gjenstår); S-02–S-35 står fortsatt til behandling. Utleie og de 36 tidligere lukkede utviklingsoppgavene er urørt.

Områder dekket:
1. Administrator-API: inventar over 90 administrative ruter uten utleie, med nærmere kontroll av sentrale lesings-, endrings- og pengetransaksjonsruter samt sikkerhet og tilgangsroller.
2. Offentlige og kundevendte API-er: pålogging, registrering, bekreftelser, passordreset, Min side, tilbudslenker og digital aksept, bestilling, produkter, katalog, Vipps-status og kontaktopplasting.
3. Salg og prosjekt: kostnadskalkulator, materialpåslag og leverandørkatalog, tilbud, revisjoner, konvertering til oppdrag, befaring, planlagte oppstarter, arbeidstimer, tegninger, prosjekter og statisk nettsted.
4. Økonomi: faktura og PDF, purring/inkasso, kreditnota, manuelle betalinger og Vipps, Tripletex-overføringer og avstemming, MVA-bilag, e-bilagsleveranse og terminkontroll.
5. Drift: Vercel-produksjonsdeploy, sikkerhets- og helseadvisors fra Supabase, offentlig/privat objektlagring, 7-dagers aggregert kjøretidsfeilrapport, Resend leveringsstatistikk, planlagte jobber, domenekonfigurasjon, personvern og backup-behov.
6. Datakvalitet: fakturaoriginaler, betaling og kreditering, dobbeltføringsmarkører, ordre-/tilbudsstatuser, kundekoblinger, lagerantall, kundekontakter og publiserte tegninger. Ingen slettinger, nye fakturaer, reelle betalingskall eller test-e-poster ble utført.

Funnene er dokumenterte kode-/dataavvik eller tydelig merket som *kontrolleres*. En innlogget nettlesertest på PC og mobil, praktiske tester av alle forretningsprosesser, betalinger, kunde-e-post og faktisk bokføring/gjenoppretting forblir **testpunkter** på denne listen, ikke dokumentasjon på at alt fungerer. Reell ekstern tilgjengelighet kunne ikke verifiseres via nettleseinnhenting, mens domenene var verifiserte og Vercel deploy READY. Klare systemtester må utføres trygt punktvis ved utbedring.

### Siste kontrollresultater
- Supabase health: 0 alarmer. Security: 2 advarsler (databasefunksjons søkesti, Auth lekkede passord), dessuten informasjonsmelding om RLS uten policy på tabeller som kan være bevisst service-only. Ytelse: 9 uindekserte FK totalt, 43 ubrukte indekser.
- Vercel aggregert feilrapport siste 7 døgn: 0 rapporterte kjøretidsfeil; **ikke** en garanti mot feil i løsningen.
- Datakvalitet: 0 dublettgrupper i administratorkundens e-post og kundeprofilenes e-post, 0 publiserte tegninger uten koblet kunde, 0 aksepterte tilbud uten oppdrag, 0 negative beholdninger, 0 betalte faktura-Vipps-transaksjoner uten kvittering.
- Resend 01.–21.11.2026: 30 sendt, 30 levert, ingen rapporterte feil/bounces i samlet statistikk.
- Den eksisterende utviklingsplanen står fortsatt på 36 `done` og 1 `test` (utleie). Auditten er **ikke** en attestasjon av alle 36 ferdige funksjoner.

### Anbefalt gjennomgang etter kartlegging
Rekkefølge: tilgang til tegninger (S-23), betalings/idempotens for Vipps og ordre (S-30, S-25, S-26), tilbudsutsending (S-02, S-03), prising (S-01), fakturavarslinger og faktisk Tripletex/MVA-avstemming (S-04 til S-08), og så øvrige sikkerhets-/kundetest-/driftspunkter. For hvert punkt: verifiser risiko, lag test, rett i egen gren, kontroller i preview uten ekte kundeutsending, publiser og godkjenn.


## Kontrollrunde 2 – gjennomgått 21.11.2026
- Kartlagt alle 90 ikke-utleierelaterte administrator-API-ruter på filtre og gått gjennom konkrete endepunkter for tegninger, tjenester, prosjektgalleri, lager/ordre, kundekonto, oppdragsplan, befaring-/oppstartspåminnelser og autorisasjon. Ingen produksjonskall som sender e-post eller oppretter betaling er utført.
- Databasen har 2 private tegninger og 0 publiserte tegninger, 4 registrerte kundeprofiler, 7 kundekontakter og 3 aktive produkter. Sikkerhetsfeilen ved tegningsrettigheter er i koden, ikke en påvist uautorisert endring.
- De fire utstedte interne fakturaene har registrert utsendingstid, original-PDF, ikke-negative beløp og gyldige datointervaller.

## Utbedringslogg

### S-01 – 21.11.2026: Teknisk ferdig, klar for UI-godkjenning
- PR: https://github.com/mariusaadland-byte/aadland-service-nettside/pull/177 ; squash main `06b5375c6dab78b04e632af16b092bdbff0d1f9d`.
- Vercel produksjonsdeploy `dpl_4VMkZiUpPqDCodk6QixSfxMe9jr6`: READY. Egen automatisert test `scripts/smoke-shared-material-markup.mjs` samt eksisterende testpakke og Next.js-build bestod i forhåndsvisning og produksjon.
- Database: migrasjon `material_supplier_company_default_20261121` anvendt (svar: success), kolonnen kan være NULL = bedriftens sats. Alle seks gamle globale 20 %-standarder er satt til arvet standard, ikke individuell overstyring. Verifisert at samtlige seks har effektiv sats 15,00 %.
- Før/etter-kontroll: 5 lagrede tilbud, tilbudssum 33 973 713 øre, 8 992 materialprodukter og sum lagrede særskilte salgspriser 1 436 øre er uendret. Ingen e-poster, betalinger eller fakturaer opprettet.
- Ny funksjon: prislisten starter på bedriftens standard, kalkulatoren henter satsen fra sentrale tilbudsinnstillinger, gamle lokalt valgte verdier bevares, leverandører kan ha selvstendige overstyringer inklusive 0 %, og leverandør kan tilbakestilles til bedriftens standard.
- **Manuell UI-test:** Åpne /admin/kalkulator og bekreft at en ny/nullstilt kalkyle bruker 15 %. Trykk «Bruk bedriftens standard» ved eventuell gammel lokal 20 %-kalkyle. Åpne tilbud og søk materialer: bekreft 15 % på valgt leverandør; test eventuelt en midlertidig egen sats og tilbakestilling med «Bruk bedriftens standard». Ingen lagrede kundetilbud skal endre totalsum. Endelig godkjenning først når skjermvisningen er kontrollert.

## Neste arbeidsrunde
Gjennomgå hvert funn i prioritert rekkefølge etter at kartleggingen er ferdig. Dokumenter test, utbedring, produksjonspublisering og godkjenning per ID. Hold utleie adskilt.
