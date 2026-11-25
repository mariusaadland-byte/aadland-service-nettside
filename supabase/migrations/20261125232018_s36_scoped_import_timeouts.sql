-- Scope longer REST RPC execution budgets to the three private catalog import functions.
-- Preserve existing 3s lock timeout, authorization, atomic activation and global role limits.
alter function public.activate_material_import(uuid,text,text) set statement_timeout to '30s';
alter function public.preview_material_import(text,text,text,text,jsonb,integer) set statement_timeout to '30s';
alter function public.finish_large_material_import(uuid,text,text,text,text,integer,integer,integer) set statement_timeout to '30s';
notify pgrst, 'reload schema';
