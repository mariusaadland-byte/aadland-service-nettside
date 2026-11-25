# S-30 – Service-Vipps: sikker capture, kansellering og refusjon

**25. november 2026.** Omfatter kun den generiske adminruten når `unit=service`. Utleie er holdt utenfor kontrollen; faktura-Vipps har separat refusjonsflyt og er ikke endret.

## Påvist teknisk risiko

Før S-30 sendte `POST /api/admin/vipps-payment` Vipps-handlinger uten varig lås. `lib/vippsClient.js` kan produsere en ny tilfeldig `Idempotency-Key` for hvert kall når det ikke gis noen nøkkel. Et dobbeltklikk eller en nettverksfeil kunne dermed gi to ulike betalingstransaksjoner dersom beløp fortsatt lå innenfor aggregert rest. **Ingen faktisk dobbelt belastning eller refusjon er påvist.** En leseforespørsel i produksjonsdatabasen 25.11.2026 viste 0 Service-ordrer med `payment_provider=vipps`.

## Rettet

- `vipps_service_action_attempts` holder uforanderlig `request_id`, ordrekobling, eksakt Vipps-referanse, type, beløp, idempotensnøkkel og status. En unik indeks tillater bare én uavklart handling per ordre, uansett om den startet i et annet nettleservindu eller på en annen Vercel-instans.
- `claim_vipps_service_action` låser `orders`-raden i databasetransaksjonen. Den avviser ugyldige beløp, andre ordres betalinger, gjenbruk av samme brukerintensjon og ny handling når en tidligere er `sending` eller `needs_review`.
- Etter leverandøraksept sperres samme type handling med samme beløp i 15 minutter. Dette er en konservativ beskyttelse mot nye klikk etter tapt HTTP-svar; reelt forskjellige beløp/handlinger kan gjennomføres når ingen uavklart handling finnes.
- Vipps får eksplisitt stabil nøkkel `s30-<attempt UUID>` (40 tegn) fra databasen. En ny tilfeldig nøkkel kan ikke oppstå for samme forsøk. Dette samsvarer med Vipps sitt `Idempotency-Key`-krav, men nøkler alene erstatter ikke varig lokal sendelås.
- Bekreftet Vipps-aksept journalføres **før** statusoppdatering, ordresynkronisering og e-post. Hvis selve statushentingen eller ordresynkroniseringen feiler etter aksept, får eieren beskjed om ikke å utføre handlingen på nytt.
- Ved nettverkstimeout, ukjent leverandørrespons eller uklar journalføring markeres forsøket `needs_review`. Ingen automatisk ny økonomisk handling gjøres.
- Eieren har fanen **Styring og utvikling → Vipps Service – kontroll**. Her kan vedkommende lese betalingen og Vipps-hendelser, kontrollere resultatet og dokumentere det med faktisk referanse, begrunnelse og eksplisitt bekreftelsestekst. Kontrollsiden flytter **ikke penger**.
- Vipps Service-justeringer er sperret i preview/testmiljø. Statussynkronisering videreføres. Eksisterende utleiegren er uendret.

## Tester

- Migrasjon lagt inn i produksjonsdatabasen. SQL-test laget en syntetisk ordre med Vipps-referanse, kontrollerte første claim, duplikat/replay, samtidig capture under refund, hold etter timeout, sperre ved uavklart forsøk, eieravklaring, sikkert nytt forsøk, ACK, sperre mot umiddelbart identisk refund og referansemismatch. **Alt ble rullet tilbake i én transaksjon**. Ingen reelle Vipps-kall ble gjort.
- RLS og rettigheter verifisert: `anon` og `authenticated` kan verken lese journalen eller kalle claim-RPC; `service_role` kan utføre den.
- `scripts/smoke-s30-service-vipps-action-once.mjs` tester de konkrete API-grenene med mock: én leverandørhandling, ACK før statushenting, blokkert duplikat, blokkert uavklart forsøk, håndtert provider-timeout og ack-feil, stopp ved feil i databaselås, preview-sperre og admin-tilgang.
- Teknisk byggtest og produksjonsstatus må dokumenteres etter Vercel `READY`.

## Gjenstår før sluttgodkjenning

Kontrollert Service-Vipps-transaksjon med intern testbetaling, tilsvarende kontrollert capture og refusjon samt reell avstemming mot Vipps-oppgjør og bank. **Ikke bruk ekte kundepenger som testdata.** Eiers gjennomgang av kontrollsiden på mobil/PC gjenstår. Dette punktet er teknisk utbedret, men ikke økonomisk sluttverifisert.
