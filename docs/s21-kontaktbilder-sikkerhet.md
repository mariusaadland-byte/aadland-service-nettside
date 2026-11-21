# S-21 – Kontaktbilder: privat opplasting, bevis for tilknytning og sikker opprydding

**21. november 2026 – teknisk sikkerhetsrettelse.** Gjelder **kontakt-/befaringsforespørsler**, ikke utleie.

## Kritisk funn

Før endringen hadde `DELETE /api/contact-images` bare `sameOriginGuard` og en formatkontroll av en oppgitt `private-image:contact-images:<path>`-referanse. **Ingen bruker-, eier- eller opplastingskvittering ble kontrollert.** Alle med en kjent, gyldig filreferanse og mulighet til å sende forespørsel fra tillatt opprinnelse kunne derfor forsøke å slette bildet, uavhengig av hvem som hadde sendt det eller om det var knyttet til en kundes ordre. At Storage-bucket er privat beskyttet **ikke** dette serverendepunktet: det brukte en privilegert Supabase-klient.

S-21-audit av produksjon (kun aggregater):
- `contact-images`: **privat** bucket, **0** lagrede objekter.
- `product-images`: **offentlig** bucket, 1 objekt; opplasting og sletting under `/api/admin/upload` krever innlogget administrator med `canManageProducts`.
- `aadland-vat-documents`: **privat** bucket, 20 objekter; eier-/autorisert kontroll i MVA-rutene undersøkt tidligere.
- **2** tilpassede forespørsler i `orders`, **0** med bildefilreferanser. Ingen eksisterende kundebilder ble slettet eller endret som del av S-21.

## Implementert

### 1. Direkte sletting er stengt

`DELETE /api/contact-images` returnerer nå **403 uten å kontakte Storage**, også om klienten kjenner en filreferanse. Ingen kontaktbilder kan lenger slettes ved å sende en liste over andre kunders bildereferanser. Nettleseren sender heller **ingen DELETE-kall** etter opplastingsfeil eller ordrefeil. Den gir i stedet beskjed om automatisk opprydding.

### 2. Tilfeldig engangskvittering per bilde

Hver vellykket opplasting får en ny, tilfeldig **256-bit** kvittering via `crypto.randomBytes(32)`. Serveren lagrer **bare SHA-256-hashen** av kvitteringen sammen med bildebanen og livssyklusstatus i `public.contact_image_uploads`. Nettleseren mottar `{ref,receipt}` i opplastingssvaret; denne hemmeligheten må **aldri** sendes i kontaktbeskrivelsen eller til en annen kunde. Ingen kryptografisk hemmelighet ligger i filnavnet.

`POST /api/contact-images` krever som før:
- samme opprinnelse, serverbasert rate-limit og maks ett bilde per kall;
- JPG/PNG/WebP med korrekt filsignatur, maks 4 MiB;
- privat bucket, tilfeldig UUID-filnavn, ingen `upsert`;
- at en kvitteringsrad faktisk kan lagres. Ved feil forsøkes bare **det nøyaktige objektet som akkurat ble lastet opp** fjernet, aldri en liste over andre referanser.

### 3. Ordre og bilder knyttes atomisk

`POST /api/orders` for `orderType="custom"` godtar **ikke** lenger private filreferanser skrevet direkte i `customRequest`. Den krever en liste med `imageReceipts`, maks **8**, der hver kvittering har en syntaktisk korrekt filreferanse og 64 hex-tegn. Serveren beregner hash og sender bare bane + hash til en **service-role-only** PostgreSQL-funksjon.

`create_custom_order_with_contact_images` gjør dette i **én database-transaksjon**:
1. Avviser ukjent/duplisert, brukt, sperret eller **mer enn én time gammelt** opplastingsbevis.
2. Låser kvitteringsradene med `FOR UPDATE` slik at to forespørsler ikke kan bruke samme bevis.
3. Oppretter spesialforespørselen og legger **bare beviste** filreferanser til kontaktteksten.
4. Merker tilknyttede bildefiler `linked` med ordre-ID.

Hvis én av disse operasjonene feiler, lagres **verken** ordren eller en delvis bildelinking. Vanlige produktordre og utleie er ikke del av denne funksjonen.

### 4. Automatisk opprydding – kun private serverjobb

Ny Vercel-cron `/api/cron/contact-image-cleanup` er låst med `CRON_SECRET` og kjører daglig klokken **12:50 UTC** i produksjon.

Den behandler maks **15** bilder per kjøring som fortsatt har `state=pending` og ble opplastet for **minst 24 timer siden**. Et gyldig kvitteringsbevis kan bare brukes i én time, slik at ingen gyldig ny ordre kan oppstå etter denne fristen. For hver fil:
- Serveren tar eksklusiv **claim** ved å flytte `pending → cleaning` før sletting.
- Sjekker `orders.custom_request` på nytt. Hvis en eksisterende kundesak refererer til filen, knytter den fila til den ordren og **sletter ikke**.
- Kun dersom bildet **ikke** er brukt i en ordre, og DB-sjekken lykkes, fjerner den nøyaktig den private filbanen fra Storage.
- Ved manglende bekreftelse, DB-feil eller slettingsfeil settes `cleanup_review` og **ingen automatisk risikabel gjentakelse** foretas. En `cleaning`-rad etter prosessavbrudd krever manuell undersøkelse.

Opprydding av ekte kundebilder som er knyttet til ordre inngår **ikke**. Samtidighet beskyttes gjennom transaksjonslås og den lange differansen mellom **1 time kvitteringsgyldighet** og **24 timer oppryddingsgrense**.

### 5. Databasepersonvern

Tabellen `contact_image_uploads` har RLS, ingen `anon` eller `authenticated`-rettigheter, kun `service_role` for lesing/skriving. SQL-funksjonen er `SECURITY DEFINER`, med tom `search_path`, `EXECUTE` tilbakekalt fra `PUBLIC`, `anon` og `authenticated`; bare `service_role` kan kalle den.

Opplastingsjournalen inneholder **hash**, privat bane, status, tidspunkt og evt. ordre-ID; ikke bildeinnhold eller kundeinformasjon. Registreringene i journalen slettes ikke automatisk etter behandling – egen retensjons-/arkivrutine må fastsettes.

## Test og restpunkter

`scripts/smoke-s21-contact-images.mjs` validerer syntetiske JPG-bytes, riktig/feil kvittering, duplikat, feil signatur, 403-sperre uten Storage-tilgang, at en feilet kvitteringsregistrering bare rydder opp eget nyopplastet objekt, eierbevis, SQL/RLS/cron-grenser og uendrede utleiejobber.

**Før operativ sluttgodkjenning:** Test i nettleser/mobil med en ny kontrollert forespørsel og et eget testbilde. Bekreft at bilde kan åpnes av autorisert administrator og at en annen forespørsel **uten kvitteringen** ikke kan knytte det til sin ordre. Kontroller at den faktiske daglige cron-jobben registrerer og sletter en **ubrukte testopplasting** etter 24 timer, og at et bilde knyttet til en ordre aldri slettes. Avklar rutine for revisjon av `cleanup_review`, sletting på kundens forespørsel etter identitetskontroll og journalretensjon. Den nye cron-jobben er ennå **ikke** med i S-17s seks-jobbers driftsoversikt.

**Ingen ekte kundebilder eller VAT-/produktbilder ble slettet som følge av utviklingen.** S-14, manglende fullverdig backup/restore-test, er fortsatt åpen.
