# S-16 – Oppfølging av kunder, purringer og kreditnotaer

**Kontrollert:** 21. november 2026. **Status:** Kodegjennomgang og kontrollert test – ingen reell purring, inkassovarsel eller kreditnota er sluttprøvd. **Utleiedelen er ikke behandlet.**

## Faktiske registreringer (kun aggregerte tellinger)

Produksjonsdatabasen hadde på kontrolltidspunktet:

| Område | Antall |
| --- | ---: |
| Fakturakladder | 6 |
| Utstedte fakturaer | 4 |
| Utstedte fakturaer med passert forfall | 3 |
| Vennlige betalingspåminnelser | 1 (bekreftet sent_at; ingen registrert utsendingsfeil) |
| Formelle purringer / inkassovarsler | 0 |
| Kreditnotaer | 0 |
| Administrative avslutninger | 0 |
| Poster i betalingsloggen | 3 |

**Viktig:** «Forfalt» er basert på datofeltet, ikke bevis for et ubetalt og juridisk inndrivbart krav. Delbetalinger, krediteringer, aktive Vipps-betalinger, tvister og bankavstemming må kontrolleres for hver faktura før tiltak. Ingen personnavn, beløp fra ekte kunder eller private opplysninger er skrevet i rapporten.

## Verifisert kodeflyt

- Fakturaarkivet tilbyr en samordnet oversikt over fakturaer som trenger oppfølging, økonomisk ferdige fakturaer og avvik, uten å endre regnskap.
- Den vennlige betalingspåminnelsen kan sendes av eier etter eksplisitt bekreftelse, uten ny forfallsdato eller gebyr. API-et låser sendeforsøk med førstegangs-tid og kontrollerer e-post, saldo, refusjon og status på server.
- Formell purring og inkassovarsel krever utstedt, forfalt faktura, positivt restbeløp, dokumentert foregående varsler og minst 14 dagers ny betalingsfrist. E-posten får varsel-PDF og originalfaktura. Ingen gebyrer og renter legges til av koden. Tilgang er begrenset til innlogget administrator med fakturarettigheter.
- Kreditnota krever eier, samme opprinnelse, eksplisitt bekreftelse og lagrer nummerert dokument. Kundeutsending har egen idempotensnøkkel og førstegangs tidsgrense. Ingen faktisk kreditnota ble utstedt under denne kontrollen.
- «Videre egenoppfølging» er et eierbeskyttet, **read-only internt saksgrunnlag**, ikke et inkassokrav, gebyr, betalingsoppfordring eller automatisk oversendelse.

## S-16 konkret rettelse: tidsbegrensning ved usikker formell utsending

**Påvist risiko:** Formelle purringer og inkassovarsler brukte Resend-idempotensnøkkelen `invoice-reminder/<record.id>` uten en serverbasert sperre for gamle registrerte sendeforsøk. Resend oppgir at slike nøkler oppbevares i **24 timer**. Et usikkert eller feilet sendeforsøk eldre enn dette kunne derfor potensielt føre til en ny e-post ved samme knappetrykk, selv om den første meldingen egentlig var levert.

**Rettet i PR #193:**

- En formell utsending er nå bare tillatt fra **produksjonsmiljø** (ikke preview eller utviklingsmiljø).
- Serveren bruker `created_at` fra **den opprinnelige frosne varselraden**, ikke tidspunktet for siste forsøk. Ved `pending` eller `failed` med alder på **23 timer eller mer**, ugyldig/fremtidig tidspunkt eller manglende metadata, stoppes ny utsending med **HTTP 409**.
- Frontend skjuler tilgjengelig sending for gamle uavklarte forsøk, viser et tydelig varsel og ber eieren avstemme Resend-loggen. Knappe-/sendefunksjonen blir ikke aktiv igjen automatisk ved omstart.
- Ved usikker sendekvittering og manglende lagring av sendestatus instrueres det ikke lenger om ukritisk «prøv igjen»; systemet krever manuell kontroll.

**Dette er en fail-closed sikkerhetssperre.** Den avklarer **ikke** om gammel e-post faktisk ble sendt. Det finnes foreløpig ingen egen godkjent gjenopprettingsflyt for et gammelt, uavklart purringsforsøk; dette må avklares manuelt mot Resend og fakturaen uten risiko for duplikat.

## Lov- og kvalitetssjekk

- Minst 14 dagers frist på inkassovarsel er i tråd med veiledning fra Finanstilsynet. Et inkassovarsel kan sendes etter forfall uten forutgående purring; applikasjonen har en **strengere intern sekvens** med først purring, deretter inkassovarsel, av hensyn til kundene. Dette må ikke forveksles med et lovkrav om at en purring alltid må komme først.
- Dersom purringsgebyr skal kreves, gjelder særskilte regler for tidligste tidspunkt, frister og gebyrsatser. Aadland Service sin formelle varslingskode legger **ikke til gebyr eller renter**, og denne gjennomgangen endrer ikke beløpene.
- Juridiske sendebetingelser, innsigelser/tvister og faktisk oppgjør bør kontrolleres opp mot oppdatert regelverk før reell inndriving; ingen automatisk godkjenning fra denne testkontrollen.

Kilder: [Finanstilsynet – Inkassovirksomhet](https://www.finanstilsynet.no/forbrukerinformasjon/inkassovirksomhet/), [Resend – idempotency keys](https://resend.com/changelog/idempotency-keys).

## Testdekning og restpunkter

`scripts/smoke-s16-formal-notice-retry.mjs` tester hjelpefunksjonens tidsgrenser, et simulert gammelt varsel via POST-endepunktet med **0 databaseendringer og 0 sendinger**, eksisterende bekreftet varsel, ferskt sendeforsøk og preview-sperre. Eksisterende smoke-tester kontrollerer frister, PDF-forhåndsvisning, Vipps-refusjon, restsaldo, kreditnotaer og intern saksoversikt.

**S-16 skal fortsatt stå åpen** til:

1. En reell, innlogget men **utsendingsfri** gjennomgang av fakturaarkivet på mobil/PC er verifisert: forfalt/ikke forfalt, delbetaling, refinansierte/krediterte krav og riktig sperre ved Vipps-avvik.
2. En kontrollert e-posttest med **kun eierens testadresse og trygge testdata** verifiserer melding, PDF-vedlegg, logg, originalfaktura og duplikatvern. Et ekte juridisk inkassovarsel må **ikke** sendes for testing.
3. Kreditnotaflyten prøves med godkjente testdata og vurdering av bokføringsmessige konsekvenser, ikke ved å utstede en kreditering på en ekte kunde for testformål.
4. Eieren avklarer rutine for usikker tidligere sendestatus og tvist/innsigelse før eventuell videre inndriving.

Ingen ekte melding, betaling, juridisk krav, kundekreditering, Vipps-handling eller regnskapstransaksjon ble utført som del av S-16.
