# S-22 – Produkter, lager, bestilling og betaling

**Kontroll 21.11.2026. Status: dokumentert kritisk feil i lagerført Vipps-ordre rettet i kode og Supabase. Praktisk kunde-/Vipps-/Resend-end-to-end gjenstår.**

## Produksjonsfunn (kun aggregerte data)

| Kontroll | Resultat |
| --- | --- |
| Aktive produkter | 3 |
| Lagerførte produkter | **0** |
| Produseres på bestilling | **3** |
| Registrerte ordre | **4**, alle arkivert |
| Arkiverte spesial-/kontaktordre | 2, status `confirmed`, betaling `unpaid` |
| Arkiverte produktordre | 2: én `cancelled/pending`, én `completed/pending` |
| Registrerte Vipps-produktordre | **0** |

Dette er ikke et bevis for at reell kjøpsflyt er testet; ingen faktiske lagerførte produkter fantes i produksjon. Den fullførte, arkiverte produktordren med `payment_status=pending` er et **historisk avvik**. Det kan være en gammel test eller en uavklart kundeinnbetaling. Vi har **ikke** endret, refundert, markert som betalt eller slettet den; eieren må sjekke dokumentasjon, bank og eventuelle andre betalingskilder.

### Kontrollert eksisterende arkitektur

- `POST /api/orders`: same-origin og rate-limit, validering av kundedata, priser beregnes på serveren fra aktive DB-produkter, lager og valgte produktalternativer. Klienten kan ikke sette beløp direkte.
- Lagerførte produkter: `public.create_order_with_stock` reserverer lager og oppretter ordre i **samme PostgreSQL-transaksjon**, med låst/atomisk `UPDATE stock_quantity=stock_quantity-quantity WHERE stock_quantity>=quantity`. En annen ordre kan ikke selge samme siste enhet dersom funksjonen avslår oversalg.
- Ordre kan kanselleres med `cancel_product_order_once`, som dokumenterer `stock_released_at`, slik at identisk gjentakelse ikke frigjør dobbelt lager.
- Vipps-synkronisering leser PSP-status, verifiserer/oppdaterer server-side betalingssummer, og gjør oppfølging i egne API-er; dette er **ikke** en verifisert virkelig belastning/refusjon i denne kontrollen.
- Admin-arkivering av fullførte produktordre sperrer nå `pending`, `unpaid`, `partial` og `authorized` i API og UI. En historisk oppføring fra før kontrollene kan likevel være arkivert og er ikke en bekreftet betalt ordre.

## Kritisk avvik og rettelse

### Feil: lagerført Vipps-ordre mister betalingsreferansen

I `app/api/orders/route.js` genererte serveren ved Vipps-kjøp `payment_provider="vipps"`, `payment_reference=orderNumber` og `vipps_checkout_started_at` i `record`. For produkter med `inventory_mode="stock"` ble ordren opprettet i `create_order_with_stock`. Den historiske funksjonen skrev imidlertid **ikke disse tre kolonnene** til `public.orders`. Deretter kunne API-et starte `createVippsPayment` og svare med betalingssiden – selv om ordren i databasen manglet sikker PSP-kobling.

Konsekvensen kunne bli vanskelig eller umulig etterfølgende matching ved webhook, gjenopptakelse på Min side og avstemming. Ingen eksisterende lagerførte produkter eller Vipps-produktordre ble funnet på kontrolltidspunktet; dette er **en verifisert kodefeil med fremtidig risiko**, ikke dokumentasjon på at en kunde er rammet.

**Rettet:**
1. Migrasjonen `supabase/migrations/20261121182500_s22_stock_vipps_order_metadata.sql` beholder atomisk lagerreservering, og lagrer nå også `payment_provider`, `payment_reference` og `vipps_checkout_started_at`. Samme funksjon avviser manglende/feil Vipps-referanse og metadata før den gjør en eneste lagerendring.
2. Serverens `POST /api/orders` leser etter registrering disse feltene fra den faktiske ordren. **Ingen Vipps-betalingsside kan opprettes dersom referansen ikke er lagret.** Ved avvik forsøker serveren `cancel_product_order_once` for å frigjøre lageret og merke ordren kansellert; hvis oppryddingen feiler logges dette separat til manuell gjennomgang.
3. Admin → Arkiv viser nå en **tydelig advarsel** når en allerede arkivert *fullført* produktordre fremdeles står `pending/unpaid/partial/authorized`. Advarselen endrer ingenting og tilbyr den eksisterende handlingen «Gjenopprett». Hensikten er å gjøre det kjente historiske avviket synlig før eieren sjekker betaling.

## Utførte tester

- **Inne i Supabase, mot gjeldende SQL-funksjon, med syntetiske data og full rollback:** En lagerført testvare ble reservert, Vipps-ordre beholdt korrekte metadata, duplisert kansellering frigjorde bare riktig antall, oversalg ble avvist, og en ugyldig Vipps-referanse ble avvist. **Ordre og produktantall var uendret etter transaksjonen**.
- Byggtest `scripts/smoke-s22-stock-vipps-orders.mjs` bruker kun in-memory mocks og sjekker klient-API, kontroll av persistert referanse, sikker avvisning, lagerfrigivelse etter integritetsfeil, feil ved oversalg og manuell lagerbestilling. **Ingen ekstern Vipps- eller Resend-forespørsel**.
- Alle tidligere automatiske prosjekttester kjøres gjennom `npm run build` på Vercel.

## Åpent før full sluttgodkjenning

1. Bestilling av **kontrollert lagerført testprodukt** i testmiljø med reell (ikke-monetær) Vipps-testtransaksjon: lager 2→1, PSP-referanse i DB, korrekt fangst/tilbakebetaling og én lagerfrigivelse ved kansellering. Skal ikke belaste en ekte kunde.
2. Reell end-to-end for **bestillingsvarer** (som er de tre produktene i produksjon): valg, totalsum, ordrebekreftelse til testkunde og eier, henting/lokal levering/frakt der dette er aktivert.
3. Kontroll av **Resend-provider-ID og innbokslevering** for ordrebekreftelser. At en sendemetode ikke kaster feil er ikke i seg selv bevis for levering. Uklar utsendelse må ikke uten videre prøves på nytt.
4. Avklare det **historiske arkivavviket** `completed/pending` mot bank/Tripletex og kundens faktiske betalingsmåte; ikke konkluder med at ordren er ubetalt eller test uten bevis.
5. Før full produksjon med lager: overvåking/varsling av uavklarte Vipps-referanser, lagerreservasjoner som blir hengende etter database-/nettverksfeil og kontroll av administrativ tilbakebetalingsflyt. Eier må beholde driftsbuffer.
6. **S-14** står fortsatt åpen: separat, verifisert backup/restore for Supabase inkl. Storage.

Ingen eksisterende produktpriser, lagerbeholdninger, ordrestatus, betalingsoppføringer, kunde-e-poster eller utleiedata ble endret.
