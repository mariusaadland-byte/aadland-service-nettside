# S-26 – Manuell betalingsregistrering og trygg engangskvittering

**22.11.2026 – gjennomført sikkerhetsutbedring av produktordre.** Gjelder manuelle betalinger som bankoverføring, kontantoppgjør og tilsvarende, **ikke Vipps eller utleie**.

## Påvist feil

Tidligere brukte `PATCH /api/admin/orders`, handling `record-paid-and-send-receipt`, en direkte `UPDATE public.orders` som skrev `payment_status='paid'`, betalingsreferanse og hele ordrebeløpet til `payment_captured_ore`. Den kontrollerte ikke at betalingen allerede var registrert eller om kvitteringen tidligere var sendt. Samme handling ble også tilbudt som **«Send betalingsbekreftelse på nytt»** etter at ordren var betalt.

Det kunne overskrive betalingsreferanse/-historikk og gi duplikate PDF-/e-postkvitteringer etter dobbeltklikk, parallell oppdatering eller avbrudd mellom databaseoppdatering og Resend. Siden Resend også kan returnere `error` uten å kaste, er et vanlig vellykket `await` heller ikke bevis på at en melding ble akseptert av leverandøren.

**Produksjonskontroll før og etter:** 4 historiske, arkiverte ordre; 3 aktive produkter; ingen registrerte manuelt betalte produktordre i dette nye journalsystemet. Ingen konkrete dobbeltbetalinger eller dobbeltutsendelser påvist. Én historisk fullført/arkivert produktordre står fortsatt `payment_status=pending`, og er **ikke** endret eller automatisk erklært betalt.

## Rettelsen

### 1. Bekreftet betaling registreres bare én gang

Ny service-role-only PostgreSQL-funksjon `record_manual_product_payment_once` låser den ekte ordren med `FOR UPDATE` og kontrollerer:
- `order_type='order'`, ikke kansellert eller arkivert;
- manuell betaling, ikke `payment_provider='vipps'`;
- `payment_status` bare `pending` eller `unpaid`, **ingen tidligere capture/refusjon/kvittering**;
- gyldig ordrebeløp over null og gyldig mottakeradresse;
- konkret betalingsreferanse eller dokumentert betalingsmåte (3–120 tegn);
- uttrykkelig bekreftelse fra en pålogget administrator med `canUpdateOrders` på at beløpet **allerede er mottatt og kontrollert** mot bank-/kontantunderlag.

Funksjonen lagrer betalingsstatus, totalt beløp, `payment_captured_at`, referanse, hvem som gjorde bekreftelsen og `queued`-kvitteringsrad i **samme transaksjon**. `manual_order_payment_receipts.order_id` er **unik**, og en helt lik gjentakelse returnerer originalhendelsen **uten å endre noe**. Forsøk på å registrere en annen referanse for samme betaling avvises. Historiske allerede betalte ordre uten S-26-journal får **ikke** fabrikkert ny betalingshistorikk eller automatisk kvittering.

**Viktig avgrensning:** Systemet kan ikke se banktransaksjonen bare fordi en ansatt bekrefter den. Knappen krever **manuell attesteringskontroll**, men er ikke automatisk bankavstemming. Eieren må se dokumentasjonen for mottatt betaling før bruk.

### 2. Kvitteringen sendes høyst én gang automatisk

Den opprinnelige kvitteringsmalen, MVA-detaljene, PDF-vedlegget og produkt/tilbudsnotatene beholdes i `lib/manualProductReceiptOnce.js`. PDF og HTML bygges med den **lagrede betalingsdatoen og referansen**, ikke nåværende tidspunkt eller et eventuelt nytt feltinnhold.

Kvitteringsjournalen har egne tilstander:
- `queued`: Betaling er sikkert lagret, **ingen sendeforsøk**. Kan sendes for første gang via egen knapp i administrasjonen. Ingen ny betaling registreres.
- `sending`: Sendeforsøk er tatt med atomisk DB-claim. Andre forespørsler får avslag.
- `sent`: Resend returnerte `data.id` uten `error`, og databasejournalen ble oppdatert. `receipt_sent_at` på selve ordren lagres i samme transaksjon.
- `needs_review`: Ukjent transportstatus/time-out eller uttrykkelig Resend-feil etter claim. **Ingen automatisk retry**.
- `reviewed_sent` / `reviewed_unsent`: Eieren har kontrollert leverandørloggen med merknad. Dette gir ingen ny utsending.

Det opprinnelige sendeforsøket krever `claim_manual_product_receipt` før Resend-kallet og bruker en stabil idempotensnøkkel **`manual-order-receipt/<journal-id>`**. Et 5xx/nettverksavbrudd etter mulig Resend-aksept gir **aldri** et automatisk nytt sendeforsøk, heller ikke etter utløpet av Resends idempotensvindu. Hvis PDF-generering, e-postkonfigurasjon eller mottakersjekk feiler **før claim**, blir den fortsatt `queued` og kan sendes én gang når feilen er avklart.

Hvis Resend aksepterte e-posten, men bekreftelsen ikke kunne lagres i databasen, forblir forsøket `sending` for **manuell kontroll** – ingen duplikatutsending. «Sendt» betyr akseptert av e-postleverandøren, **ikke bekreftet levert til kundens innboks**.

### 3. Eierens kontroll uten nytt sendeforsøk

På produktordrens betalingspanel vises en egen statuslinje for kvittering. Den gamle knappen **«Send betalingsbekreftelse på nytt»** er fjernet fra denne flyten. Kun en aldri-forsøkt `queued`-kvittering kan få en egen førstegangs-knapp.

Eier kan for uavklarte kvitteringer:
- registrere **`BEKREFTET I RESEND`**, med en faktisk Resend-ID og en konkret kontrollmerknad på minst 12 tegn;
- registrere **`IKKE SENDT`**, etter dokumentert kontroll og med en tilsvarende merknad.

Funksjonen `review_manual_product_receipt` krever at sendeforsøket er minst **5 minutter** gammelt, at statusen fremdeles er uavklart, og at ingen tidligere kontroll allerede har avgjort saken. Avstemmingen har revisjonsfelt for eier og tidspunkt. Den endrer **ikke** betalingssum/-dato og sender **ingen ny e-post**. Hvis kunden mangler bekreftelse etter en dokumentert ikke-utsending, må eier kontakte kunden og avklare egen sikker utsending; det skjer ikke automatisk.

### 4. Tilgang og trygg preview

Tabellen `manual_order_payment_receipts` har aktivert RLS, ingen direkte SELECT/INSERT/UPDATE for `anon` eller `authenticated`. Alle fem SQL-funksjonene er `SECURITY DEFINER` med tom `search_path` og EXECUTE tilbakekalt fra `PUBLIC`, `anon` og `authenticated`, og kun tildelt `service_role`. API-et krever autentisert administrator og `canUpdateOrders`, med egen **owner-only** kontroll for uavklarte sendeforsøk og eksisterende same-origin-sjekk.

Vercel-preview avviser betalingsregistrering, kvitteringsutsending og kvitteringsavstemming med **403** før noen DB-endring eller Resend-kall.

## Utført testing og gjenstående kontroll

- `scripts/sql-s26-manual-payment-receipt-rollback.sql`: **Bestått i faktisk Supabase**, syntetisk ordre. Tester avvist uten bekreftelse, første betaling, nøyaktig capture, referanselås, dobbeltklikk med samme tidsstempel, engangs kvitteringsclaim, leverandør-ID, avvist dobbel acknowledgment – **full rollback**.
- `scripts/sql-s26-manual-receipt-review-rollback.sql`: **Bestått i faktisk Supabase**, syntetisk uavklart kvittering med tidsforskøvet testclaim. Tester eiermerknad og leverandør-ID, lagret kontrollstatus, sperre mot å overskrive kontrollen – **full rollback**.
- `scripts/smoke-s26-manual-payment-receipt.mjs`: kodebasert test med mocks av serverrute/Resend/PostgreSQL, inklusive timeout, Resend `error`, PDF-feil før sending, provider accepted men DB-ack feiler, feil e-postmottaker, dobbeltklikk, endret betalingsreferanse, preview/ansattrettigheter. **Ingen ekte kunde-/bank-/Resend-forespørsler**.

**Gjenstår før full operativ godkjenning:** Kontrollert intern produktordre med dokumentert testbetaling i et egnet testmiljø, kontrollert mottak av PDF-kvittering i testinnboks, konkret utprøving av dobbeltklikk/nedetid i nettleser, og en fast rutine for gammel betaling uten S-26-journal og uavklarte sendetilstander. Eventuell ny kvittering etter dokumentert ikke-utsending må planlegges som en egen, kontrollert handling, ikke automatisk retry.

**Ingen ekte ordre, betalingshendelser, e-poster, pris-/lageroppføringer eller utleiedata ble endret under arbeidet.**
