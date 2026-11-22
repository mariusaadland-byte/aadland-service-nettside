# S-27 – Oppdragsplanlegging og idempotent bekreftelses-e-post

**22.11.2026.** Gjelder `POST /api/admin/jobs/plan`, ikke utleie eller Vipps.

## Påvist risiko

Den opprinnelige ruten lagret planen med `UPDATE orders` før den sendte kunde-e-post. Resend-kallet manglet varig sendelås og idempotensnøkkel. Ved timeout eller feil når `job_confirmation_sent_at` ble oppdatert kunne neste klikk sende den samme avtalen igjen. To samtidige POST-er kunne også forsøke samme bekreftelse. Endringer i dato/tekst mellom planlagring og leverandørkall kunne gjøre status tvetydig. Ingen dokumentert faktisk dobbeltutsending er påvist.

## Ny kontroll

- Hver plan har en `job_plan_revision` i `orders`. `save_job_plan_once` låser ordre-raden og kontrollerer at klientens forventede revisjon er gjeldende. Lik dato/avtaletekst beholder revisjonen. Endret dato/tekst gir en ny revisjon og nullstiller bekreftelses-/påminnelsesmarkører. Historisk bekreftelsesdato beholdes for uendrede, eldre planer.
- `job_plan_confirmation_attempts` har unik `(order_id,plan_revision)`. `claim_job_plan_confirmation` tar en atomisk engangslås, sjekker aktivt bekreftet oppdrag og gjeldende e-post, og blokkerer ved uløst tidligere sendestatus.
- E-post bygger på den lagrede revisjonen, med stabil Resend-nøkkel `job-plan-confirmation/<attempt-id>`. Før Resend-kall leses ordren igjen. Hvis avtale eller mottaker endret seg, kanselleres forsøket uten utsending.
- Leverandørens `data.id` journalføres med `ack_job_plan_confirmation`. Kompatibilitetsfeltet `job_confirmation_sent_at` skrives atomisk **bare hvis** ordren fortsatt samsvarer med den opprinnelige planen. Resend-aksept betyr ikke bekreftet levering i innboksen.
- Uklar leverandørrespons, timeout eller uventet feil før ACK setter `needs_review`; automatisk forsøk gjentas ikke. Eier kan etter minst fem minutter kontrollere Resend og registrere `BEKREFTET I RESEND` med faktisk ID eller `IKKE SENDT` med merknad. Kontrollfunksjonen sender ikke e-post. En dokumentert ikke-utsending kan ikke automatisk overstyre engangsgrensen for samme plan.
- `POST` nekter ekte e-post i Vercel-preview. Kundebekreftelsen sendes bare fra produksjon med produksjonsnøkkel; ingen fallback fra preview til produksjonsnøkkel.
- RPC er bare tilgjengelige via `service_role`, tabellen har RLS og er utilgjengelig for `anon`/`authenticated`; serveren krever oppdragsredigering og owner-only ved Resend-kontroll.

## Testet

- S-27 migrasjon lagt inn i Supabase og testet med en syntetisk ordre **inne i en SQL-transaksjon som ble rullet tilbake**. Testen kontrollerte første plan/revisjon, uendret revisjon, første atomiske claim, blokkert dobbeltclaim, `needs_review` etter syntetisk timeout, blokkert nyere plan mens forrige er uavklart, eieravklaring, ny plan/revisjon, ACK med syntetisk leverandør-ID og avvist foreldet redigering. Alle endringer rullet tilbake.
- Automatiske kodesmoker: `scripts/smoke-job-planning.mjs` og `scripts/smoke-s27-job-plan-confirmation.mjs`.
- Prosjektets preview-build er verifisert mot den nye koden; ingen Resend-e-post ble sendt under test.

## Gjenstår før operativ godkjenning

En kontrollert ekte intern testbekreftelse til en testadresse, gjennomgang av endring av oppstartstid i nettleseren, og manuell kontroll av en uavklart Resend-hendelse. **Ingen ekte kunde-e-post, faktura, betaling eller ordre er endret av testene.** S-27 kan ikke regnes som praktisk sluttgodkjent før disse kontrollene er gjort.
