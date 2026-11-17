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

---

## Estado da implementação (V1 · branch `feature/visual-editor`)

**Implementado e testado** (testes automatizados; nada foi aplicado no Supabase real nem publicado no Netlify):
- Aba **Aparência** no painel (`public/aparencia.js`, `index.html`, `painel.css`): modelo, cores, nome, logotipo, banner, textos, endereço, horários, sobre, rodapé, link do mapa, WhatsApp e Instagram; prévia ao vivo em iframe (computador/celular); salvar rascunho; publicar em duas etapas; histórico e restauração para o rascunho.
- Contrato de dados estrito e validação (`public/template-registry.js`), espelhado no banco.
- Aplicação segura na vitrine (`public/appearance-apply.js` + `catalog-public.js`): só `textContent`, atributos e variáveis CSS. Sem tabela, sem aparência publicada ou com configuração inválida, a vitrine mantém o visual original.
- Cores dos dois modelos controladas por variáveis CSS (padrão idêntico ao anterior).
- Migração `database/storefront-appearance.sql` (**NÃO APLICADA**), `storefront-appearance-rollback.sql` e `verify-appearance-isolation.sql`.

**Como testar**
- `for t in tests/*.cjs; do node $t; done` — unitários (contrato, painel, login, lojas).
- `bash tests/pg/run.sh` — migração + RLS em um PostgreSQL local descartável (usa esquema simulado em `tests/pg/stub-supabase.sql`; não é o Supabase real).
- `python3 tests/e2e/appearance.e2e.py` — Chrome real com Supabase simulado (python3 + playwright + google-chrome).

**Antes de usar de verdade (aprovação necessária)**
1. **Já validado em Supabase local** (Docker, Postgres/GoTrue/Storage reais; ver `docs/supabase-local-testing.md`): migração, RLS, isolamento entre lojas, Storage de logotipo/banner. Dependências (`public.stores`, `public.authorized_store_ids()`, `private.catalog_touch()`) conferidas no projeto real em modo leitura. **Falta** aplicar no projeto real (aprovação explícita e backup antes) e validar só o que o local não cobre (camada PostgREST, CDN do bucket, catálogo de 39 produtos).
2. Envio de logotipo/banner: testado contra o storage-api real local (pasta `<store_id>/branding/`, limite de 1 MB, só JPEG/PNG/WebP, isolamento por loja). Repetir um envio no projeto real após a migração.
3. Revisar o PR e gerar Deploy Preview antes de qualquer merge; sem a migração, o painel mostra "recurso ainda não ativado" e a prévia funciona.

**Pendências conhecidas (próximas etapas, não incluídas na V1)**
- **Modo loja** (`options.storeMode`): oculta avisos, prazo, convite de ativação e dados da loja de origem (marcados com `data-demo` nas vitrines). Textos de origem sem valor próprio (chamada, endereço, horários, "sobre", rodapé) ficam ocultos; Instagram, mapa e WhatsApp da origem nunca aparecem. Sem logotipo, mostra o nome da loja; sem banner, usa um fundo claro com as cores da loja. Os modelos são `generic = true`: outra loja publica um modelo só em modo loja **e com WhatsApp próprio** (regra repetida no banco, em `publish_appearance`). A loja de origem publica como antes.
- **Ainda fixos no HTML** (não editáveis): rótulos das seções, textos de "como pedir", faixa de presentes. Em modo loja, `aria-label`s e `alt` visíveis passam a usar o nome da loja (`data-ap-label`).
- Melhorias de design e responsividade dos modelos além das cores (auditoria visual antes/depois).
- Limpeza de imagens antigas do Storage (substituir uma imagem não apaga a anterior).
