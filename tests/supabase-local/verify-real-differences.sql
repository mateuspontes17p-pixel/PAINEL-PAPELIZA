-- Verificações que o stub não pegava: privilégios padrão do Supabase (funções novas ganham EXECUTE para anon/authenticated).
do $$
declare bad text;
begin
  select string_agg(p.proname || ' → ' || r.rolname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace, pg_roles r
  where n.nspname = 'public' and p.proname in ('appearance_config_valid','publish_appearance','restore_appearance')
    and r.rolname = 'anon' and has_function_privilege(r.rolname, p.oid, 'execute');
  assert bad is null, 'anon pode executar: ' || coalesce(bad, '');
  assert (select count(*) from pg_tables where schemaname = 'public' and tablename like 'storefront%' and not rowsecurity) = 0, 'tabela sem RLS';
  assert not has_table_privilege('anon', 'public.storefront_appearance', 'insert,update,delete'), 'anon escreve na aparência';
  assert not has_table_privilege('anon', 'public.storefront_appearance_history', 'select'), 'anon lê histórico';
  assert not has_column_privilege('anon', 'public.storefront_appearance', 'draft', 'select'), 'anon lê rascunho';
  assert has_column_privilege('anon', 'public.storefront_appearance', 'published', 'select'), 'anon não lê a versão publicada';
  assert (select count(*) from public.catalog_products) = 2 and (select count(*) from public.stores) = 2, 'catálogo/lojas alterados';
end $$;
select 'PASS: anon sem EXECUTE nas funções de aparência, RLS ativo, rascunho/histórico privados, catálogo intacto';
