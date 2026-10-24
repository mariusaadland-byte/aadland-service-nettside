# Systima – sikker OAuth-klargjøring

Status: **Ikke aktivert, og ingen automatisk import av leverandørfakturaer.**

Fra Aadland Service kan eieren åpne `/admin/faktura/systima` fra MVA-avstemmingen. Siden viser kun teknisk status. Ingen nøkler, OAuth-koder eller tilgangstoken vises i nettleseren eller i en statusrespons.

## Systimas dokumenterte flyt

Systima beskriver to innloggingsmetoder for tredjepartsintegrasjoner. Denne klargjøringen bruker kun **OAuth fra integratorens grensesnitt**: https://app.systima.no/oauth/login med `clientId` og en tilfeldig `state`. Systima sender deretter `authorizationCode`, `oauthClientId` og `state` tilbake. Først etter sikker tilstandskontroll kan serveren bytte autorisasjonskoden mot tilgangstoken med `POST /token`. Dokumentasjon: https://hjelp.systima.no/support/solutions/articles/150000171542-api-for-3rd-part-and-end-users-systima-

Systima krever registrert integrasjon og utlevering av klient-ID og klienthemmelighet. Selskap, API-tilgang og konkrete **lese-endepunkter for leverandørfakturaer** er ikke bekreftet for denne installasjonen. Ikke gjett leverandørfaktura-endepunkt. Swagger-oversikten er beskyttet og eventuell tilgang må avklares med Systima.

## Serverkonfigurasjon (Vercel)

Funksjonen er **av** inntil alle opplysninger er innhentet og følgende servermiljøvariabler er konfigurert på sikker måte:

- `SYSTIMA_OAUTH_ENABLED=true` – bare etter eierens beslutning og vellykket test
- `SYSTIMA_CLIENT_ID` – offentlig klientidentifikator fra Systima
- `SYSTIMA_CLIENT_SECRET` – privat klienthemmelighet, kun server
- `SYSTIMA_TOKEN_URL` – presis `https://`-adresse fra Systima for `POST /token`. Kun verifiserte Systima-verter og `/token` eller `/api-external/token` godtas
- `SYSTIMA_REDIRECT_URI=https://www.aadland-service.no/api/admin/systima/callback` – må være registrert identisk hos Systima
- `SYSTIMA_TOKEN_ENCRYPTION_KEY` – uavhengig, tilfeldig 32-byte nøkkel kodet som standard Base64; ikke legg denne i Git eller chat

Nøkkelrotasjon krever kontrollert omkobling. Krypterte tilgangstoken lagres på serveren i en RLS-beskyttet Supabase-tabell. OAuth-status svarer bare med autorisasjonstidspunkt og status, ikke token. Et engangs `state`-cookie er HttpOnly, Secure, SameSite Lax, bundet til eierens innlogging og har 10 minutters levetid. Bare eieren kan starte OAuth, og kun fra produksjonsmiljøet etter en eksplisitt bekreftelse.

## Sikkerhetsgrense og videre arbeid

- OAuth-autorisasjon gir **ikke** tilgang til automatisk eller manuell lesing i dette bygget. Det finnes ingen Systima-API-kall mot bilag og ingen regnskapsmessige skrivekall.
- Når Systima har bekreftet et lesebasert endepunkt, må følgende avklares før kobling: selskap-ID, per-selskap autorisasjon, scopes, paginering, felter for leverandør, dokumentnummer og dato, kreditnotaer, MVA-koder, fradragsandel, vedlegg, annulleringer, endringer og ekstern stabil dokument-ID.
- Etter bekreftelse kan data vises i den eksisterende kontrollforhåndsvisningen. All registrering krever fortsatt menneskelig kontroll og duplikatsjekk.
- Automatisk tokenfornyelse, fjerning av lokal OAuth-tilgang og eventuell tilbakekalling hos Systima må ferdigstilles og dokumenteres **før ordinær drift av aktiv integrasjon**. Inntil da beholdes bryteren av.
- Eksisterende CSV-import og originalbilag-opplasting er den anbefalte driftsmetoden.

Det er ikke behov for å opprette nytt Systima-selskap, opprette nye fakturaer, sende data til Systima eller flytte regnskap. Ingen leverandørbilag importeres av OAuth-koden.
