# U-10 – Vipps utleie

Produksjon kontrollert 25.11.2026: begge utleieflagg er false, fire utleienøkler mangler. Ikke endre Service-nøkler eller betalingsflagg. Eksisterende betalingsflyt avgrenser leiebeløp fra depositum og bruker atomisk claim før opprettelse. Ny sikring: stabil idempotensnøkkel per betalingsreferanse, og en uklar 404 fra Vipps skal ikke opprette ny betaling. Ved manglende leverandørreferanse må operatøren avklare den før ny betaling. Ingen ekte betaling, webhookregistrering eller oppgjør utført.

Aktiveringskontroll etter egen avtale: registrer de fire nøklene sikkert i Vercel Production, bygg ny versjon, registrer riktig rental-webhook, test API/MSN/hendelser uten betaling, avklar separat godkjent kontrollert betaling og kontroll av capture, kvittering, refusjon, bankoppgjør og Tripletex. Før offentlig aktivering må U-08 testes isolert. Ingen aktivering uten uttrykkelig godkjenning.
