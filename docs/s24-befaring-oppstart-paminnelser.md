# S-24 – Sikker utsending av befaring- og oppstartspåminnelser

**Dato:** 21.11.2026. **Status:** To Service-croner er sikret med varig per-avtale sendeforsøk, konkret datokontroll og manuell eieravstemming. Kontroll mot ekte Resend-e-post og første naturlige kjøring gjenstår. Ingen utleieendringer.

## Påvist risiko

Begge `GET /api/cron/survey-reminders` (09:15 UTC) og `GET /api/cron/job-reminders` (09:30 UTC) reserverte tidligere en ordre ved å skrive `survey_reminder_sent_at` eller `job_reminder_sent_at` **før** utsendingen. Ved Resend-feil eller timeout nullstilte de markøren. Men et timeout betyr ikke at Resend faktisk avviste e-posten, og dermed kunne en ny kjøring sende en **duplikatpåminnelse**.

Befaringsjobben kontrollerte heller ikke opprinnelig befaringstid og bekreftelsesdato i en betinget oppdatering. Et tidspunkt kunne derfor endres mellom kandidatlisten og «claim». Oppstartsjobben hadde kontroll av tidspunkt og bekreftelse ved claim, men bygde fremdeles e-posten fra kandidatens gamle data uten fersk kontroll rett før sending.

### Produksjon ved audit – kun aggregater

- **2** tilpassede kundesaker/oppdrag; **0** aktive og bekreftede, ikke-arkiverte oppdrag som kunne utløse disse cronene.
- Ingen lagrede `survey_date`; én historisk `job_start_at` med registrert påminnelsesmarkør.
- **Ingen ekte e-poster er sendt** i denne utbedringen. De eksisterende historiske markørene og oppdragene er urørt.

## Ny gjennomføring

### En varig, engangs journal

Migrasjon `supabase/migrations/20261121221000_s24_appointment_reminder_outbox.sql` oppretter `service_appointment_reminder_attempts`:

- Én unikt identifisert utsending per `(order_id, kind, appointment_at, confirmation_sent_at)`, der `kind` er `survey` eller `job`. En tidligere `claimed`, `needs_review`, `sent`, `cancelled` eller manuelt vurdert oppføring kan **ikke** opprettes eller sendes om igjen for samme avtalebekreftelse.
- En serverbeskyttet `claim_service_appointment_reminder` låser selve ordren med `FOR UPDATE` og kontrollerer `status=confirmed`, `order_type=custom`, ikke arkivert, gyldig e-post, korrekt dato **i Europe/Oslo i morgen**, samme nylig bekreftede tidspunkt, samt tom gammel påminnelsesmarkør. Kun da opprettes varig `claimed`-rad.
- Koden i `lib/serviceAppointmentReminders.js` leser oppdraget på nytt etter claim og **rett før e-postsending**. Dersom dato, bekreftelse, status, arkivering, mottaker eller påminnelsesmarkør er endret, merkes forsøket `cancelled` og **ingen e-post sendes**.
- Resend får en **stabil idempotensnøkkel** `service-appointment-reminder/<attempt-id>`. Bare svar med **ingen `error` og en konkret `data.id`** teller som akseptert av leverandøren. Dette **garanterer ikke mottatt e-post i kundens innboks**.
- Etter leverandøraksept registrerer databasefunksjonen `acknowledge_service_appointment_reminder` Resend-ID og `sent` **i samme transaksjon** som den gamle, kompatible påminnelsesmarkøren. Denne markøren settes bare dersom oppdraget **fremdeles har samme tidspunkt, bekreftelse, mottaker og aktiv status**. Ble det omplanlagt under selve sendingen, beholdes sann Resend-kvittering, men **det nye tidspunktet merkes aldri feilaktig som varslet**.
- Ved Resend-timeout, `error`, manglende melding-ID eller uavklart lagring: `needs_review` eller `claimed` beholdes. **Aldri automatisk nullstilling og aldri automatisk gjenutsending**, også etter at Resends idempotensvindu på 24 timer har passert.
- Begge cronene kjører bare med `CRON_SECRET` i Vercel **produksjon**, ikke i forhåndsversjoner. S-17s eksisterende driftsmonitor gir advarsel ved registrerte feil/uavklarte sendinger i kjøringen. Ingen utleiecron er endret.

### Eierens oversikt og kontroll

`/admin/drift` har en ny eierbeskyttet **«Befaring og oppstart – sendekontroll»**. Den viser eldre uavklarte forsøk prioritert foran nylige vellykkede sendinger, med tidspunkt, ordrenummerreferanse/ordre-ID, mottaker, status og Resend-ID.

Bare **eieren** kan etter kontroll i Resend velge:

- `BEKREFTET I RESEND` og oppgi faktisk Resend-ID for å journalføre leverandøraksept.
- `IKKE SENDT` for å journalføre dokumentert manglende utsending.

Begge krever en **konkret begrunnelse på minst 12 tegn** og minst fem minutter siden sendeforsøket. En avklaring starter **aldri ny e-post**, flytter ikke avtalen og endrer ingen betalingsdata. Dersom påminnelsen fortsatt trengs, tar eier **manuell kontakt** etter kontroll. Et nytt, virkelig omplanlagt og bekreftet tidspunkt kan få sin egen vanlige påminnelse.

### Datasikkerhet

Tabellen har RLS og ingen tabelltilgang for `anon` eller `authenticated`; bare `service_role` kan lese/endre. De tre `SECURITY DEFINER`-funksjonene har tom `search_path` og `EXECUTE` eksplisitt tilbakekalt fra `PUBLIC`, `anon` og `authenticated`. Bare serverrollen har `EXECUTE`. API for manuell avstemming krever serververifisert eierrolle og `sameOriginGuard`. Loggen lagrer bare nødvendig kontaktadresse, avtale-identitet, status og Resend-ID – ikke brevets fulle innhold.

## Tester

- **Supabase produksjon – syntetisk, fullstendig tilbakeført SQL-transaksjon:** For en fremtidig testbefaring ble én claim registrert; den samme befaringen kunne ikke claims igjen; leverandørkvittering satte korrekt gammel markør. En syntetisk oppstart ble endret mellom claim og ack; dette bevarte Resend-kvitteringen, men **satte ikke en falsk påminnelsesmarkør**. Alle syntetiske ordrene og journalpostene ble rullet tilbake.
- `scripts/smoke-s24-appointment-reminders.mjs` kjører på syntetiske data og tester oppstart/befaring, to samtidige forsøk, idempotensnøkkel, provider-timeout, exception, DB-ack-feil, endret tidspunkt før og under sending, endret mottaker, manglende e-post, feil dato og eier-/CSRF-kontroll.
- Kjøring i Vercel-forhåndsversjon skal ikke utløse ekte e-post. Testene bruker ingen faktiske kundemeldinger.

## Gjenstår før full sluttgodkjenning

1. Kontrollert test med en egen, trygg oppdrags-/kundekonto i et avskjermet miljø. Verifiser Resend-ID, e-post til testadresse, ingen duplikater og riktig norsk dato i innholdet.
2. Kontroller ekte første kjøring (09:15/09:30 UTC), S-17s driftsregistrering og eieroversikten.
3. Kontroller operativ rutine for `needs_review` og `claimed` ved timeout. Eieren må ikke gjette at e-posten ikke ble sendt.
4. **Resterende kapasitetsgrense:** Hver cron behandler maks 25 avtalekandidater per dag; flere må håndteres særskilt dersom volumet vokser.
5. **Uunngåelig konkurransevindu:** En e-post som allerede er overlatt til Resend kan ikke trekkes tilbake dersom eieren omplanlegger i samme øyeblikk. Rettelsen gjør fersk forhåndskontroll og hindrer feil databasekvittering, men gir ikke en absolutt garanti mot dette tilfellet. Ved sen omplanlegging bør eier sende endringsbekreftelse til kunden.
6. Tidligere bekreftelsesutsendinger i `app/api/admin/jobs/plan` / `app/api/admin/orders` er ikke omskrevet i S-24. Deres eventuelle usikre utsending/omplanlegging vurderes separat – S-24 sikrer **cron-påminnelsene**.

**Ingen ekte ordre, plan, historiske sendemarkører, kundeopplysninger eller utleiedata ble endret.**
