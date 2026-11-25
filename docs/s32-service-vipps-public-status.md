## S-32 – offentlig Vipps-status (Service)

Offentlig statusvisning sender ikke lenger Service-kvitteringer eller refusjonsmeldinger. Verifisert webhook, autentisert admin og eksisterende planlagt kvitteringsjobb beholdes. Vanlig polling leser lagret status; eksplisitt refresh for ikke-terminal Service-betaling krever produksjonsmiljø, lagret gyldig Vipps-referanse og en atomisk rate-limit på maksimalt ett forsøk per ordre per 10 sekunder på tvers av klienter og referansealias. Ved sperre vises sist lagret status. Eksisterende IP-grense beholdes. Utleiegrenen er uendret.

Regresjon i `scripts/smoke-s32-service-vipps-public-status.mjs` kjøres ved bygg. Før produksjonssetting må preview-build godkjennes. Reell kontroll av returvisning, webhook og kvitteringslevering gjenstår; ingen reell betaling eller mail er startet av denne endringen.
