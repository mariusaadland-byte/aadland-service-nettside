# S-29 – Kunderegistrering og varig status for bekreftelses-e-post

**25. november 2026.** Gjelder eksisterende kundeopprettelse på Min side og eventuell tilknyttet utleiekonto (samme kunderegistrerings-API).

## Opprinnelig risiko

`POST /api/customer/register` opprettet en Supabase Auth-konto og kundeprofil, sendte Resend-mail og slettet deretter Auth-brukeren hvis Resend returnerte feil eller nettverksfeil. En timeout betyr ikke nødvendigvis at e-posten ikke ble sendt. Kunden kunne derfor motta en verifiseringslenke til en slettet konto. Resend-endepunktet for ny bekreftelsesmail hadde ikke varig sendelås, og kunne sende samme lenke flere ganger ved samtidige forespørsler.

## Implementert

- **Ingen destruktiv opprydding** av nyopprettet Auth-konto ved leverandørfeil eller profile-upsert-feil. Kunden får beskjed om at kontoen er beholdt, og kan bruke den eksisterende «Send ny bekreftelsesmail»-funksjonen.
- Sikker server-side SQL-funksjon kan finne en **ubekreftet** Auth-konto fra e-post når kundeprofilen manglet etter delvis registrering. Kundeprofilen gjenopprettes uten å eksponere om en konto eksisterer i offentlige svar.
- En ny tabell `customer_verification_delivery_attempts` lagrer hver sendeforsøk med tilstander `sending`, `accepted`, `needs_review`, `reviewed_sent` og `reviewed_unsent`. Unik partiell indeks tillater bare ett uavklart forsøk per kunde. Engangsclaim låser Auth-raden før leverandørkall; akseptert e-post gir 15-minutters kjøletid før kunden kan be om en ny.
- Resend brukes med stabil `idempotencyKey: customer-verification/<attempt-id>`. Ved ukjent leverandørresultat blir forsøket markert som `needs_review`, og det skjer ingen automatisk utsending med ny nøkkel.
- Eieren får en ny fane **Styring og utvikling → Kundebekreftelser**, hvor uavklarte utsendinger kan kontrolleres mot Resend. Kontrollen krever minst fem minutters ventetid, eksplisitt valg, begrunnelse, bekreftelsestekst og faktisk Resend-ID hvis mailen er akseptert. Kontrollskjermen sender **ingen** e-post.
- Kunderegistrering og ny bekreftelsesmail er sperret i Vercel-preview / lokalt utviklingsmiljø slik at en testgren ikke bruker prod-nøkler eller skaper ekte kundekontoer.
- Ratebegrensning, e-postnormalisering, passordkontroll, samme-origin-sperre, 24-timers verifiseringslenke og eksisterende Min side beholdes. **Resend akseptert** er leverandørkvittering og ikke bekreftet levering i innboksen.

## Gjennomførte tester

- Migrasjon installert i produksjonsdatabasen.
- Isolert SQL-test med kunstig Auth-bruker, første claim, blokkert dobbeltclaim, hold etter feil, blokkert forsøk under uavklart status, eierkontroll av ikke-sendt, nytt claim, leverandør-Ack, 15-minutters kjøletid og blokkert claim etter bekreftet e-post. **Hele transaksjonen ble rullet tilbake**. Ingen testbruker eller testjournal står igjen.
- Verifisert at `anon` og `authenticated` verken kan kjøre claim-RPC eller lese tabellen; `service_role` har nødvendig utføringsrett.
- Kildebasert regresjonsskript `scripts/smoke-s29-customer-registration-delivery.mjs` kjøres i Vercel-bygget.

## Gjenstår

- Kontrollert registrering med intern testadresse på **produksjon**; bekreft e-post, logg inn, og kontroller at kundeprofilen kobles til kontoen.
- Kontroller et reelt, uavklart Resend-resultat hvis et slikt oppstår. Ikke framprovoser timeout ved å sende e-post til ekte kunder.
- Vurder en tydelig melding til kundeservice om uavklarte bekreftelser. Et uavklart sendeforsøk **blokkerer nye e-poster** til eier har kontrollert det; kontoen slettes ikke.

S-29 er ikke praktisk sluttgodkjent uten disse kontrollerte testene.
