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
- Betalingsstatus er separat fra ordrestatus. Betalingsleverandør er ikke koblet til ennå.

## Miljøvariabler
Kopier `.env.example` til `.env.local` og fyll inn verdiene. Ikke legg hemmelige nøkler i Git.

## Database
SQL-filene i `supabase/` beskriver databasegrunnlaget og senere utvidelser. De må kjøres kontrollert i riktig rekkefølge mot Supabase før funksjoner som bruker de nye tabellene/feltene tas i produksjon.

**Ikke anta at alle SQL-utvidelser allerede er kjørt.**

## Før publisering
1. Installer avhengigheter med `npm install`.
2. Kjør `npm run build` og rett eventuelle byggefeil.
3. Sett produksjonsverdier for Supabase, sessions og Resend.
4. Kjør nødvendige SQL-oppgraderinger kontrollert mot riktig Supabase-prosjekt, inkludert `customers.sql` før Min side aktiveres.
5. Test innlogging og rettigheter i backoffice.
6. Test befaring, produktbestilling, lager/frakt og alle kunde-e-poster.
7. Test utleie for ledige og kolliderende datoer samt admin-bekreftelse.
8. Test tegninger både lokalt og med prosjektlagring.
9. Kontroller mobil og desktop, metadata, vilkår og kontaktinformasjon.
10. Først etter godkjent test merges testgrenen til `main`.

Ingen API-nøkler eller passord skal ligge i prosjektet.
