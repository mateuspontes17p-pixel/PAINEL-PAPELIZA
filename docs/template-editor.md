# Editor visual de templates — implementação em etapas

## Escopo aprovado
Tanto o operador PAPELIZA AI quanto o lojista autorizado poderão editar a identidade visual de **sua própria loja**. Templates iniciais: London e Lápis de Cor. O catálogo de produtos já usa Supabase e permanece independente da aparência.

## Etapa 1 — preparação (esta branch)
- Registro de templates em `public/template-registry.js`, sem alterar vitrines em produção.
- Validação básica de cores hexadecimais e textos para futura API.
- Não há ainda editor publicado, persistência de aparência ou aplicação de estilos nas vitrines.

## Etapa 2 — banco e segurança
- Adicionar configuração visual por `store_id` no Supabase, com políticas RLS que permitam leitura pública somente de aparência publicada e escrita somente por membros autorizados da loja.
- Guardar template escolhido e configuração por loja, nunca em configuração global compartilhada.
- Definir bucket e regras de upload para logos e banners; validar formato, tamanho e permissões.
- Testar isolamento entre London e Lápis de Cor antes de liberar gravação.

## Etapa 3 — editor no painel
- Nova aba **Aparência**, carregada após autenticação e seleção da loja.
- Escolha de template, edição de cores, títulos, logo e banners; prévia sem salvar e botões **Salvar rascunho** e **Publicar**.
- A prévia deve preservar a estrutura de cada modelo e impedir HTML/CSS arbitrário enviado por usuários.

## Etapa 4 — vitrines
- Fazer `/london/` e `/vitrine/` lerem a aparência publicada da loja correta.
- Conferir responsividade e comportamento do catálogo.
- Somente depois sincronizar os sites Netlify independentes; não substituí-los sem revisão.

## Critérios de aceite
1. Lojista London não lê nem altera configurações privadas da Lápis de Cor e vice-versa.
2. Administrador autorizado edita sua loja; mudanças em rascunho não afetam a vitrine pública.
3. Template original continua funcional sem personalização.
4. Atualizações publicadas são visíveis após recarregar a vitrine.
5. Rollback possível para configurações anteriores.
