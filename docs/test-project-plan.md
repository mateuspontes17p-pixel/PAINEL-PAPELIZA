# Plano do ambiente de testes: PAINEL 2 (`yqsrieflslnsqxqsinkt`)

**Estado:** EXECUTADO no PAINEL 2 (autorizado). O projeto de produção (`ipqawywfqydgyabcynbh`) não foi tocado.

## Verificado (leitura)
Projeto `ACTIVE_HEALTHY`, Postgres 17.12, região us-east-1 (produção: 17.11, sa-east-1), plano Free. Vazio: 0 objetos em `public`, sem schema `private`, 0 usuários, 0 buckets, 0 políticas de Storage, 0 migrações, sem avisos de segurança. Privilégios padrão de `public` idênticos aos da produção. Pré-checagem `tests/supabase-test-project/00-preflight-readonly.sql`: 7 de 7 itens `OK`.

## Operações propostas (cada uma só após aprovação)
| # | Operação no PAINEL 2 | Arquivo | Efeito |
|---|---|---|---|
| 1 | `apply_migration` `papeliza_base_schema` | `tests/supabase-test-project/10-base-schema.sql` | Cria `private.admin_access`, `stores`, `catalog_*`, `authorized_store_ids()`, `catalog_touch()`, políticas RLS, bucket `catalog-images` (1 MB; JPEG/PNG/WebP) e políticas do Storage, com 2 lojas e 2 produtos **fictícios**. Reproduz a produção antes da migração. |
| 2 | `execute_sql` (leitura) | `database/fingerprint.sql` | Referência "antes" (hashes). |
| 3 | `apply_migration` `storefront_appearance` | `database/storefront-appearance.sql` | A migração sob teste (3 tabelas, 3 funções, RLS). |
| 4 | `execute_sql` (leitura) | `database/fingerprint.sql` | Deve ser idêntico ao do passo 2. |
| 5 | `execute_sql` | `20-test-users.sql` (gerado por `render-users.py`, fora do repositório) | 3 usuários de teste com e-mail confirmado e vínculos de admin (Lápis, London, sem vínculo). Senhas aleatórias guardadas só na sessão. |
| 6 | `get_advisors` (leitura) | (n/a) | Segurança pós-migração. |
| 7 | Testes de API | `api-tests.cjs` | Auth, REST (PostgREST), Storage e isolamento (≈55 verificações). **Precisa liberar o host da API (abaixo).** |
| 8 | Teste do rollback | `database/storefront-appearance-rollback.sql` + fingerprint + reaplicar | Prova o rollback no hospedado. |
| 9 | Limpeza entre execuções | `90-reset-test-data.sql` | Apaga só aparência/histórico de teste. |

Nenhum recurso pago é usado. Usuários são criados por SQL (sem envio de e-mails, que no Free tem limite de envio). Projetos Free são pausados após inatividade.

## Revisão da migração para este ambiente
Nenhuma alteração necessária no `storefront-appearance.sql`. Diferenças já tratadas: o PAINEL 2 não tem o esquema-base (passo 1 o cria, gerado do esquema real lido em leitura), Storage já traz permissões da plataforma (por isso o passo 1 não emite `GRANT` no Storage), e os privilégios padrão iguais aos da produção reproduzem a exposição de `anon` que a migração já corrige.

## Bloqueio de rede (a decidir)
O proxy desta sessão recusa `yqsrieflslnsqxqsinkt.supabase.co` (403). Sem liberar esse host exato, os passos 7 e 8 não rodam aqui. Opções: (a) autorizar adicionar **somente esse host** à lista de rede do ambiente; (b) você roda `api-tests.cjs` na sua máquina (comando no cabeçalho do arquivo) e me envia a saída.

## O que já foi validado localmente (Docker) e o que não
Validado: esquema-base gerado, SQL dos usuários (login real), Auth, Storage e isolamento por loja. **Não validado** (precisa do PostgREST no PAINEL 2): todo o bloco REST de `api-tests.cjs` (sintaxe verificada; lógica ainda não executada).


## Resultado da execução no PAINEL 2 (2026-11-16)
- Aplicados: `papeliza_base_schema` e `storefront_appearance` (via `apply_migration`); 3 usuários fictícios criados só com **hash** bcrypt (senhas em texto ficam em arquivo local 0600, fora do repositório).
- **Fingerprint antes x depois da migração: idêntico** (11 itens). Depois do rollback hospedado e da reaplicação: idêntico nos itens preservados.
- **Suíte `api-tests.cjs`: 65 de 65** (Auth, REST/PostgREST, Storage, isolamento entre lojas, regressão do catálogo).
- Rollback hospedado: removeu só 3 tabelas e 3 funções de aparência; REST passou a responder `PGRST205`/`PGRST202` (o painel trata como "recurso ainda não ativado") e o catálogo seguiu respondendo.
- Advisors: apenas `authorized_store_ids` (já existe na produção), `publish_appearance` (intencional) e senhas vazadas (configuração do Auth).

## Achados
1. **CDN do Storage:** depois de apagar uma imagem, a URL pública (e até GETs autenticados já lidos) continua servida do cache. O estado real é confirmado por **listagem** (POST), que a suíte usa. Logotipos novos usam caminho com UUID, então não há exibição de imagem antiga.
2. Node `fetch` não usa proxy por padrão: em ambientes com proxy, rodar com `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<bundle>`.
3. Ao gerar o SQL de usuários, nunca imprimir argumentos de comandos (uma falha chegou a exibir uma senha de teste; ela foi trocada antes de qualquer uso).

## Como repetir
`SUPABASE_URL=https://yqsrieflslnsqxqsinkt.supabase.co SUPABASE_ANON_KEY=<anon> USERS_FILE=users.json node tests/supabase-test-project/api-tests.cjs` (a suíte recusa a URL de produção). Para repetir, rode antes `90-reset-test-data.sql` (somente PAINEL 2).

## Teste de navegador real contra o PAINEL 2 (53 de 53)
`tests/e2e/painel2.e2e.py`: Chrome real, painel e vitrines servidos de uma **cópia temporária** de `public/` apontada para o PAINEL 2; só o host de testes é encaminhado e qualquer chamada à produção é abortada e reprovaria o teste (0 ocorridas). Cobre login, seletor de loja, catálogo, edição de cores/textos/endereço/horários/mapa/WhatsApp, envio de logotipo e banner ao Storage, prévia em computador e celular, rascunho, publicar, histórico, restaurar, modelo de outra loja (gate), isolamento London x Lápis de Cor, usuário sem vínculo e painel no celular. Capturas em `docs/screenshots/painel2/`.

**Defeito corrigido:** o formulário de Aparência ficava editável enquanto os dados carregavam e `populate()` apagava o que a pessoa digitasse nesse intervalo (reproduzido no código antigo). Agora o formulário fica bloqueado (`inert` + `aria-busy`) até carregar.

**Pré-visualização para teste manual:** `node scripts/build-test-preview.mjs <pasta>` gera a cópia apontada para o PAINEL 2, com faixa "AMBIENTE DE TESTES", e recusa a URL de produção e qualquer chave que não seja pública.
