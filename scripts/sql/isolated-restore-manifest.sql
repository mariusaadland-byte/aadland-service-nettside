-- Synthetic fixture only. Output includes counts/digests, not raw rows.
select format('select %L, count(*), encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text, chr(10) order by to_jsonb(t)::text collate "C"),''''),''UTF8'')),''hex'') from %I.%I t;',n.nspname||'.'||c.relname,n.nspname,c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','auth','signing_ci','backup_ci') and c.relkind='r'
order by n.nspname,c.relname
\gexec
select n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('anon',c.oid,'SELECT'),has_table_privilege('authenticated',c.oid,'SELECT'),has_table_privilege('service_role',c.oid,'SELECT')
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','auth','signing_ci','backup_ci') and c.relkind in ('r','v')
order by n.nspname,c.relname;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,
 has_function_privilege('anon',p.oid,'EXECUTE'),has_function_privilege('authenticated',p.oid,'EXECUTE'),has_function_privilege('service_role',p.oid,'EXECUTE'),
 encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','auth','signing_ci','backup_ci') and p.prokind in ('f','p')
order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
