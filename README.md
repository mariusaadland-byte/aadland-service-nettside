# Aadland Service

Selvstendig versjon av Aadland Service-nettsiden.

## Inneholder
- Kundeside med produkter, produktvalg, handlekurv og bestilling
- Henting eller levering innen 15 km
- Egendefinert forespørsel
- Backoffice på `/admin`
- Egen admin-innlogging (ikke ChatGPT)
- Ordrestatus: Ny, Bekreftet, Under arbeid, Klar, Ferdig, Avbrutt
- Produktadministrasjon
- Supabase-database
- Valgfri e-postvarsling via Resend

## Før publisering
1. Opprett et Supabase-prosjekt.
2. Kjør `supabase/schema.sql` i SQL Editor.
3. Kopier `.env.example` til `.env.local` og fyll inn verdiene.
4. Kjør `npm install`
5. Kjør `npm run dev`

Ingen API-nøkler eller passord ligger i prosjektet.
