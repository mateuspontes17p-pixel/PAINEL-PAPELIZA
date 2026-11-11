-- Produtos, preços e imagens de demonstração autorizados em 11/11/2026.
-- IDs fixos evitam duplicação em uma reexecução. Não altera produtos existentes.
begin;
insert into public.catalog_products(store_id,id,name,detail,category,price_cents,image_index,tag,visible,available,archived)
select s.id,p.id,p.name,p.detail,p.category,p.price_cents,0,'Exemplo',true,true,false
from public.stores s cross join (values
 ('demo-20261111-acessorios-01','Estojo Coral','Estojo colorido para organizar a escrita. Produto, imagem e preço ilustrativos.','Acessórios',2490),
 ('demo-20261111-acessorios-02','Organizador de Mesa Pastel','Organizador com divisórias para a mesa. Produto, imagem e preço ilustrativos.','Acessórios',3490),
 ('demo-20261111-acessorios-03','Blocos Adesivos Coração','Blocos para lembretes em cores suaves. Produto, imagem e preço ilustrativos.','Acessórios',1490),
 ('demo-20261111-cadernos-01','Caderno Espiral Floral','Caderno com capa rosa e estampa de flores. Produto, imagem e preço ilustrativos.','Cadernos',2990),
 ('demo-20261111-cadernos-02','Cadernos em Tons Pastel','Composição de cadernos coloridos para anotações. Produto, imagem e preço ilustrativos.','Cadernos',2490),
 ('demo-20261111-cadernos-03','Caderno Espiral Azul','Caderno de capa azul para o dia a dia. Produto, imagem e preço ilustrativos.','Cadernos',2190),
 ('demo-20261111-escrita-01','Canetas de Ponta Fina','Canetas coloridas para escrever e destacar detalhes. Produto, imagem e preço ilustrativos.','Escrita',1890),
 ('demo-20261111-escrita-02','Marcadores Pastel','Marcadores em cores suaves para os estudos. Produto, imagem e preço ilustrativos.','Escrita',2490),
 ('demo-20261111-escrita-03','Borrachas Criativas','Borrachas com formatos divertidos. Produto, imagem e preço ilustrativos.','Escrita',990),
 ('demo-20261111-presentes-01','Planner Floral para Presentear','Planner com capa floral e cores suaves. Produto, imagem e preço ilustrativos.','Presentes',3990),
 ('demo-20261111-presentes-02','Aquarela Criativa','Conjunto de aquarela para explorar as cores. Produto, imagem e preço ilustrativos.','Presentes',3490),
 ('demo-20261111-presentes-03','Kit de Organização Pastel','Organizadores coloridos para uma mesa criativa. Produto, imagem e preço ilustrativos.','Presentes',5990),
 ('demo-20261111-lapis-01','Lápis de Cor Pastel','Lápis coloridos em tons suaves. Produto, imagem e preço ilustrativos.','lapis',2290),
 ('demo-20261111-lapis-02','Lápis Grafite para Desenho','Conjunto de lápis grafite para esboços. Produto, imagem e preço ilustrativos.','lapis',1490),
 ('demo-20261111-lapis-03','Lápis de Cor Tradicional','Lápis com cores vivas para desenhar. Produto, imagem e preço ilustrativos.','lapis',1990),
 ('demo-20261111-materiais-01','Caderno para Estudos','Caderno azul para organizar as anotações. Produto, imagem e preço ilustrativos.','Materiais Juliana utrera',2190),
 ('demo-20261111-materiais-02','Organizador para Estudos','Divisórias para separar os materiais da mesa. Produto, imagem e preço ilustrativos.','Materiais Juliana utrera',3490),
 ('demo-20261111-materiais-03','Canetas para Anotações','Canetas coloridas para os materiais de estudo. Produto, imagem e preço ilustrativos.','Materiais Juliana utrera',1890)
) p(id,name,detail,category,price_cents)
where s.slug='lapis-de-cor'
on conflict (store_id,id) do nothing;
commit;
