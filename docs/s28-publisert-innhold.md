# S-28 – Offentlig innhold, tjenester, referanseprosjekter og lenker

**Kontroll 25.11.2026.** Omfang: Aadland Service sin offentlige side, ikke utleieadministrasjon, regnskap eller ekte kundedata.

## Datagrunnlag

Lese-kontroll av produksjonsdatabasen (`services` og `projects`):

- **0 registrerte tjenester**, **0 aktive tjenester**.
- **0 referanseprosjekter**, **0 publiserte** og **0 fremhevede** prosjekter.
- Derfor finnes ingen faktiske prosjektbilder eller brukerskapte tjenestebilder å verifisere i denne kontrollen. Fravær av poster er ikke en feil i bilderenderingen.

## Kontrollerte funn og teknisk retting

1. Forsiden viser et statisk basisutvalg når det ikke finnes publiserte tjenester. Kodeutvalget har seks service-/produkt-/befaringskort; tre av dem har egne reelle undersider: `/tjenester/renovation`, `/tjenester/outdoor` og `/tjenester/maintenance`. Tidligere var de registrert `hasPage:false`, og «Les mer» pekte til samme kort. **Rettet** slik at eksisterende side åpnes.
2. En redigert tjeneste uten egen side og uten tilpasset lenke skal ikke få en «Les mer»-knapp som sender brukeren tilbake til seg selv. **Rettet** til en direkte befaring-/kontaktlenke med beskrivende knappetekst.
3. `/api/services` returnerte bare aktive og datomessig publiserte tjenester. Dersom alle tjenester var skjult, ga et tomt svar den samme hardkodede fallbacksamlingen. **Rettet** ved at offentlig API returnerer `configured`, slik at fallback brukes bare når ingen tjenester er opprettet. Tjenestedetaljer får samme publiseringskontroll.
4. Når forsiden skjuler tjenestekortene, skal den ikke fortsette å lenke internt til en seksjon som ikke finnes. **Rettet** nav/hero/service-strip. Lenken «Se alle tjenester» var egentlig en lenke til befaring, og er nå tydelig merket «Be om gratis befaring».
5. Forside- og gallerititler varsler nå at tidligere oppdrag kan være tomme, fremfor å love et galleri med resultater som ennå ikke er publisert. Prosjektgalleriet sier fortsatt «Ingen prosjekter publisert ennå».
6. Bilder i offentlig tjenestevisning og prosjekt-API filtreres nå for usikre eller ugyldige bilde-URL-er. HTTPS og sikre lokale bildestier er tillatt; HTTP, JavaScript-/data-URL-er, credentials, CSS-terminatorer og ugyldige stier avvises.

## Reelle restpunkter

- **Legg inn ekte tjenester og korrekt beskrivelse** under Backoffice → Produkter og tjenester → Tjenester. Standardtekst fra kode er ikke en redaksjonelt godkjent tjenesteportefølje.
- **Legg inn faktiske gjennomførte referanseoppdrag** med samtykke/avklaring til publisering og kvalitetssikrede før-/etterbilder under Backoffice → Nettsiden → Tidligere oppdrag. Ikke opprett prøveprosjekter som om de var virkelige.
- **Manuell sluttkontroll i nettleser** av meny, tjenestesider, bildeskjæring på mobil, prosjektgalleri og eventuelle nye eksterne lenker. Tekniske testskript og Vercel-bygg erstatter ikke den kontrollen.
- Offentlig nettside lot seg ikke hente gjennom generell web-leser i kontrolløkten. Database, kildekode og Vercel-build er kontrollert direkte.

## Verifikasjon

`scripts/smoke-s28-public-content.mjs` tester tillatte/avviste bilde-URL-er, relevante fallback-destinasjoner, synlighetsvakter, API-status, ærlig prosjektgalleri og eksisterende adminredigering. Vercel-forhåndsvisning og produksjon registreres separat når de er bekreftet READY. Ingen tjenester, prosjekter, bilder, kundedata eller publiseringsstatuser er opprettet eller endret i databasen.
