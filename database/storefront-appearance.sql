-- Aparência da vitrine por loja (editor visual). NÃO APLICADO: executar somente após aprovação,
-- primeiro em uma branch/projeto de teste do Supabase e depois de um backup do projeto real.
-- Aditivo: cria tabelas e funções novas; não altera nem apaga produtos, categorias, usuários ou lojas.
-- Depende de objetos já existentes: public.stores, public.authorized_store_ids(), private.catalog_touch().
-- Rollback: database/storefront-appearance-rollback.sql
begin;

-- Catálogo de modelos. Um modelo só pode ser publicado pela loja de origem até ser marcado como genérico
-- (sem endereço, horários e contatos de outra loja no HTML).
create table public.storefront_templates (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  native_store_slug text,
  generic boolean not null default false
);
insert into public.storefront_templates(id, name, native_store_slug, generic) values
  ('london', 'London', 'london-papelaria', false),
  ('lapis-de-cor', 'Lápis de Cor', 'lapis-de-cor', false);

-- Mesma validação de public/template-registry.js. O banco é a autoridade: o navegador só ajuda.
create function public.appearance_config_valid(p_store uuid, cfg jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; t text; lim integer;
begin
  if cfg is null or jsonb_typeof(cfg) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(cfg) x where x not in ('version','colors','texts','contact','images')) then return false; end if;
  if cfg ? 'version' and cfg->'version' <> '1'::jsonb then return false; end if;
  if cfg ? 'colors' then
    if jsonb_typeof(cfg->'colors') <> 'object' then return false; end if;
    for k, v in select key, value from jsonb_each(cfg->'colors') loop
      if k not in ('primary','accent') or jsonb_typeof(v) <> 'string' or (v #>> '{}') !~* '^#[0-9a-f]{6}$' then return false; end if;
    end loop;
  end if;
  if cfg ? 'texts' then
    if jsonb_typeof(cfg->'texts') <> 'object' then return false; end if;
    for k, v in select key, value from jsonb_each(cfg->'texts') loop
      lim := case k when 'storeName' then 80 when 'heroEyebrow' then 40 when 'heroTitle' then 80 when 'heroHighlight' then 80 when 'heroSubtitle' then 200 else null end;
      if lim is null or jsonb_typeof(v) <> 'string' then return false; end if;
      t := v #>> '{}';
      if length(t) = 0 or length(t) > lim or t ~ '[<>]' or t ~ '[\x01-\x09\x0b-\x1f\x7f]' then return false; end if;
      if k <> 'heroTitle' and position(E'\n' in t) > 0 then return false; end if;
      if k = 'heroTitle' and length(t) - length(replace(t, E'\n', '')) > 1 then return false; end if;
    end loop;
  end if;
  if cfg ? 'contact' then
    if jsonb_typeof(cfg->'contact') <> 'object' then return false; end if;
    for k, v in select key, value from jsonb_each(cfg->'contact') loop
      if jsonb_typeof(v) <> 'string' then return false; end if;
      t := v #>> '{}';
      if k = 'whatsapp' then
        if t !~ '^[0-9]{10,15}$' then return false; end if;
      elsif k = 'instagram' then
        if t !~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?$' then return false; end if;
      else return false; end if;
    end loop;
  end if;
  if cfg ? 'images' then
    if jsonb_typeof(cfg->'images') <> 'object' then return false; end if;
    for k, v in select key, value from jsonb_each(cfg->'images') loop
      if k not in ('logoPath','bannerPath') or jsonb_typeof(v) <> 'string' then return false; end if;
      if (v #>> '{}') !~* ('^' || p_store::text || '/branding/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$') then return false; end if;
    end loop;
  end if;
  return true;
end $$;

-- Uma linha por loja: rascunho (privado) e versão publicada (pública).
create table public.storefront_appearance (
  store_id uuid primary key references public.stores(id) on delete cascade,
  draft_template_id text not null references public.storefront_templates(id),
  draft jsonb not null default '{"version":1}'::jsonb,
  published_template_id text references public.storefront_templates(id),
  published jsonb not null default '{"version":1}'::jsonb,
  published_version integer not null default 0 check (published_version >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appearance_draft_valid check (public.appearance_config_valid(store_id, draft)),
  constraint appearance_published_valid check (public.appearance_config_valid(store_id, published)),
  constraint appearance_published_pair check ((published_version = 0) = (published_template_id is null))
);
create trigger storefront_appearance_updated before update on public.storefront_appearance
  for each row execute function private.catalog_touch();

-- Histórico imutável das versões publicadas (base da restauração).
create table public.storefront_appearance_history (
  store_id uuid not null references public.stores(id) on delete cascade,
  version integer not null check (version > 0),
  template_id text not null references public.storefront_templates(id),
  config jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (store_id, version),
  constraint appearance_history_valid check (public.appearance_config_valid(store_id, config))
);

alter table public.storefront_templates enable row level security;
alter table public.storefront_appearance enable row level security;
alter table public.storefront_appearance_history enable row level security;
revoke all on public.storefront_templates, public.storefront_appearance, public.storefront_appearance_history from public, anon, authenticated;

-- Visitantes: apenas as colunas publicadas. O rascunho nunca é legível sem autenticação.
grant select on public.storefront_templates to anon, authenticated;
grant select (store_id, published_template_id, published, published_version, published_at) on public.storefront_appearance to anon;
-- Administradores: leem tudo da própria loja, gravam somente o rascunho.
-- Colunas publicadas só mudam pela função publish_appearance (valida o modelo e registra o histórico).
grant select on public.storefront_appearance to authenticated;
grant insert (store_id, draft_template_id, draft) on public.storefront_appearance to authenticated;
grant update (draft_template_id, draft) on public.storefront_appearance to authenticated;
grant select, insert on public.storefront_appearance_history to authenticated;

create policy template_public_read on public.storefront_templates for select to anon, authenticated using (true);
create policy appearance_public_read on public.storefront_appearance for select to anon using (published_template_id is not null);
create policy appearance_admin_read on public.storefront_appearance for select to authenticated using (store_id in (select public.authorized_store_ids()));
create policy appearance_admin_insert on public.storefront_appearance for insert to authenticated with check (store_id in (select public.authorized_store_ids()));
create policy appearance_admin_update on public.storefront_appearance for update to authenticated
  using (store_id in (select public.authorized_store_ids())) with check (store_id in (select public.authorized_store_ids()));
create policy appearance_history_admin_read on public.storefront_appearance_history for select to authenticated using (store_id in (select public.authorized_store_ids()));
create policy appearance_history_admin_insert on public.storefront_appearance_history for insert to authenticated with check (store_id in (select public.authorized_store_ids()));

-- Publica o rascunho: copia para a versão pública, incrementa a versão e registra o histórico, de forma atômica.
-- SECURITY DEFINER para poder gravar as colunas publicadas; a autorização é verificada aqui dentro.
create function public.publish_appearance(p_store uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if p_store is null or p_store not in (select public.authorized_store_ids()) then
    raise exception 'Sem permissão para publicar nesta loja.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.storefront_appearance a
    join public.storefront_templates t on t.id = a.draft_template_id
    join public.stores s on s.id = a.store_id
    where a.store_id = p_store and (t.generic or t.native_store_slug = s.slug)
  ) then
    raise exception 'Este modelo ainda não pode ser publicado para esta loja.' using errcode = '42501';
  end if;
  update public.storefront_appearance
     set published = draft, published_template_id = draft_template_id,
         published_version = published_version + 1, published_at = now()
   where store_id = p_store
   returning published_version into v;
  insert into public.storefront_appearance_history(store_id, version, template_id, config, created_by)
    select store_id, published_version, published_template_id, published, auth.uid()
      from public.storefront_appearance where store_id = p_store;
  return v;
end $$;

-- Copia uma versão do histórico de volta para o RASCUNHO (nada vai ao ar até publicar de novo).
create function public.restore_appearance(p_store uuid, p_version integer) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare r timestamptz;
begin
  update public.storefront_appearance a
     set draft = h.config, draft_template_id = h.template_id
    from public.storefront_appearance_history h
   where a.store_id = p_store and h.store_id = p_store and h.version = p_version
   returning a.updated_at into r;
  if r is null then raise exception 'Versão não encontrada para esta loja.' using errcode = 'P0002'; end if;
  return r;
end $$;

revoke all on function public.publish_appearance(uuid), public.restore_appearance(uuid, integer) from public, anon;
grant execute on function public.publish_appearance(uuid), public.restore_appearance(uuid, integer) to authenticated;
grant execute on function public.appearance_config_valid(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
