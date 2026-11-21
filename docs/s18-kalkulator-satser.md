# S-18 – Kontroll av kalkulatorsatser og kalkulator → tilbud

**Dato:** 21.11.2026. **Status:** Regnefeil/inkonsistens rettet i kode og testes før produksjon. Ingen lagrede tilbud, fakturaer eller avtalte prissammensetninger er endret. Ingen utleiedeler berørt.

## Grunnlag kontrollert

- `app/admin/kalkulator/CalculatorClient.js`
- `lib/calculatorQuoteLines.js`, som brukes av `QuoteTransferPanel.js`.
- `app/admin/arbeidsklokke/WorkClockClient.js`.
- `app/admin/tilbud/QuoteEditorClient.js`.
- Supabase `quote_admin_preferences` og aggregerte beløp fra `work_time_entries` (kun lesing; ingen kundedata kopiert).
- Offisielle satser fra Regjeringen og Ferde (se kilder).

| Innstilling | Kalkulator/arbeidsklokke | Verifisert |
| --- | --- | --- |
| Timepris | **500 kr inkl. MVA** begge steder | = **400 kr eks. MVA**, ingen endring gjort |
| Kilometer | **5,30 kr/km** begge steder | Stemmer med statens reiseregulativ fra 01.01.2026 til 31.12.2027. Dette er en godtgjørelsessats, **ikke** en lovbestemt kundepris |
| Materialpåslag | Ny kalkyle **15 %** | Supabase `default_material_markup = 15` og `minimum_material_markup = 15`. Tilbudsredigeringen bruker samme lagrede default |
| Eksisterende timeregistrering | Ett lagret `work_time_entries` med **200 kr/time inkl. MVA** og **5,30 kr/km** | Historisk registrering/overstyring; **ikke** overskrevet med standarden 500 kr |
| Bomtakster | Bypakke Bergen og E39 Svegatjørn–Rådal | Tall fra Ferde er fortsatt gyldige for oppgitte takstgruppe-1-kjøretøy med AutoPASS per kontrollen. Ikke garanti for din faktiske bil eller passering |

## Påvist avvik og rettelse

1. **Fiktiv standardbom:** En ny, ellers tom kalkyle hadde `tollPreset="bergen-bjornafjorden-ordinary"`, `oneWayTrips=2` og tom `distanceOneWay`. Det la til **153,60 kr** i bom automatisk før brukeren hadde valgt rute. **Rettet:** Nye kalkyler starter med **Ingen bompenger** og tomt egendefinert beløp. Dine standardtime-/km-/materialsatser beholdes.
2. **Feil ved overføring til tilbud:** Kalkulatorens totalsum inkluderte den valgte bommen selv uten km, men `quoteLinesFromCalculator` utelot bomlinjen når `distanceOneWay = 0`. **Rettet:** Kalkulator og tilbudsoverføring bruker samme `calculatorTollEstimate`-funksjon. En **eksplisitt valgt bom** overføres også når kjøreavstand ikke er angitt; en **ikke valgt bom** blir alltid 0.
3. **Duplisert hardkoding:** De samme bomtakstene lå i to filer med risiko for fremtidige forskjeller. **Rettet:** Én felles liste `CALCULATOR_TOLL_PRESETS` i `lib/calculatorQuoteLines.js`; kalkulator og tilbud leser denne.
4. **Tidligere nettleserlagrede kalkyler:** Eksisterende lagrede valg beholdes. Ett snevert unntak er det **gamle automatisk forhåndsvalgte bomoppsettet uten noen registrert kjøreavstand og med urørt standardbeløp**. Dette nullstilles ved første åpning, med synlig forklaring på kalkulatorsiden. Tidligere eksplisitt valgte ruter og lagrede kalkyler med kjørelengde beholdes. Ingen kundetilbud eller historiske fakturaer endres.
5. **Misvisende ruteantakelse:** Forenklede kombinert-satser har tidligere blitt merket «per vei». Ferde opplyser at **Bergen bomring krever inn i én retning**, mens **E39 krever inn i begge retninger**, og Bergen har **timesregel**. Ny tekst varsler tydelig at kombinert-satsene er grove estimater; biltype, passasjeretning, faktisk rute, rushtid og rabatt må kontrolleres før et tilbud sendes.

### Viktig om MVA

Kalkulatoren behandler alle arbeid, materialer, reise og bom som del av en ordinær **25 % MVA-pliktig tjenestepris**. Den regner om innskrevne priser inkl. MVA til eks. MVA for tilbudet. Dette er den eksisterende modellen. Ingen MVA-klassifisering er endret under S-18. Reelle utlegg foretatt i kundens navn og for kundens regning kan behandles annerledes etter mva-reglene; det må vurderes særskilt. Ikke bruk kalkulatoren til å omgå lovlige bokføringskrav.

## Regresjonstest

`scripts/smoke-s18-calculator-rates.mjs` sjekker:
- 500 kr inkl. mva → 400 kr eks. MVA, 8 timer → 4 000 kr inkl. MVA
- Ny kalkyle med 0 km og 2 enkeltveier legger til **0 kr** bom
- En eldre eksplisitt valgt rute (153,60 kr) blir med i overføringen også uten km
- 20 km × 5,30 kr og E39-elbilbom per enkeltvei gir samme brutto beløp i kalkyle og tilbud
- Egendefinert bom med norsk komma, ugyldig bomvalg, 15 % materialpåslag og delte satser
- Eksisterende timer, kroner, fakturaer, kundedata og tidligere valgte ruter oppdateres ikke

**Gjenstår før full operativ godkjenning:** Kontroller på eierens iPhone/PC at den nye «Ingen bompenger»-innstillingen vises, at nettleserlagret gammel automatisk rute forklares og at et nytt usendt testtilbud får de samme prisene som kalkylens sammendrag (innen dokumenterte avrundingsforskjeller). Ingen kundetilbud skal sendes i denne testen. Før faktisk prisfastsetting må eieren velge faktiske satser og kontrollere bomselskapets regler.

## Kilder

- [Regjeringen – Statens kilometergodtgjørelse 2026–2027](https://www.regjeringen.no/no/tema/arbeidsliv/Statlig-arbeidsgiverpolitikk/statens-personalhandbok/sph-meldinger/2025/pm-2025-12-saravtale-om-dekning-av-utgifter-til-reise-og-kost-innenlands/id3143994/)
- [Ferde – Bypakke Bergen og timesregel](https://ferde.no/bomanlegg-og-priser/bypakke-bergen)
- [Ferde – E39 Svegatjørn–Rådal](https://ferde.no/bomanlegg-og-priser/e39-svegatjorn-radal)
- [Skatteetaten – Merverdiavgiftshåndboken om utlegg og omkostninger](https://oppslag.rettskilder.skatteetaten.no/rettskilder2/type/handboker/merverdiavgiftshandboken/gjeldende/MVA2025_M-4/MVA2025_M-4-1/MVA2025_M-4-1.2)

**S-18 justerer ikke satsenes tall, eksisterende fakturaer, faktiske Vipps-betalinger, historiske arbeidsklokkeoppføringer eller utleie.**
