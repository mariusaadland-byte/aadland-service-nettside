# S-25 – Idempotente bestillinger, lagerreservasjoner og Vipps

**22. november 2026 – teknisk utbedring.** Gjelder produktbestillinger og kontaktforespørsler i Aadland Service, **ikke utleie**. Reelle kunder, betalinger, eksisterende ordre, kundemeldinger eller pris-/lagertall er ikke endret.

## Påvist risiko

Før utbedringen genererte `POST /api/orders` nytt ordrenummer og reserverte lager for **hvert HTTP-forsøk**. Nettverkstimeout eller dobbeltklikk kunne derfor skape to separate ordre og reservere lager to ganger. `sending`-tilstand i klientens React-knapp alene kan ikke garantere idempotens – nettleseren kan gå ned eller samme forespørsel kan komme på nytt.

I tillegg kunne en tvetydig feil fra `createVippsPayment` føre til at ordren ble kansellert og lageret frigitt, selv om leverandøren kanskje hadde akseptert betalingen. Det er farlig å automatisk opprette en ny ekstern betaling uten å kontrollere den første.

Kontroll før utbedring: 4 arkiverte ordre, 3 aktive produkter som bestillingsvarer, 0 aktive lagerførte varer og 0 registrerte Vipps-produktordre. Det finnes **ikke bevis** for at en kunde faktisk ble dobbeltbelastet.

## Løsning

### 1. Samme bestillingsnøkkel ved gjentakelse

- Produkt- og kontaktformularene oppretter en tilfeldig **UUIDv4**. Den samme nøkkelen beholdes på nytt forsøk med uendret innhold; produktformularen lagrer **bare en SHA-256-fingeravtrykkverdi og den tilfeldige nøkkelen** i nettleserens sessionStorage i maksimalt 24 timer (med fallback i minne dersom lagring ikke fungerer). Ingen personopplysninger lagres i dette lageret.
- Kontaktskjemaet beholder også **opplastingskvitteringene fra S-21 i minnet**, slik at et nytt HTTP-forsøk ikke trenger å laste opp bildene på nytt.
- Klienten låser innsending i minnet for å forhindre dobbeltklikk før React har oppdatert knappen.
- `lib/orderIntent.js` validerer UUIDv4 på serveren og regner ut SHA-256 over et deterministisk sortert JSON-innhold (uten nøkkelen). Endret bestillingsinnhold under samme nøkkel avvises med **409**, aldri behandlet som samme vare-/kundeordre.
- Nye `POST /api/orders` krever klientnøkkelen. Et gammelt åpent checkout-vindu kan få beskjed om å oppdatere siden. Forhåndsvisning på Vercel avviser alle bestillingsskriv for å unngå at testtrafikk lager ekte kundeordre, også dersom preview skulle dele produksjonsdatabasen.

### 2. Atomisk deduplisering i PostgreSQL

Migrasjonen `supabase/migrations/20261122015000_s25_service_order_idempotency.sql` legger til nullable `checkout_request_key` på eksisterende ordre, en unik indeks og et serverlagret `checkout_request_fingerprint`. Eksisterende ordre er uendret og har null i de nye feltene.

Den nye `public.create_service_order_once`-RPC er **service-role-only** og bruker `pg_advisory_xact_lock` på nøkkelen. I samme database-transaksjon:

1. Finner og returnerer den allerede registrerte ordren hvis nøkkel og innhold er identisk – uten å endre lager, bilder, priser, status eller betalingsdata.
2. Avviser samme nøkkel med forskjellig innhold.
3. For nye lagerførte ordre: kaller eksisterende `create_order_with_stock` fra S-22, slik at lagerfradrag skjer én gang og ikke kan overselge.
4. For nye kontaktforespørsler: kaller eksisterende `create_custom_order_with_contact_images` fra S-21, slik at engangskvittering for privat bilde brukes **én gang**.
5. For nye bestillingsvarer uten lager: oppretter én ordre i transaksjonen.
6. Oppretter lenken mellom ny ordre og den uforanderlige bestillingsnøkkelen før COMMIT.

Den unike indeksen forsvarer mot feil selv om to transaksjoner skulle konkurrere. Alle nyopprettede ordre får ett opphav; eksisterende historiske ordre blir ikke bakoverkonvertert.

Serveren gjør en oppslagskontroll på nøkkelen **før** produktsjekk, pris, lagerstatus og Vipps-readiness – slik at en gyldig gjentakelse fremdeles returnerer den originale ordren når varen eller lagerbeholdningen har endret seg etter første kjøp.

### 3. Ekstern Vipps-sideeffekt: separat engangskrav

Den nye `claim_service_order_vipps`-funksjonen lar bare én prosess endre `not_started → creating` for den samme lagrede ordren. **Bare prosessen som fikk claim** får kalle `createVippsPayment`.

Ved vellykket respons lagrer `complete_service_order_vipps` returnert Vipps-URL, PSP-referanse og `ready` **atomisk**. En gjentakelse kan da få samme URL og ordrenummer, ikke ny Vipps-betaling. Dersom betalingen allerede er autorisert eller betalt, returneres i stedet beskjed om at betalingen er behandlet, ikke en ny betalingslenke.

Ved en tvetydig timeout, feil eller avbrudd holdes originalordre, betalingsreferanse og lagerreservasjon. `creating` / `needs_review` **starter aldri en ny Vipps-forespørsel automatisk**, uansett hvor lenge det er siden. Kunden får en forklaring og henvisning til Min side / bedriften. Resend-utsending av ordrebekreftelse skjer bare på den **første** nye ordren, ikke på replay; manglende bekreftelses-e-post etter prosessavbrudd må avklares separat.

En forsinket eller uavklart Vipps-respons kan medføre at lager blir reservert uten fullført betaling. Det er et **bevisst fail-closed-valg** for å unngå mulig dobbel betaling. Manuell avstemming og eventuell frigivelse etter verifisert Vipps-status er åpent driftsarbeid i S-30/S-26. Aldri opprett ny betaling kun fordi en HTTP-forespørsel feilet.

### 4. Retur og feilmeldinger

- Identisk manuelt kjøp eller forespørsel: HTTP 200 med opprinnelig ordrenummer og `alreadyRecorded:true`, **ingen ny e-post eller lagerendring**.
- Vipps-kjøp der original checkout er klar: HTTP 200 med samme opprinnelige redirect-URL.
- Vipps-kjøp under behandling/med uavklart status: HTTP 202 med opprinnelig ordrenummer, informasjon om at kunden **ikke må betale eller bestille på nytt**.
- Samme nøkkel med endrede opplysninger: HTTP 409. Kunden må kontrollere bestillingen i stedet for å bruke nøkkelen på nytt.
- Ingen sikker nøkkel: HTTP 400, uten ordre.

## Tester og resterende kontroll

**Supabase produksjon – kun syntetisk, fullt tilbakeført SQL-test** i `scripts/sql-s25-order-idempotency-rollback.sql`:
- Første lagerordre med 2 av 3 varer registreres; identisk oppdrag returnerer samme ordre og lager blir 1, ikke -1.
- Endret fingeravtrykk med samme nøkkel avvises.
- Vipps-krav kan bare tas én gang, og godkjent redirect/PSP kvitteres uten eksternt Vipps-kall.
- Oversalg avvises, og samme kontakt- og bildekvittering gir samme registrerte forespørsel.
- Hele transaksjonen rulles tilbake, og antall produkter, ordre og bildekvitteringer er uendret.

`scripts/smoke-s25-order-idempotency.mjs` tester tilsvarende med syntetisk databasmock og simulert Vipps, samt feilrespons, samtidig dobbeltklikk, ID-konflikt, nettverksavbrudd og preview-sperre. S-21 og S-22 eldre regresjonstester er tilpasset til det nye atomiske omslags-RPC-et, og alle testes i bygg.

**Gjenstår:**
1. Kontrollert ekte nettleserflyt med intern testadresse og syntetisk/tillatt testbetaling, aldri ekte kundebelastning. Simuler to samtidige klikk og en mistet HTTP-respons uten å opprette dobbel ordre.
2. Verifiser at to forskjellige legitime bestillinger fortsatt får ulike nøkler og registreres hver for seg.
3. Avklar ekte Vipps-status for `creating`/`needs_review` før lager frigjøres, og vis uavklarte checkout-er i eierens driftskontroll. Ingen automatisk ny betalingsoppretting eller betalingstest mot produksjon.
4. Bekreft faktisk levering av kunde-/eierbekreftelser via Resend. SMTP/Resend-aksept er ikke det samme som levering til innboksen.
5. Ved reload/annet device, eller etter lagringstidens utløp, kan en ny klientnøkkel opprettes. Kunden bør da kontrollere Min side eller kontakte bedriften før ny ordre. Idempotens gjelder **samme UUIDv4-intent**, ikke automatisk sammenslåing av alle senere ordre med samme produkter.
6. S-26 (manuelt registrert betaling og kvittering) kontrolleres separat. Utleie er urørt.

**Ingen ekte Vipps-forespørsler, ordre, produktpriser, lagerbeholdninger, kundemeldinger, kundebilder eller utleie endret som del av denne rettelsen.**
