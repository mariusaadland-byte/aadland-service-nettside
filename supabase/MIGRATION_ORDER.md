# Produksjonsrekkefølge for Supabase

Kjør disse filene i denne rekkefølgen når testgrenen er godkjent. Ikke hopp over trinn.

1. `schema.sql` – produkter, ordre, kategorier og privat `contact-images`-bucket.
2. `commerce.sql` – lager, frakt, betalings-/leveringsfelter og ordreindekser.
3. `surveys.sql` – befaringstid og interne notater på ordre.
4. `rental.sql` – utleieutstyr, blokkeringer og bookinger.
5. `customers.sql` – kundekontoer. Må kjøres etter både ordre og utleie fordi den refererer til begge.
6. `projects.sql` – referanseprosjekter og prosjekttegninger.
7. `services.sql` – administrerbare tjenester.
8. `site-settings.sql` – innhold og kontaktdata for forsiden.

## Etter SQL

- Bekreft at `contact-images` finnes og er privat. `product-images` skal fortsatt være offentlig for produktbilder.
- Test produkt/kategori CRUD i backoffice.
- Test forespørsel med bilde og at bildet bare kan vises via innlogget backoffice.
- Test ordre, befaring, utleie og kundekonto.
- Test at eksisterende data fortsatt kan leses før testgrenen merges til `main`.

SQL-filene er laget idempotente der det er praktisk, men produksjonskjøring skal fortsatt gjøres kontrollert og i rekkefølgen over.
