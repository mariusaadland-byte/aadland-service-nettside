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
