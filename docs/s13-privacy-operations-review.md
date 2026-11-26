# S13 – praktisk personvernkontroll 26.11.2026

Status: kodeinventar og forslag til intern rutine, ikke godkjent behandlingsprotokoll eller utført rettighetstest. Service-only. Ingen personopplysninger eksportert, ingen konto eller vedlegg slettet.

## Nettleserlagring (statisk kodekontroll)
- Kundesesjon: 30 dager; admin: 14 dager. HttpOnly, Secure i produksjon, SameSite Lax.
- SessionStorage: tjenestevalg, gjenkjøpsvalg og tilbudstilgang. Tilbudstoken fjernes fra adresselinjen og er tidsbegrenset på serveren. Intern overføring av kalkyle/tegning/tilbudsutkast kan inneholde arbeidsdata.
- LocalStorage: kalkulator, materialutkast, katalog/favoritter, testfremdrift, valgfrie lokale skriverinnstillinger. PIN er en lokal legitimasjonsopplysning: bruk betrodd enhet, ikke legg PIN i dokumentasjon, logger eller Git. Eksisterende fjerningsknapp skal brukes ved delt eller utrangert enhet.
- Root layout har ingen analytics-tag. Kodesøk ga ingen treff på googletagmanager eller @vercel/analytics. Dette er ikke en komplett nettverkstest og utelukker ikke tredjepartsskript, andre SDK-er eller forespørsler i innloggede visninger. Gjennomfør nettverks- og lagringskontroll i ren nettleser på offentlige sider, Min side og admin. Dokumenter formål, leverandør, varighet og grunnlag per funn før eventuell ikke-nødvendig lagring tas i bruk.

## Forslag til intern rettighetsrutine – eier må godkjenne
1. Registrer mottaksdato, type forespørsel, ansvarlig og frist i et tilgangsbegrenset saksregister. Bruk minimum nødvendige opplysninger; ikke legg persondata i GitHub.
2. Kontroller identitet med egnet metode, uten å samle inn overflødig legitimasjon. Ikke del informasjon før identiteten og eventuell fullmakt er tilstrekkelig kontrollert.
3. Finn relevant informasjon i kundeprofil, henvendelser, tilbud, ordre, faktura, tegninger, dokumenter og relevante eksterne systemer. Avgrens til rett person, vurder andres rettigheter.
4. Ved sletting: kartlegg lovpålagt bevaring, åpne krav og nødvendige transaksjonsreferanser. Ikke slett originale regnskapsdokumenter i strid med oppbevaringsplikt. Vurder begrensning, retting eller sletting av øvrige opplysninger. Ingen generell massedelete. Avklar eksterne leverandører, sikkerhetskopier og gjenoppretting.
5. Send resultat via sikker kanal, dokumenter hva som er gjort og grunnlaget for eventuell begrensning. Eskaler uavklart lovgrunnlag eller frist til eier/regnskapsfører/personvernrådgiver.
6. Test først med egne syntetiske kontoer i isolert miljø, uten produksjonssending eller sletting. Registrer bevis uten kundenavn eller hemmeligheter.

## Lagringsplan og leverandører – restpunkter
Fastsett konkrete frister per kategori: urealiserte henvendelser, tilbud, avsluttede oppdrag, kontoer, tekniske logger, og sikkerhetskopier; regnskapsoriginaler håndteres særskilt. Vurder aktive krav før sletting. Kontaktbildeoppryddingen er avgrenset til ubundne bilder, ikke alle kundebilder. DPA/roller, underleverandører og faktiske overføringsgrunnlag for Supabase, Vercel, Resend, Vipps, Tripletex og passordoppslaget må kontrolleres mot avtaler og konfigurasjon. Ingen DPA er lest eller godkjent i denne kontrollen. Ingen automatisk slettefrist eller masseeksport innføres.
