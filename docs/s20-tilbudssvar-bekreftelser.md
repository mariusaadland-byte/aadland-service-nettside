# S-20 – Bekreftelse etter digital tilbudsgodkjenning/avslag

**Dato:** 21.11.2026. **Status:** Atomisk tilbudssvar, to uavhengige e-postbekreftelser og eieravstemming implementert og testet med syntetiske data. Reell innlogget kunde-/Resend-leveransetest er ikke gjennomført. **Ingen eksisterende kundetilbud, fakturaer, betalinger eller utleie er endret.**

## Opprinnelig funn

`POST /api/quotes/[id]` gjorde en direkte `UPDATE quotes ... status=accepted|declined` og sendte deretter to uavhengige e-poster gjennom Resend. Ingen av de to svarene fra `resend.emails.send` ble kontrollert for `result.error`. En feil kunne skje etter at kunden allerede hadde godkjent/avslått, mens serveren returnerte suksesstatus. Det fantes ikke en varig oversikt med meldings-ID, e-poststatus eller kontrollert gjenoppretting for disse to meldingene.

Ved DB-kontroll fantes **to historisk godkjente tilbud og tre kladder**, uten registrerte svar-bekreftelseslogger. Dette beviser verken at tidligere e-post ble levert eller at den feilet. Systemet lager **ingen falsk historikk og sender ikke om igjen tidligere tilbudssvar**.

## Løsningen

1. **Én atomisk operasjon for tilbudssvar og varslingskø.** Ny serverbeskyttet Supabase-RPC `record_customer_quote_response` låser statusendringen til `sent`, riktig lenkegenerasjon eller verifisert Min side-kundesession, og kontrollerer tilbudets gyldighet i norsk tid. I samme PostgreSQL-transaksjon oppdateres status og et privat outbox-element opprettes for **bedriften**, og for **kunden** hvis gyldig e-post finnes. Hvis outbox ikke kan lagres, rulles hele transaksjonen tilbake: ingen stilltiende godkjenning uten varsellogg.
2. **Separate e-poster med separat idempotens.** `quote_response_notifications` har én rad per tilbud og mottaker (`owner` / `customer`), med `queued`, `claimed`, `sent` eller `needs_review`. Resend-idempotensnøkler er `quote-response/<notice-uuid>/<attempt-number>` for å unngå dobbelt utsending. Resend aksepterer idempotensnøkler i **24 timer**, men en `claimed` eller `needs_review`-rad **forsøkes aldri automatisk på nytt**, heller ikke etter 24 timer.
3. **Kontroller faktiske Resend-svar.** Bare respons uten `error` med en ekte `data.id` regnes som bekreftet API-aksept. API-kvittering betyr **ikke garantert levering i mottakerens innboks**. Hvis Resend, nettverket eller lagring feiler, står meldingen i uavklart/claimed status og må kontrolleres før ny utsending.
4. **Gjenoppretting etter avbrutt HTTP-respons.** En separat Vercel-cron `/api/cron/quote-response-confirmations` kjører daglig klokken **10:40 UTC** og sender bare elementer som **aldri ble forsøkt sendt** (`queued`). For å unngå svært gamle meldinger uten kontroll holdes opprinnelig utsending eldre enn **sju dager** igjen for manuell avstemming. Systemet oppdaterer aldri selve tilbudsstatusen i cron.
5. **Eierbeskyttet oversikt.** I **Admin → Tilbud → åpne akseptert/avslått tilbud** vises «Bekreftelse etter tilbudssvar»: bedrift og kunde, Resend-ID, tidspunkt og status. Eieren kan avklare uvisse sendinger gjennom eksplisitt bekreftelse og begrunnelse: `BEKREFTET I RESEND` med faktisk provider-ID eller `IKKE SENDT` etter kontroll i Resend. Sistnevnte legger én ny sending i kø med en ny idempotensnøkkel – **ingen e-post sendes av selve kontrollknappen**. Alle manuelle kontroller har append-only revisjonslogg.
6. **Bedre status til kunden.** Etter godkjenning/avslag viser UI at **tilbudssvaret er lagret** selv om e-postbekreftelsen ikke er bekreftet. Ved nettverksfeil oppfordres kunden til å oppdatere/ta kontakt før nytt klikk. Et gjentatt *identisk* tilbudssvar returnerer allerede registrert status uten ny DB-endring eller e-post; motsatt svar blir avvist.
7. **Preview-sikkerhet:** Digitalt svarskriv er begrenset til Vercel-produksjon, og cron har `CRON_SECRET`. Administrativ avstemming krever eierrolle og same-origin-beskyttelse. Utleie og andre utsendingsløsninger er ikke endret.

## Datasikkerhet og databasen

Migrasjonen `supabase/migrations/20261121161500_quote_response_notices_s20.sql` inneholder:

- `public.quote_response_notifications` (privat journal/utgående sending)
- `public.quote_response_notification_reviews` (append-only manuell kontrollhistorikk)
- `public.record_customer_quote_response(uuid,text,integer,boolean)` (atomisk DB-overgang)
- `public.review_customer_quote_response_notice(uuid,text,uuid,text,text,text)` (manuell kontroll)

Begge tabeller har **RLS**; `anon` og `authenticated` har ingen tabelltilgang. Begge `SECURITY DEFINER`-funksjoner har `EXECUTE` fjernet for `PUBLIC`, `anon` og `authenticated`, og gitt eksplisitt kun til `service_role`. Loggen inneholder bare nødvendig mottakeradresse og melding-ID, aldri e-postens fulle tekst eller innholdet i kundens tilbud.

**Ingen retroaktiv oppretting:** 2 eksisterende aksepterte tilbud blir stående uten e-postlogg. Oversikten forteller at eldre sendinger ikke er bevist.

## Regresjonstester og godkjenning

`scripts/smoke-s20-quote-response-confirmations.mjs` kjører på **syntetiske data** og kontrollerer:

- To uavhengige varslingsrader, hver med egen idempotensnøkkel
- Resend-svar med `error`/manglende `data.id` gir aldri falsk «sendt»
- Uklart sendeforsøk holdes igjen og sendes ikke automatisk på nytt
- Gammel kø (>7 dager) holdes igjen for manuell kontroll
- Samme gjentatte godkjenning svarer idempotent, motsatt svar sperres
- Databasefeil ved atomisk lagring betyr at tilbudssvaret ikke skal være endret
- Fremmed kundekonto, preview og eieravstemming kontrolleres
- Ingen faktiske Resend-kall, fakturaer eller kundesvar utføres i testen

**Gjenstår før S-20 kan kalles fullstendig sluttprøvd:**
- Kontrollert ekte aksept og avslag med **en ny testkunde og testadresse**, aldri på en reell kundes økonomiske tilbud
- Verifiser at både kundens og eierens e-post faktisk vises med korrekt Resend-ID, og etterprøv levering i Resend
- Et kontrollert feilscenario med ukjent e-postutfall, der eier avstemmer uten ny godkjenning eller uforvarende dobbelt utsending
- Daglig cron-kjøring og leveranse av eventuelle køelementer kontrollert i drift; denne jobben er foreløpig **ikke integrert i S-17s overvåkingsliste på seks Service-jobber**
- Prosedyre for kunder med manglende registrert e-post og manuelt arkiv/kopi

Dette arbeidet innebærer **ingen automatisk gjenutsending av gamle historiske tilbud**. Eieren må verifisere faktisk leveranse, og må aldri velge «IKKE SENDT» uten sikre bevis i Resend.
