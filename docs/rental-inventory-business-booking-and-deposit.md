# Utleie: produktoversikt, kundevalg og trygg depositumshåndtering

## Leveranse (25. oktober 2026)
- Egen adminoversikt `/admin/utleie` viser samtlige utleieprodukter, publisert/ikke publisert status, antall, pris, depositum, kategori, søk, filter og redigeringslenke. Produkter redigeres via `/admin/utleie/[id]` med eksisterende admin-API; kun eier eller ansatte med produktrettigheter har tilgang.
- `/admin/utleie/ny` kan fortsatt opprette nytt utstyr. Alle pris-, bilde-, kategori- og tilgjengelighetsinnstillinger følger redigeringsskjemaet.
- På kundens utleieside kan man velge privatperson eller bedrift. For bedrift valideres ni-sifret norsk organisasjonsnummer med kontrollsiffer, firmanavn og eventuell faktura-e-post.
- **Sikker regel:** Innlogget bedriftskonto med samme bekreftede e-postadresse og godkjent fakturaprofil må bestå eksisterende kredittpolicy, **inkludert hele den nye leieprisen**, før utstyret reserveres. Ellers returneres avslag uten å opprette booking. Et org.nr. alene gir aldri kreditt.
- Privatbookinger følger eksisterende betalingslogikk. Det er ikke endret Vipps-konfigurasjon, betalingstype, faksimile eller fakturering av reelle kunder.
- **Viktig begrensning:** Dagens fakturagodkjenning er knyttet til e-postadresse; det finnes ikke etablert kobling fra godkjent fakturaprofil til verifisert organisasjonsnummer. Derfor må firmanavn og org.nr. kontrolleres manuelt før faktisk bedriftsfaktura sendes. Denne endringen oppretter ikke fakturaer automatisk.

## Depositum: separat fra leiebeløp
- `rental_items.deposit_ore` er prisopplysning, og `rental_bookings.deposit_ore` en avtalt sikkerhet. Den eksisterende statusen `held` er administrativ og **ikke dokumentasjon** på at Vipps eller banken reserverte penger.
- Ved bestilling reserverer eller trekker systemet **ikke** sikkerhetsdepositum i Vipps. Kundesiden er nå tydelig merket.
- For framtidig Vipps ePayment kreves separate betalings-ID-er og finansielle hendelser for (A) betaling av leie og (B) depositum. Etabler egne tilstander `not_requested -> pending_authorization -> authorized -> captured/released/expired/failed`, og lagre eksplisitte eksterne referanser, beløp, utløp, autorisert beløp, fangst/refusjon og tidsstempler. Ikke oppdater depositum fra kundens retur-URL alene. Webhook/providerkontroll må validere status og idempotens.
- **Ikke reserver depositum måneder før utlevering**: autorisasjonsvindu avhenger av korttype/bank. En ny betalingsforespørsel nær utlevering må kunne sendes til kunden etter uttrykkelig aksept. Ved utløpt reservasjon skal utstyret ikke utleveres uten ny bekreftet sikkerhet.
- Et faktisk refunderbart innbetalt depositum føres som gjeld til kunden; det er ikke leieinntekt. Ved delvis motregning må eventuelle erstatnings- eller tilleggsytelser dokumenteres og MVA-behandles korrekt. Ubelastede reservasjoner er normalt ikke bankinnbetalinger i regnskapet.
- **Ingen nye Vipps-betalinger, refusjoner eller bilagsføringer gjennomføres i denne leveransen.**

## Før oppstart av live betalingsflyt
1. Avklar skriftlig med Vipps at den aktuelle ePayment-avtalen dekker sikkerhetsdepositum og forventet autorisasjonsperiode.
2. Lag databasefelter for separat betaling/depositum og en hendelseslogg som ikke kan overskrives.
3. Avklar leiebetaling ved booking, vilkår ved skade, fakturering og personvern med regnskapsfører.
4. Test gjestekunde, privatkunde, godkjent bedriftskunde, avvist bedrift, avbrutt betaling, dobbel webhook, feil i refund og kort-reservasjon som utløper, med testmiljø og ingen ekte kundetransaksjoner.
5. Først etter kontrollert eiergodkjenning kan relevante Vipps-enheter aktiveres.
