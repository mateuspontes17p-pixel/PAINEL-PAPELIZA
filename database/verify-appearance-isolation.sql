-- Verifica isolamento e regras da aparência da vitrine. Tudo é revertido no final (rollback).
-- Rodar somente depois de aplicar database/storefront-appearance.sql, em teste antes de produção.
begin;
insert into auth.users(id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'aparencia-lapis@example.invalid', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'aparencia-london@example.invalid', now());
insert into private.admin_access(email, store_id)
  select 'aparencia-lapis@example.invalid', id from public.stores where slug = 'lapis-de-cor';
insert into private.admin_access(email, store_id)
  select 'aparencia-london@example.invalid', id from public.stores where slug = 'london-papelaria';
select set_config('test.lapis', (select id::text from public.stores where slug = 'lapis-de-cor'), true);
select set_config('test.london', (select id::text from public.stores where slug = 'london-papelaria'), true);

-- Administrador da Lápis de Cor
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
do $$
declare lapis uuid := current_setting('test.lapis')::uuid; london uuid := current_setting('test.london')::uuid;
        n integer; v integer; before_ts timestamptz; after_ts timestamptz; img text;
begin
  insert into public.storefront_appearance(store_id, draft_template_id, draft)
    values (lapis, 'lapis-de-cor', '{"version":1,"colors":{"primary":"#112233"},"texts":{"heroTitle":"Linha 1\nLinha 2"}}');
  assert (select count(*) from public.storefront_appearance) = 1, 'Admin deveria ver somente a própria loja';

  begin insert into public.storefront_appearance(store_id, draft_template_id) values (london, 'london');
    raise exception 'Gravação em outra loja permitida'; exception when insufficient_privilege then null; end;

  -- validação no servidor
  begin update public.storefront_appearance set draft = '{"colors":{"primary":"red"}}' where store_id = lapis; raise exception 'Cor inválida aceita'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = '{"texts":{"heroTitle":"<script>alert(1)</script>"}}' where store_id = lapis; raise exception 'HTML aceito em texto'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = '{"css":"body{display:none}"}' where store_id = lapis; raise exception 'Chave desconhecida aceita'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = '{"texts":{"storeName":"a\nb"}}' where store_id = lapis; raise exception 'Quebra de linha aceita em campo de uma linha'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = '{"texts":{"heroTitle":"a\nb\nc"}}' where store_id = lapis; raise exception 'Três linhas aceitas'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = jsonb_build_object('texts', jsonb_build_object('heroSubtitle', repeat('x', 201))) where store_id = lapis; raise exception 'Texto longo aceito'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = '{"contact":{"whatsapp":"abc"}}' where store_id = lapis; raise exception 'WhatsApp inválido aceito'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = '{"contact":{"mapUrl":"https://www.google.com.evil.example/maps"}}' where store_id = lapis; raise exception 'Mapa fora do domínio aceito'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = '{"texts":{"address":"a\nb\nc"}}' where store_id = lapis; raise exception 'Endereço com 3 linhas aceito'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = '{"texts":{"aboutText":"a\nb"}}' where store_id = lapis; raise exception 'Texto sobre com quebra aceito'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = '{"contact":{"instagram":"https://evil.example/x"}}' where store_id = lapis; raise exception 'Instagram fora do domínio aceito'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = jsonb_build_object('images', jsonb_build_object('logoPath', london::text || '/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png')) where store_id = lapis;
    raise exception 'Imagem de outra loja aceita'; exception when check_violation then null; end;
  begin update public.storefront_appearance set draft = jsonb_build_object('images', jsonb_build_object('logoPath', lapis::text || '/../x.png')) where store_id = lapis;
    raise exception 'Caminho com .. aceito'; exception when check_violation then null; end;
  img := lapis::text || '/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
  update public.storefront_appearance set draft = jsonb_build_object('version', 1, 'images', jsonb_build_object('logoPath', img),
    'contact', '{"whatsapp":"5543999999999","instagram":"https://www.instagram.com/lapisdecor/"}'::jsonb) where store_id = lapis;
  get diagnostics n = row_count; assert n = 1, 'Imagem da própria loja deveria ser aceita';

  -- colunas publicadas não são graváveis diretamente (contornaria a regra de modelo e o histórico)
  begin update public.storefront_appearance set published_version = 99 where store_id = lapis; raise exception 'Escrita direta em published_version'; exception when insufficient_privilege then null; end;
  begin update public.storefront_appearance set published = draft, published_template_id = 'lapis-de-cor' where store_id = lapis; raise exception 'Escrita direta em published'; exception when insufficient_privilege then null; end;

  -- concorrência: updated_at muda a cada gravação
  select updated_at into before_ts from public.storefront_appearance where store_id = lapis;
  update public.storefront_appearance set draft = draft where store_id = lapis;
  select updated_at into after_ts from public.storefront_appearance where store_id = lapis;
  assert after_ts > before_ts, 'updated_at não mudou';

  -- publicar
  v := public.publish_appearance(lapis); assert v = 1, 'Primeira publicação deveria ser v1';
  assert (select published_template_id from public.storefront_appearance where store_id = lapis) = 'lapis-de-cor', 'Modelo publicado incorreto';
  assert (select count(*) from public.storefront_appearance_history where store_id = lapis and version = 1) = 1, 'Histórico não registrado';
  begin perform public.publish_appearance(london); raise exception 'Publicou em outra loja'; exception when insufficient_privilege then null; end;

  -- modelo de outra loja: prévia/rascunho sim, publicação não
  update public.storefront_appearance set draft_template_id = 'london' where store_id = lapis;
  begin perform public.publish_appearance(lapis); raise exception 'Publicou modelo de outra loja'; exception when insufficient_privilege then null; end;
  assert (select published_version from public.storefront_appearance where store_id = lapis) = 1, 'Versão mudou apesar da recusa';

  -- nova publicação e restauração (vai para o rascunho, nada vai ao ar)
  update public.storefront_appearance set draft_template_id = 'lapis-de-cor', draft = '{"version":1,"colors":{"primary":"#445566"}}' where store_id = lapis;
  v := public.publish_appearance(lapis); assert v = 2, 'Segunda publicação deveria ser v2';
  perform public.restore_appearance(lapis, 1);
  assert (select draft #>> '{contact,whatsapp}' from public.storefront_appearance where store_id = lapis) = '5543999999999'
     and (select draft #>> '{colors,primary}' from public.storefront_appearance where store_id = lapis) is null, 'Restauração não trouxe a versão 1';
  assert (select published #>> '{colors,primary}' from public.storefront_appearance where store_id = lapis) = '#445566', 'Restauração alterou a versão pública';
  begin perform public.restore_appearance(london, 1); raise exception 'Restaurou outra loja'; exception when sqlstate 'P0002' then null; end;

  -- histórico imutável e isolado
  begin update public.storefront_appearance_history set version = 9 where store_id = lapis; raise exception 'Histórico alterável'; exception when insufficient_privilege then null; end;
end $$;
do $$
declare lapis uuid := current_setting('test.lapis')::uuid;
begin
  begin delete from public.storefront_appearance_history where store_id = lapis; raise exception 'Histórico apagável'; exception when insufficient_privilege then null; end;
  begin delete from public.storefront_appearance where store_id = lapis; raise exception 'Aparência apagável pelo cliente'; exception when insufficient_privilege then null; end;
  assert (select count(*) from public.storefront_appearance_history) = 2, 'Histórico deveria ter 2 versões';
end $$;
reset role;

-- Administrador da London: não enxerga nem altera a Lápis de Cor
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);
set local role authenticated;
do $$
declare lapis uuid := current_setting('test.lapis')::uuid; n integer;
begin
  assert (select count(*) from public.storefront_appearance) = 0, 'London lê aparência da Lápis de Cor';
  assert (select count(*) from public.storefront_appearance_history) = 0, 'London lê histórico da Lápis de Cor';
  update public.storefront_appearance set draft = '{"version":1}' where store_id = lapis; get diagnostics n = row_count; assert n = 0, 'London alterou rascunho da Lápis';
  begin perform public.publish_appearance(lapis); raise exception 'London publicou na Lápis'; exception when insufficient_privilege then null; end;
  begin perform public.restore_appearance(lapis, 1); raise exception 'London restaurou a Lápis'; exception when sqlstate 'P0002' then null; end;
end $$;
reset role;

-- Visitante anônimo: só colunas publicadas; rascunho e histórico inacessíveis
set local role anon;
do $$
declare lapis uuid := current_setting('test.lapis')::uuid; london uuid := current_setting('test.london')::uuid;
begin
  assert (select count(*) from public.storefront_appearance where store_id = lapis) = 1, 'Visitante deveria ler a aparência publicada';
  assert (select published #>> '{colors,primary}' from public.storefront_appearance where store_id = lapis) = '#445566', 'Visitante deveria ver a versão publicada (v2)';
  assert (select count(*) from public.storefront_appearance where store_id = london) = 0, 'Loja sem publicação não deveria aparecer';
  begin perform draft from public.storefront_appearance; raise exception 'Visitante leu o rascunho'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.storefront_appearance_history; raise exception 'Visitante leu o histórico'; exception when insufficient_privilege then null; end;
  begin insert into public.storefront_appearance(store_id, draft_template_id) values (london, 'london'); raise exception 'Visitante gravou'; exception when insufficient_privilege then null; end;
  begin perform public.publish_appearance(lapis); raise exception 'Visitante publicou'; exception when insufficient_privilege then null; end;
  assert (select count(*) from public.storefront_templates) = 2, 'Visitante deveria ver o catálogo de modelos';
end $$;
reset role;
rollback;
select 'Passed: isolamento entre lojas, validação no servidor, publicação com histórico, restauração para rascunho, gate de modelo e acesso anônimo restrito. Tudo revertido.' as verification;
