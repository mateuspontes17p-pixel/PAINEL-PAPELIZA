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
