-- Bucket e políticas do Storage idênticos aos do projeto real. Executar como supabase_admin (dono de storage.*).
-- Permissões de tabela iguais às do projeto real (lidas em modo leitura): anon/authenticated = arwd, RLS ativo.
grant select, insert, update, delete on storage.objects, storage.buckets to anon, authenticated;
grant all on storage.objects, storage.buckets to service_role;

-- Storage: bucket e políticas idênticos aos do projeto real
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-images', 'catalog-images', true, 1048576, array['image/jpeg','image/png','image/webp']);
create policy catalog_photo_admin_read on storage.objects for select to authenticated using (bucket_id = 'catalog-images' and (storage.foldername(name))[1] in (select (authorized_store_ids())::text));
create policy catalog_photo_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'catalog-images' and (storage.foldername(name))[1] in (select (authorized_store_ids())::text));
create policy catalog_photo_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'catalog-images' and (storage.foldername(name))[1] in (select (authorized_store_ids())::text));

