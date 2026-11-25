# S-31 – Ingen ekte kunde-e-post fra testmiljø

**25.11.2026.** Gjelder alle Resend-baserte sendefunksjoner for Aadland Service. Den felles sperren gjelder også eventuelle utleie-sendere i forhåndsvisning, uten å endre utleieutsendinger i produksjon.

## Påvist risiko før retting

Flere sentrale sendefunksjoner brukte mønsteret `RESEND_PREVIEW_API_KEY || RESEND_API_KEY` når `VERCEL_ENV=preview`. Hvis preview-nøkkelen manglet, kunne en testgren benytte produksjonsnøkkelen og ekte kundeadresser. Dette var en dokumentert koderisiko, **ikke** dokumentasjon på at en ekte kunde faktisk fikk en testmelding.

Berørte kategorier omfatter ordrestatus, ordrefremdrift, refusjonsvarsler, Vipps-kvitteringer, tilbud og påminnelser, passordgjenoppretting, økonomi-/fakturavarsler, automatiske cron-jobber og særskilte testkvitteringer.

## Ny sikkerhetsregel

- All applikasjonskode som direkte oppretter en `Resend`-klient, importerer nå `lib/safeResend.js` i stedet for `resend`-SDK direkte.
- `safeResend` tillater opprettelse av en Resend-klient **bare** hvis `process.env.VERCEL_ENV === "production"`. En preview, lokal utvikling eller en testkjøring uten denne eksakte verdien blir avvist **før SDK-klienten opprettes**, også når ekte produksjonsnøkkel finnes i miljøet.
- Produksjonsmiljøet får samme SDK-klient og samme eksplisitte nøkkel som før. Manglende/blank nøkkel avvises i stedet for å bruke automatisk fallback.
- `rentalResendApiKey()` og `customerResendApiKey()` returnerer tom streng utenfor produksjon. Berørte øvrige e-postruter er oppdatert så preview ikke faller tilbake fra `RESEND_PREVIEW_API_KEY` til `RESEND_API_KEY`.
- Preview-endepunktene for testkvitteringer svarer nå eksplisitt med HTTP 403 og forklaring. De kan ikke sende en reell prøvekvittering til en vilkårlig e-postadresse. Syntetiske/mokkede tester uten leverandørutsending kan fortsatt kjøres.
- I alle sendefunksjoner som bruker Resend-SDK gjelder sperren også ved gjenbruk av en produksjonsnøkkel ved en feil. Beskyttelsen er derfor ikke avhengig av at **hver enkelt** funksjon har sin egen preview-guard.

## Test og kontroll

- `scripts/smoke-s31-preview-email-safety.mjs` skanner **alle filer under `app/` og `lib/`** under bygging og avviser direkte importer av `resend` utenom den felles gatewayen. Skriptet avviser også direkte `api.resend.com`-kall og produksjonsnøkkel-fallback fra preview.
- Den samme testen oppretter en kunstig SDK-klasse (ingen nettverk) og viser at konstruksjon blokkeres i preview, development og når `VERCEL_ENV` mangler, selv med en produksjonsnøkkel. Produksjonsmodus tillater konstruksjon med eksplisitt nøkkel og avviser blank nøkkel.
- S-31-testen bekrefter **39 direkte sendermoduler** bak gatewayen, og at begge testkvitteringsruter har en tydelig blokkering.
- Tidligere syntetiske Resend-smoketester er justert slik at de fortsatt bruker interne mock-objekter; de sender ikke reell e-post.
- Vercel-forhåndsvisning har bestått hele byggløpet (`READY`).

## Begrensninger og restpunkter

- Ikke påvist at ekte kunder tidligere mottok testmail. Eldre Resend-leveringshistorikk må eventuelt undersøkes separat hvis det oppstår mistanke.
- Sperren er spesifikk for **Resend-kall som går gjennom applikasjonen**. Ved senere integrasjon av en annen e-postleverandør må også den få en tilsvarende kontroll.
- Det må gjennomføres en **kontrollert intern produksjonstest** av e-postutsending (til egen adresse) for å sikre at produksjon fortsatt leverer korrekt. Dette er ikke gjennomført i dette punktet.
- Preview-knapper for å sende *faktisk* testkvittering er bevisst deaktivert. Fremtidig sikker testmail bør skje via en separat, eksplisitt tillatt testmottaker fra produksjon eller i en helt isolert e-postsandbox.
- Ikke alle øvrige feiltilstander og dataendringer som kan skje *før* et sendeforsøk i preview er dekket av S-31; dette punktet kontrollerer at reell e-post ikke forlater preview-miljøet.
