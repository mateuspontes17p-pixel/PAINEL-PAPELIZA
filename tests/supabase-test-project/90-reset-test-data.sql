-- LIMPEZA dos dados de TESTE de aparência no PAINEL 2 (torna os testes repetíveis). Não toca catálogo, lojas, usuários nem Storage.
begin;
delete from public.storefront_appearance_history;
delete from public.storefront_appearance;
commit;
