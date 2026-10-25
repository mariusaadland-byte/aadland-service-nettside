# Import av leverandørbilag til MVA-registeret

## Status per 25. oktober 2026

Dette er en **manuell og kontrollert CSV-import**. Det er ikke en direkte Systima-integrasjon, ikke en automatisk regnskapsføring, og ikke en innsending av MVA-melding. Originalbilag må beholdes i regnskapssystemet. Bilagene her er bare en intern avstemmingskopi.

Gå til **Admin → Fakturaarkiv → MVA-avstemming**. Åpne CSV-import. Du kan enten bruke Aadland-malen direkte (UTF-8, semikolon), eller laste opp en CSV-eksport fra et annet regnskapssystem og manuelt velge hvilke eksportkolonner som tilsvarer Aadland-feltene. Komma, semikolon og tabulator som skilletegn støttes i denne feltmappingen. Systemet aksepterer maks 50 rader og 256 KB per import.

**Ved feltmapping:** Du må bekrefte at filen gjelder Aadland Service, velge alle obligatoriske felt, og koble både MVA-grunnlag og MVA-beløp for minst én sats. Datoer og beløp valideres senere i samme kontroll. Vi gjetter aldri MVA ut fra bokføringskonto, MVA-kode, bruttosum eller en prosent du ikke selv har dokumentert. Filen blir ikke en regnskapsmessig primærkilde: kontroller originalbilaget, fradragsandelen og eventuell kreditnotareferanse. Eksterne CSV-filer kan inneholde ulike linjer for samme bilag; disse blir markert som duplikater fremfor slått sammen automatisk.

| Felt | Betydning |
|---|---|
| `type` | `faktura` eller `kreditnota` |
| `leverandor` | Leverandørens navn |
| `fakturanummer` | Opprinnelig faktura-/kreditnotanummer hos leverandøren |
| `dokumentdato` | Dokumentdato i `ÅÅÅÅ-MM-DD` eller `DD.MM.ÅÅÅÅ` |
| `opprinnelig_faktura` | Opprinnelig fakturanummer ved kreditnota |
| `grunnlag_25,mva_25,grunnlag_15,mva_15,grunnlag_12,mva_12,grunnlag_0,mva_0` | Beløp ekskl. MVA og dokumentert MVA per sats, i kroner med komma og to desimaler; tomme felt for ubrukte satser |
| `fradragsprosent` | Kontrollert MVA-fradragsandel, heltall mellom 0 og 100 |
| `bilagsreferanse` | Hvor originalbilaget er arkivert (f.eks. regnskapsprogram og bilagsnummer) |
| `formal` | Virksomhetsformål/bruk av kjøpet, minst fem tegn |

Malen inneholder et **illustrasjonseksempel** som skal slettes før du importerer virkelige kjøp. Beløp med tusenskilletegn, formler og utydelige datoer blir ikke automatisk tolket; bruk tydelige beløp uten tusenskilletegn. Filnavn, CSV og leverandørinformasjon lagres ikke som importfil; bare de rader du bekrefter lagres som bilag.

## Sikker arbeidsflyt

1. Last ned malen og fyll inn faktiske dokumenter fra regnskapet. Sammenlign dato, leverandør, nummer, MVA og eventuell fradragsandel med originalbilagene.
2. Velg filen. En **lesebasert serverkontroll** sammenligner med aktive, tidligere registrerte leverandørbilag, uten å endre dem.
3. Kontroller status per rad. Eksisterende poster, avvik, dubletter i filen og ugyldige beløp kan ikke velges. Kryss kun av for nye, kontrollerte bilag.
4. Bekreft at du har originalbilag og har vurdert fradragsretten. Kontroller bankbetaling for relevante større kjøp.
5. Trykk **Importer valgte**. Dette oppretter bare oppføringene i Aadland Services interne MVA-register. Hver rad valideres på nytt av den eksisterende registrerings-API-en; databasen har unik indeks for aktive bilag på leverandør/nummer/type.
6. Hvis enkelte rader feiler, kan tidligere rader allerede ha blitt registrert. Trykk **Oppdater duplikatsjekk** før du forsøker igjen. Ikke endre fakturanummer for å omgå et treff.
7. Legg eventuelt ved original PDF eller bilde på bilagsoppføringen. Dette er en separat handling og erstatter ikke arkivering i regnskapssystemet.

## Mulig senere direkte Systima-integrasjon

Systima opplyser at de tilbyr ekstern API-integrasjon for sluttbrukere og tredjepart, men tilgang kan kreve en Systima-godkjent integrasjonsflyt (OAuth eller integrasjon fra Systimas grensesnitt). Det er ikke dokumentert eller bekreftet at akkurat lesing av leverandørfakturaer med alle MVA-koder er tilgjengelig for denne Aadland-instansen.

Før en slik integrasjon kan aktiveres må vi avklare tilgang og scopes, liste-endepunkt for **leverandørbilag og kreditnotaer**, dokument-ID, MVA-koder/fradragsandel, originale vedlegg, opprettelses- og endringstidspunkter, samt hvordan annulleringer og korreksjoner håndteres. Ingen API-token skal legges i kode, CSV, chat eller nettleserlagring. En eventuell integrasjon skal først være **lese- og forhåndsvisningsbasert**, med stabil kilde-ID og duplikatbeskyttelse før eksplisitt godkjenning.

Offisiell dokumentasjon: https://hjelp.systima.no/support/solutions/articles/150000171542-api-for-3rd-part-and-end-users-systima-
