begin;
insert into public.stores(id,name,slug) values ('00000000-0000-4000-8000-000000000077','Teste isolado','__teste_catalogo__');
insert into public.catalog_categories(store_id,name) values ('00000000-0000-4000-8000-000000000077','Teste');
insert into public.catalog_products(store_id,id,name,detail,category,price_cents,visible,archived) values
 ('00000000-0000-4000-8000-000000000077','public','Teste','Teste','Teste',100,true,false),
 ('00000000-0000-4000-8000-000000000077','hidden','Teste','Teste','Teste',100,false,false),
 ('00000000-0000-4000-8000-000000000077','archived','Teste','Teste','Teste',100,true,true);
select set_config('request.jwt.claim.sub',(select u.id::text from auth.users u join private.admin_access a on lower(a.email)=lower(u.email) join public.stores s on s.id=a.store_id where s.slug='lapis-de-cor' and u.email_confirmed_at is not null limit 1),true);
set local role authenticated;
do $$declare n integer; old_time timestamptz; begin
 assert (select count(*) from public.catalog_products where store_id='00000000-0000-4000-8000-000000000077')=0,'Other store visible to administrator';
 update public.catalog_products set name='Forbidden' where store_id='00000000-0000-4000-8000-000000000077';get diagnostics n=row_count;assert n=0,'Cross-store update allowed';
 begin insert into public.catalog_categories(store_id,name) values ('00000000-0000-4000-8000-000000000077','Forbidden');raise exception 'Cross-store insert allowed';exception when insufficient_privilege then null;end;
 insert into public.catalog_categories(store_id,name) select id,'__Teste__' from public.stores where slug='lapis-de-cor';
 insert into public.catalog_products(store_id,id,name,detail,category,price_cents,visible) select id,'__test__','Teste','Teste','__Teste__',123,false from public.stores where slug='lapis-de-cor';
 assert (select count(*) from public.catalog_products where id='__test__')=1,'Owner cannot read hidden product';
 select updated_at into old_time from public.catalog_products where id='__test__';
 update public.catalog_products set name='Editado' where id='__test__' and updated_at=old_time;get diagnostics n=row_count;assert n=1,'Owner edit failed';
 update public.catalog_products set name='Stale' where id='__test__' and updated_at=old_time;get diagnostics n=row_count;assert n=0,'Stale update allowed';
 update public.catalog_categories set name='__Renamed__' where name='__Teste__';
 assert (select category from public.catalog_products where id='__test__')='__Renamed__','Category rename did not cascade';
 begin delete from public.catalog_categories where name='__Renamed__';raise exception 'Used category deletion allowed';exception when foreign_key_violation then null;end;
 begin update public.catalog_products set price_cents=-1 where id='__test__';raise exception 'Negative price accepted';exception when check_violation then null;end;
 begin update public.catalog_products set store_id='00000000-0000-4000-8000-000000000077' where id='__test__';raise exception 'Product transfer allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
set local role authenticated;
do $$begin assert (select count(*) from public.catalog_products)=0,'Unauthorized user can read catalog as admin';end $$;
reset role;
set local role anon;
do $$begin
 assert (select count(*) from public.catalog_products where store_id='00000000-0000-4000-8000-000000000077')=1,'Hidden or archived product leaked';
 assert (select count(*) from public.catalog_products where id='__test__')=0,'Hidden owner product leaked';
 begin update public.catalog_products set price_cents=0;raise exception 'Anonymous update allowed';exception when insufficient_privilege then null;end;
 begin perform public.authorized_store_ids();raise exception 'Anonymous can call authorization helper';exception when insufficient_privilege then null;end;
 begin perform 1 from private.admin_access;raise exception 'Private admin list readable';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Passed: store isolation, anonymous visibility, write protection, category integrity, price validation and concurrent-edit protection. All test records rolled back.' as verification;
