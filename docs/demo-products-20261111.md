# Produtos demonstrativos — 11/11/2026

Pedido: acrescentar três produtos em cada uma das seis categorias atuais da Lápis de Cor. O usuário autorizou preços fictícios identificados como exemplos. Não substituir, apagar ou republicar produtos anteriormente ocultados pelo usuário.

`database/demo-products-20261111.sql` insere 18 registros com IDs fixos e `ON CONFLICT DO NOTHING`, sem atualizar cadastros existentes. Cada novo produto fica visível, disponível para testar a sacola, com etiqueta Exemplo e descrição informando que produto, imagem e preço são ilustrativos. Valores em centavos inteiros.

As ilustrações padrão são associadas aos IDs dos novos produtos em `public/demo-product-images.js`, restritas à identificação da loja Lápis de Cor. São imagens estáticas publicadas junto do site, semelhantes ao conjunto ilustrativo inicial. Uma foto enviada posteriormente pelo painel tem prioridade sobre a ilustração padrão. O campo `image_index` permanece como fallback para clientes anteriores à atualização. Não foram criados campos, políticas ou permissões novas no banco.

Arquivos novos: `public/vitrine/assets/produtos-demo/`. Imagens reutilizadas: `public/vitrine/assets/categorias/`. As versões para exibição são otimizadas pelo Netlify Image CDN. Painel e vitrine resolvem as mesmas referências. London continua usando seus próprios dados e imagens.

## Novas imagens

Geradas com a ferramenta nativa de imagens. Direção comum: fotografia quadrada realista de papelaria sem marca, luz natural suave, fundo em papel pastel, texturas naturais e produtos centralizados. Sem texto, preços, logotipos, pessoas ou colagem.

- `lapis-grafite-v1.png`: seis lápis grafite de desenho, madeira natural e preto fosco, borracha creme e apontador metálico em fundo lilás.
- `lapis-tradicional-v1.png`: leque de doze lápis de cor tradicionais com cores vivas e pontas de madeira, sobre papel creme e menta.
- `caderno-azul-v1.png`: caderno espiral de capa azul-clara e textura suave, encadernação dourada e lápis azul sobre papel pêssego.

As demais fotografias são as ilustrações de categorias já aprovadas. Imagens de blocos, borrachas e aquarela, antes salvas apenas no conjunto de referências, também entram nesta publicação.
