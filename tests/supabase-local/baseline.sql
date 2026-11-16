-- Reprodução LOCAL do esquema REAL do projeto Papeliza AI (extraído em modo leitura em 2026-11-16).
-- Somente estrutura, políticas e permissões; sem dados reais (lojas/produtos/e-mails de teste fictícios).
-- Aplicar APENAS no Postgres local (supabase/postgres + storage-api em Docker), nunca no projeto real.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table public.stores (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique);
create table private.admin_access (email text not null, store_id uuid not null references public.stores(id), primary key (email, store_id));
create table public.catalog_categories (
  store_id uuid not null references public.stores(id), name text not null, created_at timestamptz not null default now(),
  primary key (store_id, name), check (name = btrim(name) and length(name) between 1 and 60));
create unique index catalog_category_case_unique on public.catalog_categories (store_id, lower(name));
create table public.catalog_products (
  store_id uuid not null references public.stores(id), id text not null, name text not null, detail text not null, category text not null,
  price_cents integer not null, image_path text, image_index integer not null default 0, tag text not null default '',
  visible boolean not null default true, available boolean not null default true, archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (store_id, id),
  foreign key (store_id, category) references public.catalog_categories(store_id, name) on update cascade,
  check (length(id) between 1 and 100), check (image_index between 0 and 5), check (length(btrim(name)) between 1 and 120),
  check (price_cents between 0 and 99999999), check (length(tag) <= 24), check (length(btrim(detail)) between 1 and 500),
  check (image_path is null or (image_path like store_id::text || '/%' and image_path !~ '\.\.' and length(image_path) < 240)));
create index catalog_products_category_idx on public.catalog_products (store_id, category);

create function private.catalog_touch() returns trigger language plpgsql set search_path to '' as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
create trigger catalog_product_updated before update on public.catalog_products for each row execute function private.catalog_touch();

create function public.authorized_store_ids() returns setof uuid language sql stable security definer set search_path to '' as $$
select a.store_id from private.admin_access a join auth.users u on lower(u.email)=lower(a.email)
where u.id=(select auth.uid()) and u.email_confirmed_at is not null
$$;
revoke all on function public.authorized_store_ids() from public, anon;
grant execute on function public.authorized_store_ids() to authenticated, service_role;

alter table public.stores enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_products enable row level security;
-- permissões de tabela iguais às do projeto real
revoke all on public.stores, public.catalog_categories, public.catalog_products from anon, authenticated;
grant select on public.stores to anon, authenticated;
grant select on public.catalog_categories, public.catalog_products to anon;
grant select, insert, update, delete on public.catalog_categories to authenticated;
grant select, insert, update on public.catalog_products to authenticated;

create policy store_public_read on public.stores for select to anon using (true);
create policy authorized_admin_reads_store on public.stores for select to authenticated using (id in (select authorized_store_ids()));
create policy category_public_read on public.catalog_categories for select to anon using (true);
create policy category_admin_read on public.catalog_categories for select to authenticated using (store_id in (select authorized_store_ids()));
create policy category_admin_insert on public.catalog_categories for insert to authenticated with check (store_id in (select authorized_store_ids()));
create policy category_admin_update on public.catalog_categories for update to authenticated using (store_id in (select authorized_store_ids())) with check (store_id in (select authorized_store_ids()));
create policy category_admin_delete on public.catalog_categories for delete to authenticated using (store_id in (select authorized_store_ids()));
create policy product_public_read on public.catalog_products for select to anon using (visible and not archived);
create policy product_admin_read on public.catalog_products for select to authenticated using (store_id in (select authorized_store_ids()));
create policy product_admin_insert on public.catalog_products for insert to authenticated with check (store_id in (select authorized_store_ids()));
create policy product_admin_update on public.catalog_products for update to authenticated using (store_id in (select authorized_store_ids())) with check (store_id in (select authorized_store_ids()));

-- Storage e dados de teste: ver baseline-storage.sql (supabase_admin) e baseline-seed.sql
