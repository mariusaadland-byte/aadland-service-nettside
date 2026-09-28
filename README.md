# Aadland Service

Nettsted og backoffice for Aadland Service.

## Funksjoner
- Kundeside for tjenester, produkter, utleie og befaringer
- Valgfri kundekonto på `/min-side` med bekreftet e-post og ordre-/utleiehistorikk
- Produktvalg, handlekurv og bestilling
- Henting, lokal levering og frakt for produkter som kan sendes
- Utleie med datokontroll, blokkeringer og administrasjon
- Backoffice på `/admin` med ordre, kunder, produkter, tjenester, utleie, prosjekter og forsideinnhold
- Tegning og visualisering på `/admin/tegning`
- Supabase som database og Resend for e-post
- Betalingsstatus er separat fra ordrestatus. Vipps ePayment kan aktiveres eksplisitt etter at database, testnøkler og webhook er satt opp.

## Miljøvariabler
Kopier `.env.example` til `.env.local` og fyll inn verdiene. Ikke legg hemmelige nøkler i Git.

I Vercel må `RESEND_API_KEY` være satt i **Production** for at kundekonto, passordgjenoppretting og andre kunde-e-poster skal kunne sendes fra produksjon. Preview kan bruke `RESEND_PREVIEW_API_KEY`. `CRON_SECRET` er påkrevd i Production for at automatiske tilbudsoppfølginger og påminnelser skal kjøre; cron-rutene avviser alle kall dersom hemmeligheten mangler eller Authorization-headeren ikke matcher. Produksjonsbuilden stopper automatisk dersom Supabase-konfigurasjon, `SESSION_SECRET`, `RESEND_API_KEY`, `CRON_SECRET` eller `NEXT_PUBLIC_SITE_URL` mangler. Etter endring av en miljøvariabel må det kjøres en ny deployment.

### Vipps ePayment

Vipps er **av som standard**. Dagens manuelle betalingsflyt fortsetter helt uendret så lenge `VIPPS_ENABLED` ikke er satt til `true`.

Trygg aktiveringsrekkefølge:

1. Migreringene `20260928051633_vipps_epayment_orders.sql`, `20260928052246_vipps_webhook_registration.sql` og webhook-readiness-migreringen må være kjørt mot riktig Supabase-prosjekt.
2. Legg inn `VIPPS_CLIENT_ID`, `VIPPS_CLIENT_SECRET`, `VIPPS_SUBSCRIPTION_KEY`, `VIPPS_MSN` og `VIPPS_ENVIRONMENT=test` i Vercel **Preview**, men la `VIPPS_ENABLED=false`.
3. Aktiver **Protection Bypass for Automation** i Vercel. Preview-webhooken bruker bypass-verdien automatisk; den skal ikke kopieres til Git.
4. Åpne `/admin/vipps`, test forbindelsen og registrer webhooken. Vipps sin webhook-secret lagres automatisk i Supabase sitt private schema og vises ikke i nettleseren.
5. Når forbindelse og webhook er bekreftet, sett `VIPPS_ENABLED=true` kun i Preview og redeploy.
6. Test komplett betalingsflyt: opprett betaling, godkjenn, retur/status, backoffice-capture, automatisk kvittering/PDF, avbrutt/utløpt betaling og lagerfrigjøring.
7. Først etter godkjent test gjentas oppsettet med produksjonsnøkler og `VIPPS_ENVIRONMENT=production`. Produksjonsbuilden avviser aktiv Vipps dersom nødvendige produksjonsnøkler mangler eller miljøet ikke er `production`.

Koden viser ikke Vipps-knappen før både feature-flagget er aktivt **og** en aktiv webhook-registrering finnes i databasen. Vipps-hemmeligheter skal aldri legges i Git eller deles i chat.

## Database
SQL-filene i `supabase/` beskriver databasegrunnlaget og senere utvidelser. De må kjøres kontrollert i riktig rekkefølge mot Supabase før funksjoner som bruker de nye tabellene/feltene tas i produksjon.

**Ikke anta at alle SQL-utvidelser allerede er kjørt.**

## Supabase-produksjon

Direkte kontroll mot prosjektet `aadland-service-nettside` er gjennomført 26. september 2026:

- Alle relevante apptabeller har RLS aktivert.
- `anon` og `authenticated` har ikke vanlig SELECT/INSERT/UPDATE/DELETE-tilgang til forretningsdata.
- Kritiske `SECURITY DEFINER`-RPC-er har eksplisitt `search_path` og kan bare kjøres av `service_role`.
- `contact-images` er privat og `product-images` er offentlig.
- Rate-limit-migrasjonen `20260926005033_app_rate_limiting` er lagt inn og funksjonstestet i produksjonsdatabasen.
- Supabase Security Advisor viser fortsatt **Leaked Password Protection Disabled** fordi prosjektet ligger på Supabase Free, mens den innebygde funksjonen krever Pro eller høyere. Aadland Service kompenserer derfor server-side ved å kontrollere nye passord mot HIBP Pwned Passwords med k-anonymitet (kun SHA-1-prefix på 5 tegn sendes, med response padding). Ved senere oppgradering til Pro kan Supabase-funksjonen også slås på som ekstra lag.
- Eksisterende public-tabellgrants og kritiske `SECURITY DEFINER`-funksjoner er herdet i produksjon via migrasjon `20260926102035_harden_public_privileges_and_function_paths`. Default privileges for **fremtidige** objekter kan i tillegg strammes inn med `supabase/manual_default_privileges_hardening.sql`; Management-connectoren har ikke eierrettighet til dette.
- Advisor-meldinger om «RLS enabled, no policy» på de øvrige tabellene er forventet i dagens server-only-modell: klientroller har ikke CRUD-grants, mens serveren bruker `service_role`.

## Før publisering
1. Installer avhengigheter med `npm ci`.
2. Kjør `npm run build` og rett eventuelle byggefeil.
3. Sett produksjonsverdier for Supabase, `SESSION_SECRET`, Resend og `CRON_SECRET` i Vercel. `RATE_LIMIT_SECRET` er anbefalt som separat nøkkel, men rate limiteren bruker `SESSION_SECRET` som sikker fallback.
4. Kjør nødvendige SQL-oppgraderinger kontrollert mot riktig Supabase-prosjekt, inkludert `customers.sql` før Min side aktiveres.
5. Test innlogging og rettigheter i backoffice.
6. Test befaring, produktbestilling, lager/frakt og alle kunde-e-poster.
7. Test utleie for ledige og kolliderende datoer samt admin-bekreftelse.
8. Test tegninger både lokalt og med prosjektlagring.
9. Kontroller mobil og desktop, metadata, vilkår, kontaktinformasjon, bildeopplasting (maks 4 MB per bilde) og at cron-rutene svarer 401 uten riktig token.
10. Først etter godkjent test merges testgrenen til `main`.

Ingen API-nøkler eller passord skal ligge i prosjektet.

### Session security

Admin- og kundecookies er bundet til en roterbar `session_version` i Supabase Auth-metadata. Første deploy som innfører dette vil ugyldiggjøre eldre cookies én gang, slik at eksisterende innloggede brukere må logge inn på nytt. Ved senere passordreset roteres `session_version`, og eldre Aadland Service-sesjoner på andre enheter blir automatisk ugyldige.

