# Aadland Service – samlet praktisk sluttkontroll (25.11.2026)

Utleie er utenfor omfanget. Dette er en testplan, ikke dokumentasjon på at testene er bestått. Kilde: docs/systemkontroll-uten-utleie-2026-11-21.md, S32–S36 dokumenter og PR #227, #232, #233, #235, #237. 36 hovedpunkter. Bevar original kontrollhistorikk.

## Sikker gjennomføring
Bruk isolerte testdata og egne testkontoer; preview skal ikke sende ekte e-post eller opprette reelle betalinger. Ikke bruk produksjonskunde eller ekte regnskapsdokument som testobjekt. Reell e-post/Vipps/Tripletex-aktivitet krever kontrollert, særskilt godkjent test med eier; ingen fiktiv bokføring. Registrer testdato, miljø, forventet/faktisk resultat, bevis uten hemmeligheter, og bestått/feilet/ikke utført. Stopp ved avvik. S-14 (backup/restore) og S-36 (praktisk fil-/samtidighetstest) står åpne før risikoarbeid/masseimport.

## A. Blokkerende oppgaver
- [ ] S-14: godkjenn kryptert eksternt lagringsmål; faktiske database- og Storage-kopier; gjenopprett i isolert miljø, kontroller filer, Auth og avstenging av e-post/betaling.
- [ ] S-36: teknisk implementert, migrert og produksjon READY. 8991-raders syntetisk DB-test og sen feilrollback bestått. Innlogget filopplasting og faktisk parallelle aktiveringer gjenstår; ikke endre eksisterende katalog før verifisert.
- [ ] S-11: kontroller direkte Auth-signup og lekket passord; ingen abonnementsendring uten godkjenning.
- [ ] S-13: dokumenter DPA, lagringsplan, overføringer og cookie-/tredjepartsrevisjon; praktisk innsyn/sletting med identitetskontroll.

## B. Regnskap og betaling
- [ ] S-05: avstem de 18 kjøpsbilagene fra 21.11 mot faktiske Tripletex-ID-er, original, beløp, konto og MVA; e-postaksept er ikke bokføringsbevis.
- [ ] S-06: sammenhold MVA-terminer med faktiske innsendingskvitteringer og registrer dokumentert status.
- [ ] S-08: kontroller AS-WEB-2026-000004 i Tripletex før eventuell overføring; ikke opprett dublett.
- [ ] S-09: hent oppdaterte Vipps-oppgjør, avstem gebyr/saldo og eventuelle faktiske bankutbetalinger mot Tripletex.
- [ ] S-04/S-16: avstem restkrav, kreditnota, delbetaling og tvist; test varsel og gamle ukjente forsøk kontrollert uten ekte purring.
- [ ] S-22/S-25/S-30/S-32: kontrollert Service-Vipps-test fra bestilling/lagertrekk til retur, belastning, refusjon og oppgjør; test dobbeltklikk og usikkert leverandørsvar uten dobbeltbetaling; statusoppslag skal ikke sende e-post.
- [ ] S-26: kontrollert manuell betaling, kvitterings-PDF og dobbeltklikk; avstem historiske forsøk før handling.

## C. E-post og drift
- [ ] S-02/S-03: test tilbud og påminnelse med eieradresse, sendelås, Resend-ID og avstemming av ukjent sending.
- [ ] S-07: verifiser første aktuelle MVA-varsel (26.11.2026 dersom ikke levert), sjekk journal og mottak.
- [ ] S-17: les driftslogg, bekreft cron-kjøring/varsel; inkluder nye Service-jobber og avklar uavhengig scheduler-overvåking.
- [ ] S-20: test aksept/avslag og separate e-postbekreftelser til testkunde/eier, gjenoppretting og tilbud uten e-post.
- [ ] S-24/S-27: test befaring, oppstart, omplanlegging, påminnelse og ukjent Resend-status; ingen dobbelsending.
- [ ] S-29/S-31: kontroller intern registrering, mottak, innlogging og preview-sperre; ekte mail bare til godkjent eier/testmottaker.
- [ ] S-33: test manuell produktordre, automatisk køgjenoppretting, admin-filter og eieravstemming; kontroller cron og faktisk levering. Historiske ukjente forsøk skal ikke sendes automatisk.

## D. Brukeropplevelse og tilgang
- [ ] S-01/S-18: usendt testkalkyle på mobil/PC: 15 % standard, 400 eks. MVA timepris, 5,30/km og eksplisitt bom; avstem faktisk rute.
- [ ] S-12: kontroller prisalder/varsler og innhent godkjent oppdatert prisliste. Vent på S-36 før masseimport.
- [ ] S-15: iPhone/PC, liggende/stående, tastatur, 200 % zoom, modaler, kontrast, fakturaarkiv, MVA og PDF.
- [ ] S-19: to egne testkontoer, gyldig/utløpt/sperret tilbudslenke, ingen tilgang til andre kunders data.
- [ ] S-21: mobil-/PC-opplasting, korrekt kvitteringsbinding, 24-timers opprydding og karantene; ikke slett ekte filer.
- [ ] S-23: innlogget leser kan se 2D/3D/PDF, men ikke endre; autorisert testredigering separat.
- [ ] S-28: ekte tjenestetekster og autoriserte referansebilder; sjekk navigasjon på mobil og PC.
- [ ] S-35: innlogget test med flere sider, kontroll av totale poster og kundeavgrensning; konto byttes uten lekkasje. Offset kan forskyves ved samtidige endringer.

## E. Teknisk oppfølging
- [x] S-10: dokumentert funksjons-/triggerkontroll i produksjonsdatabase.
- [ ] S-34: ny fakturaindeks installert/verifisert; resterende 12 Service-fremmednøkkelindekser vurderes ved dokumentert behov. Ingen sletting av ubrukte indekser uten dokumentasjon.
- [ ] S-35: preview og produksjon READY; innlogget test gjenstår.


## Admin-testvindu
25 separate Service-testbokser, tre kontrollsteg per boks, i eksisterende /admin/utviklingsplan. Tidligere oppgaver beholdes i eget filter. Lokale delsteg, serverlagret endelig eiergodkjenning og feilnotater. Ingen test er godkjent automatisk. S-10 dokumentert teknisk lukket og S-34 oppfølging ved vekst beholdes i denne listen, ikke som brukerprøve.
