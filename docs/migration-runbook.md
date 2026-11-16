# Runbook: ativar o editor visual no Supabase real

**Estado:** NÃO executado. Nada abaixo foi aplicado ao projeto real (`ipqawywfqydgyabcynbh`). Cada passo marcado **[APROVAÇÃO]** exige autorização explícita do responsável.

## O que a migração faz (revisão linha a linha)
`database/storefront-appearance.sql` roda em uma única transação (`begin`/`commit`) e **só cria** objetos novos: 3 tabelas (`storefront_templates`, `storefront_appearance`, `storefront_appearance_history`), 3 funções (`appearance_config_valid`, `publish_appearance`, `restore_appearance`), 1 trigger (na tabela nova), políticas RLS e grants **somente nesses objetos novos**. Não há `ALTER`, `DROP`, `UPDATE` ou `DELETE` sobre `stores`, `catalog_*`, `private.admin_access`, `auth.*` ou `storage.*`. Se qualquer instrução falhar, a transação inteira é desfeita.

O único contato com objetos existentes é de leitura/dependência: chaves estrangeiras para `public.stores(id)` (lock de milissegundos em 2 linhas), políticas que chamam `public.authorized_store_ids()` e o trigger que usa `private.catalog_touch()`. Todos foram conferidos no projeto real em modo leitura.

`database/storefront-appearance-rollback.sql` (também transacional) remove **somente** esses objetos novos, sem `CASCADE`. Apaga as configurações de aparência salvas (exporte antes, se precisar). Produtos, categorias, lojas e usuários não são tocados.

## Evidências já obtidas (ambiente local com Postgres/GoTrue/Storage reais)
- `database/fingerprint.sql` idêntico **antes x depois da migração** e **antes x depois do rollback** (lojas, categorias, produtos, admin_access, usuários, Storage, políticas, funções, permissões e colunas existentes).
- Rollback deixa 0 objetos `storefront*`.
- Isolamento entre lojas, RLS, gate de publicação, histórico privado, Storage de logotipo/banner: ver `docs/supabase-local-testing.md`.
- Ensaio de backup/restauração (`tests/supabase-local/backup-restore-drill.sh`): banco novo restaurado idêntico por hash.

## Riscos e mitigação
| Risco | Probabilidade/impacto | Mitigação |
|---|---|---|
| Migração falha no meio | Baixa; transação desfaz tudo | Rodar com a transação; conferir fingerprint |
| Lock em `stores` | Muito baixa (2 linhas, ms) | Rodar fora de horário de uso |
| Operações via PostgREST nunca testadas no real | **Média** (ver abaixo) | Checklist pós-migração; painel mostra "recurso não ativado" em vez de quebrar; rollback pronto |
| Cache de esquema do PostgREST demora a ver as tabelas | Média, baixo impacto | A migração envia `notify pgrst, 'reload schema'`; se necessário, recarregar o esquema no painel |
| Aviso do linter para `publish_appearance` executável por logados | Certa, informativa | Intencional: a função valida `authorized_store_ids()` internamente |
| Plano **free**: sem backup automático do Supabase | **Alta se ignorado** | Backup manual obrigatório (abaixo) |
| Vitrine pública depender da nova tabela | Baixa | Sem tabela ou com erro, a vitrine mantém o visual original (testado) |

## O que a ausência do PostgREST deixa SEM validação (só confirmável no real)
O ambiente local testou RLS, funções e Storage com papéis e JWT reais, mas **não** a camada HTTP do PostgREST. Pendem de confirmação:
1. `select=*` da tabela de aparência como administrador (privilégio por coluna) e `select` com colunas explícitas como visitante.
2. `insert(...).select('*')` e `update(...).eq('updated_at', …).select('*')` via REST (RETURNING exige SELECT; igualdade de `timestamptz` com microssegundos e `+` codificado).
3. Chamadas `rpc('publish_appearance')` e `rpc('restore_appearance')` em `/rest/v1/rpc` (POST, retorno escalar).
4. Recarga do cache de esquema após a migração (`PGRST202/205` enquanto não recarrega).
5. Exposição do OpenAPI e do GraphQL (`pg_graphql`) das tabelas novas para `anon` (esperado: só colunas publicadas).
6. CORS e CDN do bucket público para as imagens de logotipo/banner.

## Plano de backup (plano free: manual e obrigatório) **[você executa ou autoriza]**
O banco é pequeno (≈11 MB; 2 lojas, 10 categorias, 39 produtos, 3 vínculos de admin, 2 usuários, 4 imagens). Use a string de conexão do painel do Supabase (Settings → Database); **não a coloque no repositório nem no chat**.

```bash
# 1) Backup lógico completo dos dados do app (estrutura + dados)
pg_dump "$SUPABASE_DB_URL" -Fc --schema=public --schema=private -f papeliza-pre-migracao.dump
# 2) Usuários e metadados do Storage (somente dados)
pg_dump "$SUPABASE_DB_URL" --data-only --table=auth.users --table=storage.objects --table=storage.buckets -f papeliza-auth-storage.sql
# 3) Backup só dos dados do catálogo (caminho de recuperação "no lugar")
pg_dump "$SUPABASE_DB_URL" --data-only --table=public.stores --table=public.catalog_categories --table=public.catalog_products --table=private.admin_access -f papeliza-catalogo-dados.sql
# 4) Integridade e cópia fora da máquina
sha256sum papeliza-*.dump papeliza-*.sql > papeliza-pre-migracao.sha256
```
5. Imagens: baixe os 4 arquivos do bucket `catalog-images` (painel do Supabase → Storage) para uma pasta e inclua no mesmo arquivo compactado.
6. **Verificação do backup (obrigatória antes de prosseguir):** restaure `papeliza-pre-migracao.dump` em um Postgres descartável e compare os hashes, como em `tests/supabase-local/backup-restore-drill.sh`. Backup não verificado não conta.
7. Guarde o resultado de `database/fingerprint.sql` do projeto real (é a referência "antes").

## Plano de recuperação
1. **Falha durante a migração:** nada a fazer; a transação é desfeita. Confirme com o fingerprint.
2. **Problema depois da migração (vitrine/painel/permissões):** rodar `database/storefront-appearance-rollback.sql` **[APROVAÇÃO]** e conferir o fingerprint (deve igualar o "antes"). As vitrines voltam ao visual original sozinhas.
3. **Dados do catálogo alterados por engano:** restaurar a partir de `papeliza-catalogo-dados.sql` (recuperação no lugar, tabela a tabela) ou do dump completo em um **projeto novo** (restaurar default privileges de `supabase_admin` exige superusuário; em projeto hospedado use a restauração só de dados).
4. **Imagens:** reenviar do backup do bucket.

## Checklist de implantação **[cada item de escrita exige APROVAÇÃO]**
Antes
- [ ] PR #2 revisado; branch `feature/visual-editor` atualizada (HEAD conferido no GitHub).
- [ ] Backup feito **e verificado** (acima); arquivos guardados fora da sessão.
- [ ] Pré-checagem somente leitura: nenhuma tabela `storefront*`; `authorized_store_ids`, `catalog_touch`, `stores` presentes; sessões ativas ≈ 0.
- [ ] `database/fingerprint.sql` salvo como referência.
- [ ] Janela de baixo uso; rollback pronto para colar.

Aplicar
- [ ] Aplicar `database/storefront-appearance.sql` (idealmente com `apply_migration`, que registra no histórico de migrações).

Depois (validação)
- [ ] `database/fingerprint.sql` **idêntico** ao de antes.
- [ ] Advisors de segurança: somente o aviso esperado de `publish_appearance`; nenhuma tabela nova sem RLS; `anon` sem EXECUTE nas 3 funções.
- [ ] `anon` lê só colunas publicadas (REST com chave anônima): `select=published_template_id,published` OK; `select=draft` negado.
- [ ] Login como lojista Lápis de Cor: abrir aba Aparência (não deve mostrar "recurso não ativado"); salvar rascunho; ver prévia.
- [ ] Publicar e confirmar versão 1 + histórico; restaurar versão para rascunho.
- [ ] Enviar logotipo e banner de teste; conferir leitura pública da imagem; remover.
- [ ] Lojista London não vê/edita a Lápis de Cor e vice-versa; modelo de outra loja só publica em modo loja com WhatsApp.
- [ ] Vitrines London e Lápis de Cor carregam produtos, categorias e WhatsApp como antes (catálogo de 39 produtos intacto).
- [ ] Limpar o que foi usado só para teste (rascunhos/imagens de teste), ou reverter com o rollback.

Netlify
- [ ] Só depois: gerar **Deploy Preview** a partir do PR e conferir manualmente. Publicação em produção **[APROVAÇÃO]** separada.
