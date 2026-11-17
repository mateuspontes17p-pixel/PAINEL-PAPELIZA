-- PRÉ-CHECAGEM SOMENTE LEITURA do PAINEL 2 (nenhuma escrita). Esperado ANTES de aplicar qualquer coisa:
-- tudo vazio e privilégios padrão iguais aos do projeto real. Cada linha deve estar 'OK'.
select 'public vazio' as checagem, case when (select count(*) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','m','S','p')) = 0 and (select count(*) from pg_proc where pronamespace='public'::regnamespace) = 0 then 'OK' else 'FALHOU' end as resultado
union all select 'schema private ausente', case when not exists (select 1 from pg_namespace where nspname='private') then 'OK' else 'FALHOU' end
union all select 'sem usuários', case when (select count(*) from auth.users) = 0 then 'OK' else 'FALHOU' end
union all select 'sem buckets/objetos', case when (select count(*) from storage.buckets) = 0 and (select count(*) from storage.objects) = 0 then 'OK' else 'FALHOU' end
union all select 'sem políticas em storage.objects', case when (select count(*) from pg_policies where schemaname='storage' and tablename='objects') = 0 then 'OK' else 'FALHOU' end
union all select 'privilégios padrão em public (anon/authenticated/service_role)', case when (select count(*) from pg_default_acl where defaclnamespace='public'::regnamespace and defaclacl::text like '%anon=%' and defaclacl::text like '%authenticated=%' and defaclacl::text like '%service_role=%') >= 3 then 'OK' else 'FALHOU' end
union all select 'storage.objects: anon/authenticated com arwd', case when (select relacl::text from pg_class where oid='storage.objects'::regclass) like '%anon=arwd%' and (select relacl::text from pg_class where oid='storage.objects'::regclass) like '%authenticated=arwd%' then 'OK' else 'FALHOU' end
order by 1;
