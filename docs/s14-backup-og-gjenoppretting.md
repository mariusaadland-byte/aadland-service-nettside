# S-14 – Backup og gjenoppretting (Aadland Service)

**Kontrolldato:** 21.11.2026  
**Status:** RISIKO ÅPEN. Dette er en kontroll- og gjenopprettingsplan, **ikke** en utført databasebackup, kopi av Storage eller godkjent restoretest.  
**Avgrensning:** Aadland Service. Utleiedelen endres ikke.

## 1. Kontrollert status i produksjon

- Supabase-prosjekt: `codaywjmjmtvvnzzaaas`, region `eu-west-1`, Postgres 17, `ACTIVE_HEALTHY`.
- Organisasjonens plan: **Free**. Supabase oppgir at Free **ikke inkluderer automatiske tilgjengelige databasebackuper** eller PITR. En eventuell privat/ekstern manuell backup er **ikke verifisert**.
- Databasestørrelse: omtrent **27 MB**.
- `storage.buckets`:
  - `aadland-vat-documents`: privat, **20** objektregistreringer, samlet metadatastørrelse **25 507 126 bytes**.
  - `contact-images`: privat, **0** objektregistreringer.
  - `product-images`: offentlig, **1** objektregistrering på **506 978 bytes**.
- `vat_purchase_documents`: **18** rader. `vat_purchase_document_files`: **18** rader. `external_customer_invoices`: **2** rader.
- **20/20** av dokumentreferansene fra kjøpsbilag og originale eksterne salgsfakturaer matcher `storage.objects`. **0** ubrukte objektregistreringer i den private bilagsbøtten.
- `invoice_drafts`: **10** rader, hvorav **4** har lagret PDF-data (`pdf_base64`) i databasen.
- Andre kartlagte data: `customer_profiles` **4**, `admin_customer_contacts` **7**, `orders` **4**, `quotes` **5**.
- **Ikke utført:** Full SQL-eksport, full byte-for-byte-lesing av Storage, ekstern kryptert kopi, verifisert restore til separat prosjekt, eller øvelse i å gjenopprette innlogging og eksterne integrasjoner.

Tallene er et øyeblikksbilde, ikke dokumentasjon på backup. En kontroll av `storage.objects` beviser ikke at selve filinnholdet kan leses eller gjenopprettes.

### Gjenta den sikre, skrivebeskyttede kontrollen

Supabase-notatbok: [S-14 – Backup readiness (kun lesing)](https://supabase.com/dashboard/project/codaywjmjmtvvnzzaaas/explorer/notebook/a1eb10b0-da2e-4580-87c3-5f4faa7b2692).

Notatboken viser bare summer og avvik; **den tar ingen sikkerhetskopi**. SQL-fil i repo: `scripts/s14-backup-inventory.sql`.

## 2. Krav for å kunne lukke S-14

1. Bestem et **separat og tilgangsstyrt lagringsmål** utenfor produksjonsprosjektet (helst kryptert og med versjonsbeskyttelse mot sletting/ransomware). Ikke legg kunde- eller regnskapsdata i GitHub, en offentlig S3-bøtte eller Vercel-kodelager.
2. Ta og dokumenter **komplett databasebackup** av schema, data og nødvendige roller/privilegier, samt verifiser gjenoppretting av Supabase Auth-identiteter, relevante databaseobjekter og migrasjonshistorikk. Merk: CLI-dumper utelater som standard Supabase-administrerte skjemaer som `auth` og `storage`; de må håndteres eksplisitt ut fra oppdatert Supabase-dokumentasjon.
3. Ta **separat filbackup** av alle relevante Supabase Storage-bøtter. Vanlig databasebackup inneholder **bare metadata**, ikke filbytes. Bevar nøyaktige filbaner, innholdstyper, kontrollsummer, originale `sha256`-verdier fra bilagstabellene og krypterte kopier.
4. Dokumenter også nødvendige **konfigurasjoner** (uten å lagre hemmeligheter i rapporten): e-post/Resend, Vipps, Tripletex, krypteringsnøkler, domenenavn, Vercel-miljøvariabler, Supabase Auth/OAuth, cron og webhook-oppsett. Verifiser egen sikker oppbevaring og nøkkeltilgang.
5. Utfør **kontrollert restore i separat testprosjekt**, aldri over produksjon i første forsøk, og kontroller regnskap, kundedata, PDF-er, lagringsfiler, innlogging og filintegritet.
6. Først når en faktisk eksport, kryptert ekstern kopi og en dokumentert restoreøvelse er bestått, settes S-14 til **verifisert**.

### Beskyttelse av regnskapsoriginaler

`vat_purchase_document_files` og `external_customer_invoices` inneholder referanser og kontrollsummer. En restore må bevare både databaseradene **og** de private PDF-/bildefilene. Originale bilag skal ikke overskrives, konverteres eller gjenopprettes i en annen filbane uten verifisert mapping.

## 3. Forsiktig engangseksport – planlagt, IKKE kjørt

Kjør fra en kontrollert og oppdatert lokal maskin eller en dedikert, sikret backup-jobb. Installer Supabase CLI og Docker, autentiser og knytt prosjektet til korrekt `project-ref`. Kontroller `supabase --version`, `supabase db dump --help` og `supabase storage cp --help` før kjøring, fordi CLI-argumenter endrer seg. Dobbeltsjekk at valgt kilde er **produksjon** og at målet er et **lokalt, privat og krypterbart** backupområde.

I Supabase CLI v3 brukes eksplisitt `--remote` for produksjon (lokal database er standard). Eksempel etter vellykket innlogging/lenking, i et **privat arbeidsområde uten Git-tracking**:

```sh
umask 077
mkdir -p backup-aadland-service
supabase db dump --remote -f backup-aadland-service/roles.sql --role-only
supabase db dump --remote -f backup-aadland-service/schema.sql
supabase db dump --remote -f backup-aadland-service/data.sql --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes
```

**OBS:** Dette er bare deler av en gjenopprettbar kopi. Verifiser særskilt `auth`/`storage`-skjemaene, Supabase Vault/krypteringsnøkler, brukere, eventuelle custom policies/triggere, migrasjonshistorikk og privilegier mot Supabases gjeldende migreringsveiledning. Ikke arkiver en ufullstendig SQL-dump som «full backup».

**Storage:** Last ned alle objektbytes fra minst `aadland-vat-documents`, `contact-images` og `product-images` i original banestruktur med Supabase CLI `storage cp` (der CLI krever `--experimental --remote`), eller via godkjent S3-kompatibel klient/rclone. Kjør en testkopi først. Bekreft objektantall, byteantall og SHA-256 på faktisk nedlastede filer mot manifest og aktuelle bilagskontrollsummer. **Metadata i databasen alene er ikke nok.**

Krypter databasedump og Storage-filer **før** de sendes til et uavhengig lagringssted. Nøkler/passord skal ikke sendes i chat, logges eller legges i kodelageret. Verifiser at en annen autorisert person kan finne sikkerhetskopien og riktig gjenopprettingsnøkkel ved fravær.

## 4. Isolert gjenopprettingstest – planlagt, IKKE kjørt

- Opprett separat restaureringsmiljø først når eieren har godkjent eventuelle kostnader. **Ikke** gjenopprett over `codaywjmjmtvvnzzaaas`.
- Steng all utgående kunde-e-post, Resend-produksjonsnøkkel, Vipps, Tripletex, Systima, webhooks og cron i testmiljøet **før** import. Testmiljøet må ikke kunne ta imot ekte betalinger eller sende ekte fakturaer/purringer.
- Importer nødvendig databaseinnhold, roller, skjemaer, Supabase Auth og filbytes etter offisiell restoreprosedyre. Koble bare en intern test-instans til dette miljøet.
- Sammenlign: kritiske tabellantall, `18` kjøpsbilag-/filreferanser, `2` originale eksterne kundefakturaer, `20` Storage-filer i bilagsbøtten (eller senere oppdatert manifest), `4` databaselagrede faktura-PDF-er, kundeidentitet og tilgangsstyring. Kjør kontroll av SHA-256 på faktiske bytes.
- Åpne et representativt restaurert fakturabilag og en PDF fra **testmiljøet**. Bekreft at fil, dokumentnummer, dato og kontrollsum stemmer med signert manifest. Test at en ordinær kunde **ikke** får innsyn i andres data.
- Registrer testdato, hvem som utførte den, backupens tidspunkt, RPO (maks mulig datatap), faktisk tidsbruk (RTO), avvik og godkjenner. Ikke skriv reelle kundedetaljer i loggen.
- Slett eller sperr testkopier etter godkjent, dokumentert oppbevaringsperiode og begrens tilgang til personer med tjenstlig behov.

## 5. Drift framover

- **Umiddelbar prioritet:** etabler første sikre, krypterte offsite SQL + Storage-kopi. Dette er foreløpig ikke gjennomført fra ChatGPT.
- **Foreslått minimum:** automatisk daglig eksport med separate Storage-objektkopier og varsling ved feil. Før en plan er valgt, er dette et forslag, ikke en eksisterende tjeneste.
- **Foreslått kontroll:** integritetssjekk etter hver eksport, periodisk testrestore i isolert miljø, dokumentert opprydding etter godkjent oppbevaringstid og tilgangsrevisjon.
- **Alternativ:** Supabase Pro gir tilgjengelig daglig databasebackup (vanligvis siste syv dager), men du trenger **fremdeles** en egen løsning for Storage-objektbytes. PITR er et eget betalt tillegg og er ikke aktivert.
- Unngå å automatisere eksport til GitHub Actions-artifakter eller usikre/ukrypterte fellesmapper uten godkjent tilgangskontroll, kryptering og databehandleravtale.

## 6. Kilder

- [Supabase – Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase – Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase – Download Storage Objects](https://supabase.com/docs/guides/storage/management/download-objects)
- [Supabase – CLI reference](https://supabase.com/docs/reference/cli/introduction)

**Ingen produksjonsdata ble eksportert, endret, slettet eller gjenopprettet i S-14-kontrollen.** Dette dokumentet beviser ikke at en fungerende backup allerede eksisterer.
