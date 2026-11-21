# S-17 – Daglig driftskontroll for Aadland Service

**21.11.2026. Status: driftslogg og eieralarm implementert i kode. Første faktiske planlagte kjøring og e-postlevering er ikke bekreftet.**

## Gjennomgått i produksjon

- Siste Vercel-produksjonsdeployment ble kontrollert som **READY**.
- Vercel rapporterte **0 aggregerte runtime-feil siste 7 dager**, men dette gir **ikke** historikk over vellykkede cron-kjøringer, og kort loggretensjon kan skjule eldre feil.
- `CRON_SECRET` og `RESEND_API_KEY` har konfigurerte verdier i produksjon. Verdiene ble ikke lest eller kopiert.
- Vercel hadde ni planlagte jobber: seks rene Service-jobber, to utleiejobber og én felles jobb for betalingskvitteringer (Service og utleie). **Den felles jobben og utleie er ikke endret.**
- Produksjon hadde **0** rader i `invoice_admin_alert_batches`, **0** i `quote_email_send_attempts` og **0** fakturaer markert `automatic_send=true`. Fravær av slike data er **ikke** bevis for at cron har kjørt eller at den har feilet; den kan ha funnet null aktuelle oppgaver.

## Nye kontroller

### 1. Varig kjørehistorikk

Følgende planlagte Service-jobber registrerer sin egen start og slutt i den nye `public.service_cron_runs`-tabellen:

| Jobb | Cron-tid (UTC) |
| --- | --- |
| Fakturaoppfølgingsvarsler | 08:00 |
| MVA-fristvarsler | 08:35 |
| Befaringspåminnelser | 09:15 |
| Oppstartspåminnelser | 09:30 |
| Tilbudsoppfølging | 10:00 |
| Planlagt fakturautsending | 10:20 |

Hver kjøring får `running`, `ok`, `warning` eller `failed`, HTTP-status og et generisk sammendrag uten navn, fakturanummer, e-postadresser eller betalingsopplysninger. En kjøring med null relevant arbeid får `ok` når serveren faktisk har svart uten feil. Kjøringer med oppgaver som krever gjennomgang blir `warning`, selv om HTTP-responsen er 200. En uavsluttet `running`-rad viser mulig timeout og skal ikke automatisk tolkes som vellykket.

Skriving til driftsloggen er **best effort**, slik at en loggfeil ikke avbryter eller gjentar fakturasendinger. Derfor beviser en manglende loggrad ikke sikkert om jobben kjørte. Kildekoden for de opprinnelige kundejobbene beholder samme autentisering og sendelogikk.

### 2. Eierbeskyttet oversikt

URL: `/admin/drift`. Finn den under **Styring og utvikling → Driftskontroll** i adminmenyen.

Siden krever `admin.role==="owner"`. Den viser dato, siste kjøring, siste dokumenterte suksess og om dagens jobb har feil/manglende registrering. Det er **kun lesing**: ingen jobber startes, ingen e-poster sendes og ingen fakturaer endres ved å åpne siden.

### 3. Ny daglig avvikskontroll

`/api/cron/service-health-alerts` kjører kl. **14:30 UTC** fra Vercel, beskyttet av `CRON_SECRET`. Fra og med **23.11.2026** sjekkes de seks jobbene etter at deres vanlige kjøringsvinduer er passert.

- Ved ingen registrerte feil/mangler sendes ingen e-post.
- Ved avvik lagres én låst varslingsrad per UTC-dag i `public.service_cron_alert_batches`. Systemet forsøker deretter én e-post til `post@aadland-service.no`, med Resend-idempotensnøkkel.
- Ukjent sendestatus blir stående `uncertain`. Den sendes **ikke på nytt automatisk**, for å unngå duplikater etter utløpt idempotens.
- En ny innføring i Vercel-cron er ikke bevis for at den faktisk kjører. Test først etter 23. november.

### 4. Datasikkerhet

Begge nye tabeller har **RLS aktivert**, alle generelle rettigheter fjernet fra `PUBLIC`, `anon`, `authenticated`; kun serverens `service_role` har `SELECT, INSERT, UPDATE`. Driftsloggen inneholder ingen kundenavn, private e-poster, fakturabeløp eller API-nøkler. Antall poster vil vokse; innfør avtalt retention/rydding hvis mengden blir stor.

## Kritiske begrensninger

- Hvis **Vercel Cron selv stopper**, kan også vakthundjobben stoppe og dermed unnlate å varsle. Ekstern overvåking fra en separat tjeneste er derfor nødvendig for uavhengig varsling.
- Ved driftsbrudd i Supabase eller Resend kan e-postvarsel utebli. Åpne Vercel-/Resend-loggene manuelt ved mistanke.
- Den blandede cron-ruten `/api/cron/payment-receipts` omfatter utleie og er **bevisst ikke instrumentert** i denne runden. Den trenger et senere Service-spesifikt opplegg uten å endre utleie.
- Kjørehistorikken forteller **ikke** om fakturaer er bokført i Tripletex, om betalingsoppgjør er avstemt eller om e-post faktisk har nådd mottakerens innboks.
- Ingen produksjonscron er kjørt manuelt under revisjonen. Ingen kunde-e-post, faktura eller betalingshandling er testutløst.
- S-14 (manglende verifisert database-/Storage-backup) står fortsatt åpen. Det er ikke laget noen backup i S-17.

## Test og godkjenning

`scripts/smoke-s17-service-cron-operations.mjs` bruker kun in-memory testdata: suksess uten arbeid, delvis feil, HTTP 503, manglende kjøring, gammel suksess etterfulgt av feil, sikker cron-autentisering, eierbeskyttet side og ingen registrering fra preview. Ingen ekstern sending.

**S-17 kan først sluttgodkjennes når**: kjøringene 23.11.2026 og etterfølgende dag faktisk har opprettet journalrader for alle seks jobber, et kontrollert feilscenario er håndtert uten kundesending, og eierens avviksvarsel er bekreftet mottatt. Eksternt uavhengig vakthold er dessuten anbefalt.

**Regel for feil:** Ikke automatisk gjenforsøk av utsendelser med uklar status. Kontroller Resend, opprinnelig faktura/oppdrag og betalingslogger først.
