# S-23 – Prosjekttegninger: skille mellom lese- og redigeringsrettigheter

**Dato:** 21.11.2026. **Status:** Kode og syntetiske tilgangstester implementert. Innlogget sluttprøve med en egen testbruker som kun har ordreinnsyn gjenstår. Ingen eksisterende tegninger eller brukertilganger er endret.

## Dokumentert feil

`app/api/admin/project-drawings/route.js` brukte tidligere samme `allowed()` for `GET`, `POST`, `PATCH` og `DELETE`:

```js
getAdminUser() && (hasPermission("canManageProducts") || hasPermission("canViewOrders"))
```

Derfor kunne en **framtidig ansatt med bare `canViewOrders=true`**, uten rett til å administrere produkter eller oppdatere ordre, **opprette, redigere og slette alle serverlagrede prosjekttegninger** via direkte HTTP-kall. Same-origin-kontrollen på POST/PATCH/DELETE beskytter mot enkelte cross-site-angrep, men gir **ingen tillatelsesmodell for ansatte**. Å skjule knapper i nettleseren er ikke nok.

### Produksjonskontroll – bare aggregerte tall

- **2** serverlagrede `project_drawings`, **0** synlige på kundens Min side, **0** direkte koblet til ordre.
- **3** aktive administratorer: én eier og to ansatte. **Begge ansatte har allerede `can_view_orders=true`, `can_update_orders=true` og `can_manage_products=true`.** Den nye rettighetssperren fjerner derfor ikke deres eksisterende redigeringstilgang.
- `public.project_drawings` har RLS aktivert. `anon` og `authenticated` har ingen direkte `SELECT`-tilgang; serverens `service_role` kan lese. Feilen lå i **API-ets innloggede rollebeslutning**, ikke i at databasen var offentlig.
- Dette er en påvist tilgangsfeil, **ikke dokumentasjon på at tegninger er slettet eller lest av uvedkommende**.

## Ny eksplisitt rettighetsmodell

`lib/projectDrawingPermissions.js` gir to rene funksjoner basert på **serververifisert** aktiv administratorkonto.

| Bruker | Les/vis tegninger og PDF | Opprett/rediger/slett |
| --- | --- | --- |
| Ikke innlogget, inaktiv, eller uten relevante rettigheter | Nei | Nei |
| Ansatt med **kun `canViewOrders`** | **Ja** | **Nei** |
| Ansatt med `canUpdateOrders` | Ja | Ja |
| Ansatt med `canManageProducts` | Ja | Ja |
| Eier | Ja | Ja |

Beslutningen gjøres **på serveren ved hver API-forespørsel**. `POST`, `PATCH` og `DELETE` returnerer `403` før kontakt med Supabase dersom brukeren har kun lesetilgang. `GET` beholder lovlig lesetilgang. Same-origin-sjekkene på alle muterende metoder beholdes.

## Oppdatert brukeropplevelse

- `/admin/tegninger` viser arkivet for alle med lesetilgang, men viser **ikke** knapp for ny tegning, redigering eller nytt tilbud til ansatte med bare leseadgang.
- Ny `/admin/tegninger/[id]` gir innloggede lesere **visning av plantegning og roterbar 3D** ved å gjenbruke den eksisterende, ikke-redigerbare `CustomerDrawingViewer`. Siden henter tegningen server-side etter autorisasjon, verifiserer UUID og har ingen skrive- eller slettefunksjoner. Den vises ikke for uvedkommende.
- `/admin/tegning` (den eksisterende, store tegneredigereren) krever nå eksplisitt **redigeringsrett**. Lesebrukere sendes tilbake til tegningsarkivet. Redigeringsberettigede brukere kan som før åpne tegninger i redigereren og lagre dem.
- PDF-rapport fra tegningen beholder **lesetilgang**, da genereringen ikke lagrer eller endrer en prosjekttegning; retten kontrolleres med samme felles funksjon.

## Tester

`scripts/smoke-s23-project-drawing-roles.mjs` kjører mot den faktiske API-koden med **syntetiske kontoer** og mock av databasen:

- Ikke innlogget, inaktiv eller ingen rettigheter: ingen lesing/skriving.
- `canViewOrders` alene: `GET 200` med tegning, men `POST/PATCH/DELETE 403`, **ingen databasekall** ved avvist mutasjon.
- `canUpdateOrders`, `canManageProducts` eller `owner`: lovlig lesing og skriving.
- Forged string `canViewOrders="true"` uten sann boolsk rettighet er ikke nok.
- Endringer fra feil opprinnelse avvises før DB, også for eier.
- Ugyldig tegning-ID avvises.
- Sider, arkivknapper og PDF bruker samme rollemodell, og visningssiden har ingen DB-skriving.

**Ingen reelle tegninger, admin-roller eller kundedokumenter er endret eller slettet i testene.** Utleie er uendret.

## Åpne punkter før full driftsgodkjenning

1. Opprett eventuelt en **kontrollert intern testkonto** med **kun `canViewOrders`**, logg inn på mobil og PC, og prøv `GET`, `POST`, `PATCH`, `DELETE`. Kontoen må ikke gis tilgang til reelle kunder utover den bevisst planlagte leserollen.
2. Kontroller arkiv og 2D/3D på eksisterende tegning i mobilvisning, og at rettigheter oppdateres etter ny innlogging/rolleendring.
3. Kontroller redigeringsflyten under eier eller ansatt med eksplisitt skriverett, med en **egen uforpliktende testtegning**, ikke ved å endre de to faktiske tegningene.
4. Ta stilling til om fremtidige roller bør ha en enda finere egen `canManageDrawings`-rettighet. Det finnes ikke et slikt felt i dagens administratortabell. **S-23 løser den konkrete eskaleringsfeilen uten å endre hele rollemodellen.**
