-- Explicitly allow service-role writes to execute the quote edit guard.
grant execute on function public.guard_quote_email_dispatch() to service_role;
