# Checklist de lançamento V1.0: ativar o editor visual em produção

**Regra:** cada passo marcado **[APROVAÇÃO]** só é executado após autorização explícita. Nada aqui foi executado na produção (`ipqawywfqydgyabcynbh`). Detalhes técnicos: `docs/migration-runbook.md`.

## Por que esta ordem é segura
O código novo funciona **sem** a migração: sem a tabela, o painel mostra "recurso ainda não ativado" e as vitrines mantêm o visual original (testado). Então publicamos o código primeiro, confirmamos que nada regrediu e só então ativamos o recurso com a migração. Desfazer = rollback SQL (instantâneo) ou republicar o deploy anterior no Netlify.

## 0. Pré-requisitos
- [ ] PR #2 revisado e aprovado por você; branch `feature/visual-editor` com a suíte verde (unitários, banco local, Chrome contra o PAINEL 2).
- [ ] Anotar os deploys atuais para voltar atrás (Netlify → Deploys → "Publish deploy"): painel `6af45eb7ac8336423206f984`, London `6af215484e75f4094dbc73d6`, Lápis de Cor `6af22ee514b2d32b9ed0e279`.
- [ ] Confirmar **como cada site original é publicado hoje** (pasta/ZIP/Git). O conector não mostra isso. As vitrines também precisam do código novo para exibir a aparência publicada.
- [ ] Janela de baixo uso.

## 1. Backup verificável **[APROVAÇÃO para você executar ou autorizar]** (plano free: sem backup automático)
- [ ] `pg_dump` completo de `public` e `private`, dados de `auth.users`/`storage.*` e só dos dados do catálogo (comandos em `docs/migration-runbook.md`). Conexão do painel do Supabase; **nunca** no chat ou no repositório.
- [ ] Baixar as imagens do bucket `catalog-images` e juntar tudo com `sha256`.
- [ ] **Verificar:** restaurar em um Postgres descartável e comparar hashes (`tests/supabase-local/backup-restore-drill.sh`).
- [ ] Guardar a saída de `database/fingerprint.sql` do projeto real (referência "antes").
- **Sem backup verificado, não avance.**

## 2. Publicar o código (ainda sem a migração) **[APROVAÇÃO por site]**
- [ ] Painel `papeliza-ai-painel`: publicar a versão da branch (com a URL/chave **de produção** que já estão em `public/supabase-client.js`).
- [ ] Vitrines `londonpapelaria` e `lapisdecorpapelaria`: publicar `public/london/` e `public/vitrine/` com os arquivos compartilhados.
- [ ] Conferir: painel abre, login, produtos e categorias normais; aba Aparência mostra "recurso ainda não ativado"; as duas vitrines idênticas ao visual de antes.
- **Rollback:** "Publish deploy" do deploy anterior de cada site.

## 3. Migração **[APROVAÇÃO]**
- [ ] Pré-checagem somente leitura: nenhuma tabela `storefront*`; `authorized_store_ids`, `catalog_touch` e `stores` presentes.
- [ ] Aplicar `database/storefront-appearance.sql` com `apply_migration` (transação única).
- [ ] `database/fingerprint.sql` **idêntico** ao de antes.
- **Rollback:** `database/storefront-appearance-rollback.sql` **[APROVAÇÃO]** e conferir o fingerprint de novo.

## 4. Validação de segurança (logo após a migração)
- [ ] Advisors de segurança: só `authorized_store_ids` (já existente), `publish_appearance` (intencional) e senhas vazadas (configuração do Auth).
- [ ] REST com chave anônima: lê só `published_*` da aparência; `select=draft`, `select=*` e histórico **negados**; sem EXECUTE nas 3 funções.
- [ ] Isolamento: lojista de uma loja não lê, grava, publica nem restaura na outra; usuário sem vínculo não acessa.
- [ ] Storage: envio de logotipo/banner só na pasta da própria loja; limite 1 MB; só JPEG/PNG/WebP.

## 5. Validação funcional na produção (sem alterar o que os clientes veem)
- [ ] Entrar com um lojista real: **Salvar rascunho** e usar a **prévia** (computador e celular). A prévia não publica nada.
- [ ] Publicar **somente** com conteúdo aprovado pelo lojista (publicar muda a vitrine pública). Conferir histórico e restauração.
- [ ] Voltar à aba do navegador após alguns minutos: sem tela de login piscando.
- [ ] Produtos e categorias seguem normais (criar/editar/ocultar), vitrines com o catálogo de sempre.

## 6. Critério de pronto
Migração aplicada, fingerprint igual, advisors só com os avisos esperados, sessão de teste do lojista completa (rascunho → publicar → restaurar), vitrines intactas e rollback ensaiado.
