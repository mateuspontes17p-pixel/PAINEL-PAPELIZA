# Papeliza AI

Painel autenticado e vitrine demonstrativa da Lápis de Cor. Publicação pelo GitHub no mesmo projeto Netlify; diretório `public/`.

## Catálogo online

- Produtos e categorias são salvos no Supabase. Salvar um produto visível o publica; ocultar ou excluir o retira da consulta pública. Exclusão é reversível: marque Mostrar excluídos e use Restaurar.
- Fotos JPEG, PNG e WebP de até 1 MB são enviadas ao bucket `catalog-images`, em uma pasta exclusiva por loja. Fotos são públicas por URL; não enviar documentos ou imagens privadas. Substituir uma foto cria outro arquivo, sem apagar o antigo automaticamente.
- Categorias em uso não podem ser excluídas. Renomear uma categoria atualiza os produtos vinculados na mesma operação do banco.
- Alterações simultâneas no mesmo produto são detectadas por `updated_at`. Use Atualizar catálogo antes de refazer uma edição desatualizada.
- A vitrine consulta os dados ao abrir ou recarregar. Uma página já aberta precisa ser atualizada para mostrar alterações.
- Os seis produtos iniciais, fotos e preços continuam sendo exemplos. O pedido é uma mensagem no WhatsApp, sem checkout ou reserva de estoque.
- O catálogo do antigo protótipo permanece no navegador. Quando existir, Exportar cópia anterior permite guardá-lo sem sobrescrever o catálogo online.

## Banco e verificação

`database/catalog.sql` registra a instalação já aplicada. Não executar novamente sobre o banco instalado. Contém tabelas, políticas de acesso, bucket e exemplos iniciais.

`database/verify-access.sql` testa isolamento entre lojas, acesso público, alterações autorizadas, integridade das categorias, preço e conflito de edições. Todos os registros de teste são revertidos na mesma transação.

As únicas credenciais presentes no cliente são a URL e a chave publicável. Senhas de e-mail, chaves secretas e credenciais administrativas não devem entrar no repositório. SMTP permanece configurado apenas no servidor Supabase.

## London e seleção de lojas

O painel aceita `?loja=london-papelaria` e `?loja=lapis-de-cor`. A conta precisa estar autorizada à loja no servidor; mudar o endereço não concede acesso. Contas com mais de uma loja usam o seletor Loja em administração. Trocar de loja recarrega a página; a seleção fica bloqueada durante o salvamento.

London tem catálogo e pasta de fotos próprios. A vitrine conectada está em `/london/`, preservando os arquivos visuais da demonstração original. O projeto Netlify independente `londonpapelaria.netlify.app` não foi substituído: continua sendo a apresentação anterior, sem sincronização com este painel.

Os seis produtos de London foram importados de seu `catalogo.js` anterior, como exemplos, sem copiar produtos cadastrados na Lápis de Cor. Campanha, kit escolar e contador continuam conteúdo da demonstração original e não são administrados pelo cadastro de produtos.

`database/london.sql` registra a importação idempotente da loja e exemplos. A autorização administrativa é cadastrada separadamente no servidor, sem publicar endereços de administradores no código. `database/verify-london-isolation.sql` testa o isolamento da London com uma conta temporária, revertida na mesma transação.
