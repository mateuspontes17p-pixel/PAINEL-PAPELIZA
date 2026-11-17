-- Desfaz database/storefront-appearance.sql. Remove SOMENTE objetos criados por ele.
-- Produtos, categorias, lojas e usuários não são tocados. As configurações de aparência
-- salvas (rascunhos e histórico) são apagadas: exporte-as antes, se precisar delas.
-- As vitrines voltam ao visual original automaticamente (sem tabela, não há aparência a aplicar).
begin;
drop function if exists public.publish_appearance(uuid);
drop function if exists public.restore_appearance(uuid, integer);
drop table if exists public.storefront_appearance_history;
drop table if exists public.storefront_appearance;
drop function if exists public.appearance_config_valid(uuid, jsonb);
drop table if exists public.storefront_templates;
notify pgrst, 'reload schema';
commit;
