begin;
insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-4000-8000-000000000088','london-isolation-test@example.invalid',now());
insert into private.admin_access(email,store_id) select 'london-isolation-test@example.invalid',id from public.stores where slug='lapis-de-cor';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000088',true);
select set_config('test.london_store',(select id::text from public.stores where slug='london-papelaria'),true);
set local role authenticated;
do $$declare n integer; begin
 assert (select count(*) from public.stores)=1,'Single-store account sees another store';
 assert not exists(select 1 from public.stores where slug='london-papelaria'),'London store leaked';
 assert (select count(*) from public.catalog_products)>0,'Own catalog inaccessible';
 assert not exists(select 1 from public.catalog_products p where p.store_id=current_setting('test.london_store')::uuid),'London products leaked';
 assert (select count(distinct store_id) from public.catalog_products)=1,'Catalogs mixed';
 update public.catalog_products set name='Forbidden' where store_id not in (select id from public.stores);get diagnostics n=row_count;assert n=0,'Cross-store edit allowed';
 begin insert into public.catalog_categories(store_id,name) values (current_setting('test.london_store')::uuid,'Forbidden');raise exception 'Cross-store insert allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Passed: single-store account cannot read or edit London; test account and changes rolled back.' as verification;
