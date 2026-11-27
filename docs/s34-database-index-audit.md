# S-34 – databaseytelse (Service)

25.11.2026: Supabase performance advisor viste 14 fremmednøkler uten dekkende indeks (13 uten utleie) og 52 indekser uten registrert bruk (49 uten utleie). Berørte Service-tabeller var 16–248 kB inkludert indekser; enkelte radestimater manglet. `invoice_vipps_refund_notices` manglet indeks på invoice_id som brukes direkte av fakturahistorikk og avhengighetskontroller i admin. Migrasjon 20261125184321 er installert og indeksdefinisjon verifisert. Ny advisor: 13 manglende totalt, 12 uten utleie. Det nye indekset telles foreløpig som ubrukt, som forventet. Ingen eksisterende indekser slettet. Statistikk for øvrige små tabeller må vurderes mot faktisk vekst, spørringsplaner og kostnad ved flere indekser; ingen dokumentert ytelsesgevinst målt i dagens små tabeller. Ingen endring i utleie, ingen endring av fakturadata.

Se [Supabase fremmednøkkelindekser](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) og [ubrukte indekser](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Oppfølgingskontroll 27.11.2026

Produksjonsstatistikk: material_supplier_products har estimert 96 914 levende rader og total størrelse 90 087 424 byte (ca. 86 MiB). Primærnøkkel registrerte 464 596 indeksskann, supplier_active-indeks 163. GIN search_document (ca. 23 MiB), EAN og modulnummer hadde 0 registrerte skann i øyeblikksbildet. Databasestatistikk sist nullstilt 25.08.2026; tellere er kumulative og dokumenterer ikke brukeropplevelse. Øvrige store Service-tabeller i kontrollen har under 400 kB hver. Tidligere S34-refusjonsindeks finnes fortsatt (8 KiB). Advisor: 13 udekkede fremmednøkler (12 ikke-utleie), 52 ubrukte indekser (inkludert utleie).

Lese-baseline med EXPLAIN (ANALYZE, BUFFERS) av faktisk search_material_supplier_products, result_limit=20:

| Søk | Filter | Databasetid | Rader |
| --- | --- | ---: | ---: |
| 48x98 | Alle leverandører | 2039,904 ms | 2 |
| 11303641 | Byggmakker | 608,334 ms | 1 |

Begge enkeltmålinger var med buffer-treff og ingen disklesing. Ingen produktpriser eller kundeopplysninger hentet ut. Dette er ikke nettleser-/API-responstid eller p95. Søket bruker flere lower(... ) LIKE '%...%' OR fulltekstsøk og rangerer eksakte treff først. GIN alene dekker ikke hele OR-predikatet. Før eventuell ny søkeindeks eller omskriving må resultatsett, rangering, flere søketyper, leverandørfilter, importkostnad og plassbehov måles i isolert test. Ingen målt gevinst eller ny indeks påstås. Ingen DDL, sletting av indekser eller endring i utleie.

### Eksakt varenummer – målt alternativ 27.11

Read-only EXPLAIN ANALYZE for supplier_id=byggmakker, supplier_sku=11303641, active=true: 4,770 ms execution, 4 buffer hits, existing composite primary-key index scan, 1 row. Earlier full-text/substring lookup for same SKU and supplier: 608,334 ms (1 row). These are separate single measurements, not end-to-end latency or a guaranteed speedup. Explicit exact SKU mode in calculator uses this lookup and requires selected active supplier, preserves leading zeros and exact case, and returns no partial matches. Normal search remains unchanged. No extra indexes or catalog writes. New UI clears old results and ignores aborted responses. Build and browser verification pending. General search tuning remains separate.

### Vanlig materialsøk – kandidat 27.11.2026

Første omskriving med strpos og materialisert parameter-CTE var tregere (3486,479 ms for 48x98), avvist. Deretter ble pg_trgm og en midlertidig tabell med katalogens søkefelter og tekstindekser opprettet i en transaksjon med ROLLBACK, uten produktpriser og uten vedvarende endring. To enkeltmålinger av kandidatsøk (ikke direkte API-sammenligning): 48x98, 6,704 ms / 2 rader (første uttrykksvariant lower over sammensatt tekst); terrassebord, 12,974 ms / 20 rader (endelig variant lower per felt). Dagens RPC terrassebord 690,953 ms / 20 rader. BitmapOr brukte ny GIN-trigramindeks og fulltekstindeks. pg_trgm er verifisert ikke installert etter rollback.

Endelig kandidat har ekstra indeksvennlig prefilter på sammensatt tekst eller fulltekst, deretter eksakt samme tidligere OR-predikat og sortering. Søkeord med under tre tegn, prosent, understrek eller backslash går uten ekstra prefilter. Alle ni lesende kontrollsøk ga samme antall og treffmengde (kandidaten er en delmengde av originalpredikatet): 48x98=2, terrassebord=41, 11303641=1, gips=557, skru=3744, ø=19225, 48%98=514, a_b=3072, backslash=47. Ingen prisdata hentet ut. Ingen permanent indeks eller funksjonsendring. Kandidat i scripts/sql-s34-general-material-search-candidate.sql er IKKE migrasjon. Gjenstår: mål plassbehov, fullskala importkostnad, faktisk RPC-plan med dynamiske argumenter, leverandørfilter og rangering ved lik score, samt sikker utrulling med kort låsetid og verifisert rollback. Midlertidig test er ikke dokumentasjon på produksjonshastighet.


### Importkostnad og parameterstyrt søk – 27.11.2026

Midlertidige kopier med eksisterende indekser og 96 914 katalograder, syntetiske priser, ingen vedvarende endringer. Samme INSERT ON CONFLICT DO UPDATE som i S36 for 87 922 Byggmakker-rader: 7213,808 ms uten ny indeks; 11576,892 ms med ny indeks (ca. 60,5 % ekstra i denne enkeltmålingen). Indeksbygg 2080,294 ms, 10 379 264 byte før oppdatering, 22 380 544 byte etter. Dette måler upsert, ikke full S36 RPC med fingerprint, JSON-parsing, WAL, låseventing, journal og nettverk. Midlertidige tabeller har annen I/O og WAL-kostnad enn produksjon.

Første parameterstyrte SQL-kandidat ga samme sorterte treff i 8/8 funksjonstester med force_custom_plan / force_generic_plan, men bare moderat gevinst (ny tid 143–485 ms). Ny variant velger originalt eller indeksert predikat før parameterisert EXECUTE USING, uten interpolasjon av søkeord. Midlertidig funksjonstest med force_generic_plan:

| Søk | Leverandør | Original ms | Ny ms | Samme sorterte treff |
| --- | --- | ---: | ---: | --- |
| 48x98 | Alle | 752,475 | 5,720 | Ja |
| terrassebord | Alle | 684,978 | 9,686 | Ja |
| 11303641 | Byggmakker | 571,653 | 5,005 | Ja |
| gips | Bygger’n | 88,823 | 5,002 | Ja |
| 48%98 | Alle | 656,522 | 652,990 | Ja |
| ø | Alle | 669,749 | 659,268 | Ja |

Fallback i testfunksjonen kalte midlertidig originalfunksjon; ferdig SQL-kandidat under scripts/sql-s34-material-search-replan-candidate.sql bruker tilsvarende originale SELECT som separat parameterisert EXECUTE-gren. Denne eksakte filen er ennå ikke kjørt som migrasjon. Korte søk og wildcard beholder gamle treffregler og forventes ikke vesentlig raskere. Uavklart sortering ved lik score er uendret; ikke innført ny tie-break.

**Beslutning:** Ikke aktiver permanent ennå. Tidligere import har allerede truffet REST-timeout. Før produksjon må full 87 922-raders S36-aktivering testes isolert, inkludert import av endrede navn, fingerprint, tilbakerulling, reell API-grense, plassbehov og kontrollert indeksbygg. Ingen permanent utvidelse/indeks, prisendring eller ny import. Etter første importbenchmark bekreftet 87 922 Byggmakker, 8 991 Bygger’n, 1 egen vare og 0 uferdige importdeler. 

### Full S36-kjedetest med trigramindeks – 27.11.2026

Kopierte eksisterende katalogstruktur/indekser til midlertidige tabeller, brukte søkefeltene i databasen og syntetiske innkjøps-/salgspriser samt 17 % syntetisk påslag. Hentet gjeldende definisjoner av fingerprint, finish_large_material_import, preview_material_import og activate_material_import fra produksjonskatalogen og omdirigerte alle public-referanser til pg_temp. Ingen endring av produksjonsfunksjoner. 87 922 varer i 18 deler, 100 endrede varenavn og alle syntetiske innkjøpspriser endret. Første samlet DO-test avbrutt av statement_timeout under upsert; kontroll etterpå bekreftet rollback. Andre test delte forhåndsvisning, aktivering og gjentakelse i egne SQL-statements med 30 sekunders statement_timeout.

| Steg | Målt tid |
| --- | ---: |
| Sammenstilling av deler og forhåndsvisning | 27 501 ms |
| Aktivering inkl. fingerprint, upsert og journal | 27 343 ms |
| Gjentatt aktivering av samme kladd | 23 ms |

Alle 87 922 testvarer oppdatert, test-salgspriser og leverandørpåslag bevart, andre leverandørdata uendret, kladdjournal registrert, staging tømt og gjentatt aktivering idempotent. ROLLBACK etter test. Målingene inkluderer mellomliggende SQL-overhead; ikke reell REST-, Vercel- eller WAL-belastning, og ikke test av samtidige forbindelser. Ingen permanent pg_trgm eller indeks. For liten tidsmargin (ca. 2,5–2,7 s) og første timeout gjør permanent aktivering uforsvarlig uten videre optimalisering. Behold dagens søk og eksakt varenummersøk; neste steg er å profilere fingerprint, chunk-sammenstilling og upsert individuelt i midlertidig oppsett, deretter vurdere mindre kostbar importstrategi uten å svekke atomicitet, godkjenning eller kontroll av samtidige endringer. Ikke øk tidsgrensen eller endre prisene bare for å få en grønn test.
