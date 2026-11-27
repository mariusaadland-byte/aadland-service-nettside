# U-40A – Isolert migrasjons- og restoreøvelse

**Ingen produksjonsbackup er tatt.** S14-risikoen er fortsatt åpen. Den delte databasen og filene til begge virksomhetsdeler må sikres samlet.

## Test i GitHub
Eksisterende scripts/test-signing-db.sh er den eksplisitte avhengighetsrekkefølgen for utkast, med minimal eldre fixture og den faktiske leverandørbilagsmigrasjonen. Den er ikke en produksjonsmigrasjonsplan. Kjør først isolerte SQL- og samtidighetstester, deretter test-isolated-restore.sh i samme disposable PostgreSQL 17.6 container. Dump custom-format med samme versjon, SHA-256, gjenopprett til ny database, sammenlign tabellinnhold og utvalgte ACL/funksjonsegenskaper, og kontrollér dokument-/betalingshistorikk. Separat syntetisk filkopi og hash sammenlignes mot restaurert metadata. Ingen artefakter lastes opp. Roller deles av samme testcluster; rolle-/Auth-/Storage-gjenoppretting på en annen Supabase-instans er ikke verifisert. Testen bruker fiktive data og en filfixture, ikke Supabase Storage.

## Før faktisk staging
1. Kartlegg dagens produksjonsskjema/migrasjoner/roller og lagringsbøtter skrivebeskyttet, for både Service og Utleie. Kontroller forskjeller mot utkast. 
2. Velg godkjent kryptert lagringsmål utenfor produksjonsprosjektet. Eier har ikke ekstern disk tilgjengelig; ingen lagringsleverandør er valgt. Ikke legg ekte data i GitHub eller chat.
3. Ta komplett, separat database- og filbackup, med autentisering, roller, filbaner, kontrollsummer og konfigurasjoner håndtert sikkert. Følg eksisterende S14-plan; verifiser faktiske bytes.
4. Opprett isolert staging etter godkjenning av eventuelle kostnader, ingen produksjonsnøkler, betalingswebhooks, e-post eller cron. Bruk fiktive data for normal utvikling. Verifiser restore med kontrollert tilgang før produksjonsmigrasjoner.
5. Gjør utkast om til gjennomgåtte additive migrasjoner med minstetilgang og test rollback/forward-fix, uten å overskrive regnskapsdata eller dokumenter.
6. Produksjonsaktivering er separat beslutning etter helhetlig test.

U39W Vercel failed on older duplicate preview assertion; preserved original disable predicate order and added category guard after duplicateBlocking. Updated U39W assertion accordingly. No production writes, exports, billing, staging project creation or provider actions.