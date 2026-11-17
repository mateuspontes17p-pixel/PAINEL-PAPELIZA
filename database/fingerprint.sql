-- FINGERPRINT SOMENTE LEITURA do que a migração NÃO pode alterar. Rode ANTES e DEPOIS e compare as saídas:
-- devem ser idênticas linha a linha. Não grava nada e não expõe dados (apenas contagens e hashes md5).
-- Exclui deliberadamente os objetos novos (storefront_*, publish/restore/appearance_config_valid).
select 'stores' as item, count(*)::text || ' | ' || coalesce(md5(string_agg(s::text, '#' order by s.id)), '-') as valor from public.stores s
union all select 'catalog_categories', count(*)::text || ' | ' || coalesce(md5(string_agg(c::text, '#' order by c.store_id, c.name)), '-') from public.catalog_categories c
union all select 'catalog_products', count(*)::text || ' | ' || coalesce(md5(string_agg(p::text, '#' order by p.store_id, p.id)), '-') from public.catalog_products p
union all select 'admin_access (hash)', count(*)::text || ' | ' || coalesce(md5(string_agg(a::text, '#' order by a.email, a.store_id)), '-') from private.admin_access a
union all select 'auth.users (id/email/confirmado)', count(*)::text || ' | ' || coalesce(md5(string_agg(u.id::text || coalesce(u.email,'') || (u.email_confirmed_at is not null)::text, '#' order by u.id)), '-') from auth.users u
union all select 'storage catalog-images (nomes)', count(*)::text || ' | ' || coalesce(md5(string_agg(o.name, '#' order by o.name)), '-') from storage.objects o where o.bucket_id = 'catalog-images'
union all select 'storage bucket config', coalesce(md5(string_agg(b::text, '#' order by b.id)), '-') from (select id, public, file_size_limit, allowed_mime_types from storage.buckets) b
union all select 'policies public/storage (existentes)', count(*)::text || ' | ' || coalesce(md5(string_agg(schemaname || tablename || policyname || cmd || roles::text || coalesce(qual,'') || coalesce(with_check,''), '#' order by schemaname, tablename, policyname)), '-')
  from pg_policies where (schemaname = 'public' and tablename not like 'storefront%') or (schemaname = 'storage' and tablename = 'objects')
union all select 'funções existentes (definição+permissões)', count(*)::text || ' | ' || coalesce(md5(string_agg(pg_get_functiondef(p.oid) || coalesce(p.proacl::text, ''), '#' order by n.nspname, p.proname)), '-')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname = 'public' and p.proname = 'authorized_store_ids') or (n.nspname = 'private' and p.proname = 'catalog_touch')
union all select 'permissões das tabelas existentes', coalesce(md5(string_agg(n.nspname || c.relname || coalesce(c.relacl::text, '') || c.relrowsecurity::text, '#' order by n.nspname, c.relname)), '-')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and ((n.nspname = 'public' and c.relname in ('stores','catalog_categories','catalog_products')) or (n.nspname = 'private' and c.relname = 'admin_access') or (n.nspname = 'storage' and c.relname in ('objects','buckets')))
union all select 'colunas das tabelas existentes', md5(string_agg(table_schema || table_name || column_name || data_type || is_nullable || coalesce(column_default,''), '#' order by table_schema, table_name, ordinal_position))
  from information_schema.columns where (table_schema = 'public' and table_name in ('stores','catalog_categories','catalog_products')) or (table_schema = 'private' and table_name = 'admin_access')
order by 1;
