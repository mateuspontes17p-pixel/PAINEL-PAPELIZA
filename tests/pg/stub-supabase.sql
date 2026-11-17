-- STUB para teste local em um PostgreSQL descartável. NÃO é o esquema real do Supabase:
-- reproduz apenas o que a migração de aparência usa (papéis, auth.uid(), stores, authorized_store_ids,
-- private.admin_access, private.catalog_touch), na forma como o repositório os referencia.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema private;
create table private.admin_access (email text not null, store_id uuid not null);
create function private.catalog_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = clock_timestamp(); return new; end $$;
grant usage on schema public to anon, authenticated;
create table public.stores (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique);
create function public.authorized_store_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select a.store_id from private.admin_access a join auth.users u on lower(u.email) = lower(a.email)
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
revoke all on function public.authorized_store_ids() from public, anon;
grant execute on function public.authorized_store_ids() to authenticated;
alter table public.stores enable row level security;
grant select on public.stores to anon, authenticated;
create policy store_public_read on public.stores for select to anon using (true);
create policy store_admin_read on public.stores for select to authenticated using (id in (select public.authorized_store_ids()));
insert into public.stores(id, name, slug) values
  ('11111111-1111-4111-8111-111111111111', 'Lápis de Cor', 'lapis-de-cor'),
  ('22222222-2222-4222-8222-222222222222', 'London Papelaria & Presentes Criativos', 'london-papelaria');
