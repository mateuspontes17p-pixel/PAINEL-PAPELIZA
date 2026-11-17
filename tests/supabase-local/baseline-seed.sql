-- Dados FICTÍCIOS de teste (lojas com os mesmos slugs do projeto real; sem produtos/usuários reais).
insert into public.stores(id, name, slug) values
  ('11111111-1111-4111-8111-111111111111', 'Lápis de Cor', 'lapis-de-cor'),
  ('22222222-2222-4222-8222-222222222222', 'London Papelaria & Presentes Criativos', 'london-papelaria');
insert into public.catalog_categories(store_id, name) values ('11111111-1111-4111-8111-111111111111', 'Cadernos'), ('22222222-2222-4222-8222-222222222222', 'Escrita');
insert into public.catalog_products(store_id, id, name, detail, category, price_cents) values
  ('11111111-1111-4111-8111-111111111111', 'p1', 'Caderno', 'Caderno de teste', 'Cadernos', 1990),
  ('22222222-2222-4222-8222-222222222222', 'p2', 'Caneta', 'Caneta de teste', 'Escrita', 590);
