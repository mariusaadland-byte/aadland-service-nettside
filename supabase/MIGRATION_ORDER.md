# Produksjonsrekkefølge for Supabase

For et nytt/tomt Supabase-prosjekt kan `ALL_MIGRATIONS.sql` kjøres som samlet migrasjon. Den holdes synkron med filene under.

Ved trinnvis kjøring brukes denne rekkefølgen:

1. `schema.sql` – produkter, ordre, kategorier, `admin_users`, offentlig `product-images` og privat `contact-images`.
2. `commerce.sql` – lager, frakt, betalings-/leveringsfelter og atomisk lagerreservasjon.
3. `surveys.sql` – befaringstid og interne notater på ordre.
4. `rental.sql` – utleieutstyr, blokkeringer, bookinger og atomisk booking.
5. `customers.sql` – kundekontoer. Må kjøres etter både ordre og utleie fordi den refererer til begge.
6. `projects.sql` – referanseprosjekter og prosjekttegninger.
7. `services.sql` – administrerbare tjenester.
8. `site-settings.sql` – innhold og kontaktdata for forsiden.
9. `quotes.sql` – tilbud, tilbudsnummer, betalingsplan og tilbudsstatus.
10. `quote_to_order.sql` – kobler et godkjent tilbud til oppdraget som opprettes i backoffice.
11. `quote_start_date.sql` – legger til planlagt oppstart som kan vises direkte til kunden i tilbudet.

## Første eierkonto

Migrasjonen oppretter tabellen `admin_users`, men oppretter med vilje ikke en Auth-bruker eller et standardpassord. Før backoffice kan brukes må den første eieren finnes i Supabase Auth og kobles til `admin_users` med samme UUID:

```sql
insert into public.admin_users (
  id,email,name,role,
  can_view_orders,can_update_orders,can_manage_products,can_manage_users,active
)
select
  id,email,'Marius Aadland','owner',
  true,true,true,true,true
from auth.users
where lower(email)=lower('BYTT_TIL_EIERENS_EPOST')
on conflict (id) do update set
  email=excluded.email,
  name=excluded.name,
  role='owner',
  can_view_orders=true,
  can_update_orders=true,
  can_manage_products=true,
  can_manage_users=true,
  active=true,
  updated_at=now();
```

Kontroller at spørringen faktisk opprettet/oppdaterte én rad. Ikke legg e-postadresse, passord eller Auth-UUID inn som hemmelighet i repoet.

## Etter SQL

- Bekreft at `contact-images` er privat og `product-images` er offentlig.
- Bekreft at første eier kan logge inn på `/admin` og at brukeradministrasjonen åpner.
- Test produkt/kategori CRUD og produktbildeopplasting i backoffice.
- Test forespørsel med bilde og at bildet bare kan vises via innlogget backoffice.
- Test ordre, befaring, utleie og kundekonto.
- Test tilbud fra kladd → sendt → kundegodkjenning → opprett oppdrag, og kontroller at tilbudet vises på kundens Min side.
- Test passordgjenoppretting for både admin og kundekonto. Produksjons-URL-ene `/admin/nytt-passord` og `/min-side/nytt-passord` må være tillatt i Supabase Auth redirect URLs.
- Test at eksisterende data fortsatt kan leses før testgrenen merges til `main`.

SQL-filene er laget idempotente der det er praktisk, men produksjonskjøring skal fortsatt gjøres kontrollert.

12. `job_planning.sql` – lagrer avtalt oppstart, videre avtale med kunden og tidspunkt for sendt planleggingsbekreftelse.

13. `quote_followups.sql` – aktiverer automatisk, én gangs oppfølgingsmail på sendte tilbud etter omtrent to døgn.

14. `security_hardening_20260923.sql` – strammer inn event-trigger-rettigheter, optimaliserer admin-policy og legger indeks på `quotes.created_by`.

15. `survey_reminders.sql` – sporer bekreftelse på avtalt befaring og aktiverer én automatisk påminnelse før timen.
