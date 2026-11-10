begin;
create table public.catalog_categories (
  store_id uuid not null references public.stores(id),
  name text not null check (name = btrim(name) and length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (store_id, name)
);
create unique index catalog_category_case_unique on public.catalog_categories(store_id, lower(name));
create table public.catalog_products (
  store_id uuid not null references public.stores(id),
  id text not null check (length(id) between 1 and 100),
  name text not null check (length(btrim(name)) between 1 and 120),
  detail text not null check (length(btrim(detail)) between 1 and 500),
  category text not null,
  price_cents integer not null check (price_cents between 0 and 99999999),
  image_path text check (image_path is null or (image_path like store_id::text || '/%' and image_path !~ '\.\.' and length(image_path)<240)),
  image_index integer not null default 0 check (image_index between 0 and 5),
  tag text not null default '' check (length(tag)<=24),
  visible boolean not null default true,
  available boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id,id),
  foreign key (store_id,category) references public.catalog_categories(store_id,name) on update cascade
);
create index catalog_products_category_idx on public.catalog_products(store_id,category);
create function private.catalog_touch() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=clock_timestamp(); return new; end $$;
create trigger catalog_product_updated before update on public.catalog_products for each row execute function private.catalog_touch();
alter table public.catalog_categories enable row level security;
alter table public.catalog_products enable row level security;
revoke all on public.catalog_categories,public.catalog_products from public,anon,authenticated;
grant select on public.catalog_categories,public.catalog_products to anon;
grant select,insert,update,delete on public.catalog_categories to authenticated;
grant select,insert,update on public.catalog_products to authenticated;
create policy category_public_read on public.catalog_categories for select to anon using (true);
create policy product_public_read on public.catalog_products for select to anon using (visible and not archived);
create policy category_admin_read on public.catalog_categories for select to authenticated using (store_id in (select public.authorized_store_ids()));
create policy category_admin_insert on public.catalog_categories for insert to authenticated with check (store_id in (select public.authorized_store_ids()));
create policy category_admin_update on public.catalog_categories for update to authenticated using (store_id in (select public.authorized_store_ids())) with check (store_id in (select public.authorized_store_ids()));
create policy category_admin_delete on public.catalog_categories for delete to authenticated using (store_id in (select public.authorized_store_ids()));
create policy product_admin_read on public.catalog_products for select to authenticated using (store_id in (select public.authorized_store_ids()));
create policy product_admin_insert on public.catalog_products for insert to authenticated with check (store_id in (select public.authorized_store_ids()));
create policy product_admin_update on public.catalog_products for update to authenticated using (store_id in (select public.authorized_store_ids())) with check (store_id in (select public.authorized_store_ids()));
grant select on public.stores to anon;
create policy store_public_read on public.stores for select to anon using (true);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('catalog-images','catalog-images',true,1048576,array['image/jpeg','image/png','image/webp']);
create policy catalog_photo_admin_insert on storage.objects for insert to authenticated with check (
 bucket_id='catalog-images' and (storage.foldername(name))[1] in (select public.authorized_store_ids()::text)
);
create policy catalog_photo_admin_read on storage.objects for select to authenticated using (
 bucket_id='catalog-images' and (storage.foldername(name))[1] in (select public.authorized_store_ids()::text)
);
create policy catalog_photo_admin_delete on storage.objects for delete to authenticated using (
 bucket_id='catalog-images' and (storage.foldername(name))[1] in (select public.authorized_store_ids()::text)
);
insert into public.catalog_categories(store_id,name) select id,c from public.stores cross join unnest(array['Cadernos','Escrita','Acessórios','Presentes']) c where slug='lapis-de-cor';
insert into public.catalog_products(store_id,id,name,detail,category,price_cents,image_index)
select s.id,p.* from public.stores s cross join (values
 ('caderno-rosa','Caderno Espiral Rosé','Caderno espiral com capa rosé.','Cadernos',2490,0),
 ('canetas-pastel','Kit Canetas Pastel','Conjunto demonstrativo com seis canetas.','Escrita',1890,1),
 ('planner-verde','Planner Botânico','Planner com capa de estampa botânica.','Cadernos',3990,2),
 ('estojo-lilas','Estojo Lavanda','Estojo na cor lavanda.','Acessórios',2290,3),
 ('blocos-adesivos','Blocos Adesivos Candy','Blocos adesivos em cores suaves.','Acessórios',1290,4),
 ('kit-presente','Kit Novos Começos','Kit demonstrativo de papelaria para presente.','Presentes',5990,5)
) p(id,name,detail,category,price_cents,image_index) where s.slug='lapis-de-cor';
notify pgrst,'reload schema';
commit;
