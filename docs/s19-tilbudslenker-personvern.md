# S-19 – Begrensede og sperrbare kundelenker for tilbud

**Dato:** 21.11.2026. **Status:** Sikkerhetskode og additive databaserettigheter implementert. Innlogget sluttprøve med ekte kundekonto og ferskt sendt testtilbud gjenstår. **Ingen kunde-e-post er sendt og ingen eksisterende tilbud er endret.** Ingen utleieendringer.

## Påvist risiko i tidligere versjon

`lib/quoteLinks.js` utstedte HMAC-SHA256-token på `id|quote_number|customer.email` uten utstedelsesdato, egen utløpstid eller mulighet til å sperre. `GET /api/quotes/[id]` verifiserte signaturen, men returnerte fullt tilbud, navn, telefon, e-post, adresse, linjer, beløp og betalingsplan **også etter** at tilbudets `valid_until` var passert. `POST` nektet aksept etter utløp, men den lesbare historikken var stadig eksponert for alle med gammel lenke.

Produksjonssnapshot før endringen: **5 tilbud**, hvorav **2 godkjente med passert gyldighetsdato** og **3 kladder**; **0** aktive sendte. Kontroll av `quote_send_log`: **0** registreringer. Dette er metadata, ikke bevis på faktisk videresending av en lenke eller et databrudd. Ingen personopplysninger ble eksportert.

## Løsning

### 1. Utstedelses- og utløpskontroll

- Nye e-post-/oppfølgingslenker signeres som `v2.<utstedelsestid-i-sekunder>.<hmac-sha256>`. Signaturen er knyttet til tilbuds-ID, tilbudsnummer, **kundens e-post**, lenkegenerasjon og utstedelsestid.
- Offentlig tilgang stopper **senest 60 døgn etter tokenutstedelse** og **senest etter tilbudets gyldighetsdato i norsk tid**, og avvises ved kladd, kansellering, erstattet revisjon eller ikke-utstedt dokument. Godkjente/avslåtte tilbud kan bare åpnes med en fortsatt gyldig lenke innenfor opprinnelig gyldighet – ellers kreves Min side.
- Eldre SHA256-tokens uten datostempel får **ikke** evig gyldighet. De godtas bare for faktisk utstedte tilbud yngre enn **60 døgn**, med gyldig tilbudsdato og opprinnelig generasjon 1. Dermed lukkes tidligere utløpte historiske lenker ved utrulling.
- Tids- og statuskontroll gjøres **på serveren**, også ved en direkte API-forespørsel. Skjult eller deaktivert knapp i nettleseren er ikke en sikkerhetssperre.

### 2. Sperre og ny lenke for eier

To nye databasekolonner på `public.quotes`: `quote_link_generation integer not null default 1` og `quote_link_disabled_at timestamptz`, lagt til i migrasjon `20261121153824_quote_link_controls_s19.sql`.

- Eieren kan åpne et utstedt tilbud i **Admin → Tilbud** og velge **Sperr offentlige lenker**. Bekreftelse kreves (`SPERR LENKE`). Dette øker generasjonen og setter sperretidspunkt: alle tidligere delingslenker blir ugyldige.
- Hvis tilbudet **fortsatt er aktivt og sendt**, kan eieren velge **Lag ny trygg lenke** med eksplisitt bekreftelse (`NY LENKE`). En ny generasjon signeres og returneres bare til eieren. Den gamle versjonen er ugyldig.
- Handlingene er eierbeskyttet, har same-origin-kontroll og bruker optimistisk konkurransesikring (`WHERE quote_link_generation = forrige`). Ingen API gir anonyme brukere et nytt token.
- **Ingen e-post sendes automatisk.** Eieren må selv kopiere en ny lenke og dele den til rett mottaker etter kontroll. Utløpte tilbud krever ny revisjon – ny lenke alene forlenger ikke et utløpt pristilbud.
- Oppfølgingscron hopper over sperrede tilbud og kontrollerer lenkegenerasjonen på nytt før e-post fra Resend.
- Sperring påvirker **bare offentlig deling**, ikke selve tilbudsdokumentet, godkjenningen, oppdraget eller regnskapshistorikken.

### 3. Sikker tilbudshistorikk på Min side

Tidligere ga `/api/customer/me` ut HMAC-bearertoken i `href="?token=..."`, slik at innloggede kunders historikk fortsatt ble delt gjennom lenker som kunne lekkes. Nå returnerer Min side i stedet **`/tilbud/<id>` uten token**.

`GET /api/quotes/[id]` aksepterer dette bare når en **gyldig, serververifisert kundesession** har e-post som nøyaktig matcher e-posten i det **utstedte** tilbudet (og dokumentet faktisk er utstedt/godkjent/avslått). En fremmed konto eller kladd får `403`, også hvis brukeren kjenner UUID-en. En innlogget eier i admin gir ikke automatisk innsyn i andre kunders `Min side` gjennom dette endepunktet. `POST` kan bare akseptere tilbud med aktiv status og gyldighet, uavhengig av innlogget tilstand.

HTTP-responser bruker `Cache-Control: private, no-store` og `Referrer-Policy: no-referrer`. Historiske kundeopplysninger beholdes i databasen i tråd med gjeldende dokumentasjons-/bokføringsregler; denne endringen sletter ikke noe.

## Regresjonstester

`scripts/smoke-s19-quote-links.mjs` tester med kun syntetiske data:

- V2-signatur, tidsgrense, framtidsklokke, feil signatur, annet tilbud, annen kunde, generasjon og sperring.
- Gamle HMAC-lenker kan bare virke for gyldig nylig utsendt tilbud; ikke etter utløp eller lenkerotasjon.
- Direkte `GET` med utløpt token gir 403. Innlogget historisk eierkundeforhold fungerer, fremmed konto og kladd gir 403.
- Uautorisert `POST` avvises uten databaseendring eller ekstern sending.
- Eierrettigheter, same-origin, bekreftelseskrav og konkurranselås for rotasjon, test på kode- og responsnivå.
- Eksisterende `smoke-customer-isolation.mjs` er oppdatert til å bevise at `Min side` ikke gir ut bearertoken i URL.

## Restpunkter før operativ godkjenning

1. Test på en **egen kontrollert konto/egen e-post** at ny utsendt testlenke åpnes før frist, stopper etter dokumentets gyldighet, og at en tilbakekalt lenke gir 403.
2. Test at **Min side** fortsatt viser egne godkjente, utløpte tilbud, og aldri en annen kundes tilbud. Aldri bruk en ekte kundes konto til testing.
3. Kontroller at **Lag ny trygg lenke** gir ny URL for et aktivt tilbud og at gamle URL-er ikke åpnes. Ikke send til kundens ekte e-post ved test.
4. Planlegg korrekt prosedyre for kunder uten Min side-konto, eller som trenger kopi av gamle, godkjente dokumenter: autentisert kundekopi etter identitetskontroll; ikke reaktiver evige offentlige lenker.
5. Dersom et tilbud er gyldig lenger enn 60 døgn, må kunden enten åpne det via Min side eller få ny lenke fra eier etter kontroll. Den automatiske oppfølgingen skal ikke reaktivere sperrede lenker.

**S-19 teknisk fullført betyr ikke at faktisk kundetesting eller leveranse er bekreftet.** S-20 (bekreftelse av tilbudsaksept) følges opp separat.
