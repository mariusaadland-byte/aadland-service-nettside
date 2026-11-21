# S-15 – Mobil-/PC-kontroll uten utleie

**21.11.2026 – Status: DELVIS TESTET. INNLOGGET ENDE-TIL-ENDE-TEST PÅ FAKTISK IPHONE OG PC GJENSTÅR.**

Dette er en teknisk gjennomgang av Aadland Service sin eksisterende tilbuds-, faktura- og MVA-administrasjon. Det er **ikke** en bekreftelse på at brukerflyten er testet med ekte konto og ekte skjerm. Ingen faktura, kundemelding, betaling eller MVA-bilag er opprettet, sendt, endret eller slettet.

## 1. Statisk kontroll i produksjonskoden

| Område | Kontrollen viser | Fortsatt utestet |
| --- | --- | --- |
| Tilbudsredigering | Egen responsiv CSS for materiallinjer, felt, påslag og leverandørsøk. | Faktisk scrolling, fokus og tastatur på iPhone og PC. |
| Tilbudsmodaler | **Påvist feil:** `.quoteModal` hadde ingen maksimal høyde/egen rulling. I kort visningshøyde kunne knappene havne utenfor skjermen. **Rettet:** modal og backdrop har avgrensning mot `100dvh`, rulling inne i dialogen og minst 44 px høye knapper. | iOS Safari med tastatur oppe, rotering og zoom på ekte enhet. |
| Fakturaarkiv | Valgt handling styres av `selectedInvoiceAction`. Kun aktivt panel skal vises, med egne responsive CSS-kolonner og én kolonne på smale skjermer. | Ekte brukerinteraksjon, feltverdier og tilbakescroll etter bytte av handling. |
| MVA | Fullskjerm PDF/kvitteringsvisning bruker `100dvh`, eget rulleområde og låser bakgrunnsrulling; lukkeflyten forsøker å bevare scroll/fokus. | Ekte PDF/kvittering, kamera og tastatur i iOS Safari; ikke skriv/endre bilag. |
| Kontrast | Administrasjonen har separat lys fargemodus og eksplisitt mørk tekst på lyse inputfelt. | Visuell kontroll ved både lys og mørk systemmodus, 200 % zoom. |

### Lokal, isolert nettleserøvelse

Gjenskapt tilbudsmodal (en statisk HTML-fixture som bruker modalens relevante CSS, ikke en innlogget versjon av appen) ble testet i Chromium med viewportene **390×844**, **390×400**, **844×390** og **1280×800**. Før rettelsen havnet modalens bunn utenfor skjermen ved **390×400** og **844×390**. Etter CSS-justeringen holdt modalens bunn seg innenfor viewporten, og handlingsknappen kunne nås ved intern rulling i alle fire størrelser.

**Begrensning:** Denne testen viser bare layoutmekanismen i en lokal reproduksjon, ikke reell iOS Safari, faktisk produksjonsapp eller integrasjon med ekte innloggede data. Ingen test har simulert en faktisk iOS-skjermtastaturhendelse.

## 2. Trygg manuell sluttkontroll, steg for steg

De seks stegene er også lagt inn i den eksisterende veiledede `responsive`-testen i admin/utviklingsplan. Testveilederen viser ett steg av gangen der oppgaven er i testkøen:

1. **PC + iPhone:** Admin-forsiden, lang liste, 200 % zoom, lesbare knapper, sidemeny og ingen overlapp.
2. **iPhone:** Åpne en **usendt** tilbudskladd og kontroller materiallinjer, påslag, enheter, lange varenavn og leverandørsøk.
3. **iPhone:** Åpne «Send til annen e-post» uten å sende. Sjekk stående/liggende modus, tastaturet og om «Avbryt» alltid er tilgjengelig.
4. **Fakturaarkiv:** Velg eksisterende faktura, åpne/lukk én handling av gangen. Ikke registrer manuell betaling eller send purring/faktura.
5. **MVA på iPhone:** Åpne eksisterende bilag og PDF; prøv zoom, rulling og lukking. Bekreft at forrige skjermbilde og felter bevares. Ikke lagre.
6. **PC:** Gjenta fakturaarkiv og MVA, smal PC-bredde og høy zoom. Kontroller at tekst og handlingsknapper er synlige, også i modalene.

Dersom et steg ikke fungerer, noter en konkret feil og behold oppgaven åpen. Ikke godkjenn som gjennomført bare fordi automatiske tester passerer.

## 3. Ekstra kvalitetsfunn

`lib/developmentApprovalChecklist.js` hadde et gammelt eksempel som krevde **20 %** standardpåslag ved Bygger'n-vare. Bedriftens gjeldende standardsats er kontrollert til **15 %** i S-12. Veiledningen er oppdatert til 15 % med mulighet for dokumentert overstyring. Ingen faktisk påslag, varepris eller tilbud er endret.

## 4. Kontroll ved bygg

`scripts/smoke-s15-mobile-desktop-ui.mjs` kontrollerer at:

- Tilbudsmodalen har intern scroll, visuell høydebegrensning og minimumshøyde på knapper.
- Tidligere eksisterende responsive regler for tilbud, fakturaarkiv, MVA og admin-kontrast fortsatt finnes.
- De seks manuelle teststegene er formulert uten å utløse e-post eller betaling.
- Utdatert 20 %-krav ikke ligger i kontrollveilederen.

Byggsmoke er **statisk kontroll av kildekode**, ikke en visuell e2e-test.

## 5. Lukkevilkår

S-15 kan merkes teknisk forbedret når CSS og byggtest er publisert. S-15 kan **ikke lukkes som fullført brukertest** før alle seks reelle steg er utført på en innlogget iPhone/PC og eventuelle feil er rettet og retestet.

**Utleie, ekte betalingsstatus, beløp, kunder, regnskapsoriginaler og utsendinger er ikke endret.**
