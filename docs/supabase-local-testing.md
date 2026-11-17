# Testes em Supabase local (Docker) — sem tocar o projeto real

**Por que:** a branch de teste do Supabase custa US$ 9/mês e não foi contratada. Este ambiente reproduz o esquema real em Docker, gratuitamente.

**O que roda:** imagem real `supabase/postgres:17.6.1.066`, **GoTrue** real (login/JWT) e **storage-api** real (bucket, limites, RLS de `storage.objects`). Esquema, políticas e permissões vêm de `baseline*.sql`, extraídos do projeto real **somente em leitura** (sem dados, e-mails ou usuários reais).

```bash
bash tests/supabase-local/up.sh        # sobe os 3 contêineres
bash tests/supabase-local/run.sh       # esquema real + migração + verify-appearance-isolation + exposição de funções/RLS
ANON_JWT_FILE=/tmp/papeliza-sb/anon.jwt node tests/supabase-local/storage.e2e.cjs   # Storage + login reais
bash tests/supabase-local/down.sh
```

## O que o ambiente real pegou (e o stub não)
- Funções novas em `public` recebem `EXECUTE` para `anon` por padrão no Supabase: `appearance_config_valid` ficava exposta. **Corrigido** na migração (`revoke ... from public, anon`) e coberto por `verify-real-differences.sql`.
- O Storage já cobre `<store_id>/branding/…` com as políticas atuais de `catalog-images`: **nenhuma migração de Storage é necessária**.

## Diferenças entre local e projeto real (o que ainda exige validação no real)
| Item | Local | Real |
|---|---|---|
| Postgres | 17.6.1.066 | 17.11.0.018 |
| GoTrue / storage-api | v2.174.0 / v1.25.7 | versões mais novas da plataforma |
| PostgREST (API REST) | **não executado** (imagem indisponível) | ativo |
| Esquema | reproduzido por leitura (não é `pg_dump`) | fonte da verdade |
| Dados | fictícios (2 lojas, 2 produtos) | 2 lojas, 10 categorias, 39 produtos |
| Proxy/CDN, Kong, rate limits | ausentes | presentes |

**Só dá para confirmar no real:** a camada REST (grants por coluna via PostgREST, `notify pgrst`, cache de esquema, RPC exposto em `/rest/v1/rpc`), comportamento de CORS/CDN do bucket público, e a aplicação da migração sobre o catálogo existente (39 produtos). Aplicar a migração no real exige aprovação explícita, com backup antes.
