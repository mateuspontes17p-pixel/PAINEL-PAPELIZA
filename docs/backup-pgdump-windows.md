# Backup completo com `pg_dump` 17 no Windows (projeto de produção Papeliza AI)

Você faz tudo na **sua máquina**. **Nunca envie senhas no chat.** Este guia só lê o banco (`pg_dump` não altera nada). Referência: `docs/migration-runbook.md`.

## 1. Instalar (uma vez, ~5 min)
1. Baixe o instalador do **PostgreSQL 17** para Windows em https://www.postgresql.org/download/windows/ (EDB).
2. Na instalação, deixe marcados **PostgreSQL Server** (só para a verificação local) e **Command Line Tools**.
3. Defina uma senha para o usuário `postgres` do **seu PC**. Ela é só local e **não** é a senha do Supabase. Porta padrão 5432 (se estiver ocupada, use 5433 nos comandos locais).
4. Confira no PowerShell (deve mostrar 17.x):
```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" --version
```

## 2. Dados de conexão (copie do painel, não do chat)
No Supabase: projeto **Papeliza AI** → botão **Connect** → **Session pooler**. Copie o **Host** (a porta é 5432). O usuário é `postgres.ipqawywfqydgyabcynbh`. A senha é a do banco do projeto. Se não lembrar, use Project Settings → Database → *Reset database password* (o app usa chaves de API, não essa senha; só afeta quem se conecta direto ao banco).

## 3. Gerar o backup
Cole no PowerShell (a senha é digitada oculta e não fica gravada):
```powershell
$bin   = "C:\Program Files\PostgreSQL\17\bin"
$pasta = "$HOME\Documents\papeliza-backup-2026-11-16"; New-Item -ItemType Directory -Force "$pasta\imagens" | Out-Null
$dbhost = Read-Host "Host do Session pooler (copiado do painel)"
$user  = "postgres.ipqawywfqydgyabcynbh"
$sec   = Read-Host "Senha do banco (não aparece na tela)" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))

# A) catálogo e vínculos (estrutura + dados)
& "$bin\pg_dump.exe" -h $dbhost -p 5432 -U $user -d postgres -Fc --no-owner --schema=public --schema=private -f "$pasta\papeliza-public-private.dump"
# B) usuários (COM hash de senha) e metadados do Storage. Arquivo SENSÍVEL
& "$bin\pg_dump.exe" -h $dbhost -p 5432 -U $user -d postgres --data-only --table=auth.users --table=auth.identities --table=storage.buckets --table=storage.objects -f "$pasta\papeliza-auth-storage.sql"

Remove-Item Env:PGPASSWORD
```

## 4. Baixar as 4 imagens (pelo painel)
Storage → bucket `catalog-images` → pasta `e1419ffd-709d-4242-925b-16e2a005ca7f` → baixe os 4 arquivos para `…\papeliza-backup-2026-11-16\imagens`. Depois confira:
```powershell
Get-ChildItem "$pasta\imagens" | ForEach-Object { "{0}  {1} bytes  MD5={2}" -f $_.Name, $_.Length, (Get-FileHash $_.FullName -Algorithm MD5).Hash.ToLower() }
```
Esperado:

| Arquivo | Tamanho | MD5 |
|---|---|---|
| `35e49a82-067f-49fc-a787-b490af83aea2.png` | 34734 | `d777be5da1a88ee3d2f33258ecc23bc6` |
| `4b96e2d0-e891-4929-a3a9-55986749b5c7.jpg` | 36338 | `3c1801405db0af9441b258991262700c` |
| `5976ed3b-69d9-4d7d-8e69-0ef1933b7e40.jpg` | 36338 | `3c1801405db0af9441b258991262700c` |
| `abc5a0db-e6bb-4d19-999c-38170dbc74fb.jpg` | 36338 | `3c1801405db0af9441b258991262700c` |

## 5. Verificar (obrigatório: backup não verificado não conta)
**a) Integridade e legibilidade**
```powershell
Get-ChildItem $pasta -File | Get-FileHash -Algorithm SHA256 | Tee-Object "$pasta\SHA256.txt"
& "$bin\pg_restore.exe" --list "$pasta\papeliza-public-private.dump" | Select-String "TABLE DATA"   # deve listar 4 tabelas
Select-String -Path "$pasta\papeliza-auth-storage.sql" -Pattern "COPY auth.users" -SimpleMatch      # deve achar 1 linha
```
As 4 tabelas: `public.stores`, `public.catalog_categories`, `public.catalog_products`, `private.admin_access`.

**b) Restaurar em um banco de teste no SEU PC e comparar**
```powershell
@'
set timezone = 'UTC';
select 'stores' as item, count(*)::text || ' | ' || coalesce(md5(string_agg(s::text, '#' order by s.id)), '-') as valor from public.stores s
union all select 'catalog_categories', count(*)::text || ' | ' || coalesce(md5(string_agg(c::text, '#' order by c.store_id, c.name)), '-') from public.catalog_categories c
union all select 'catalog_products', count(*)::text || ' | ' || coalesce(md5(string_agg(p::text, '#' order by p.store_id, p.id)), '-') from public.catalog_products p
union all select 'admin_access', count(*)::text || ' | ' || coalesce(md5(string_agg(a::text, '#' order by a.email, a.store_id)), '-') from private.admin_access a
order by 1;
'@ | Set-Content -Encoding UTF8 "$pasta\verificar-dump.sql"

$sec2 = Read-Host "Senha do PostgreSQL LOCAL do seu PC" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec2))
& "$bin\psql.exe" -U postgres -h localhost -c "drop database if exists papeliza_verify" -c "create database papeliza_verify"
& "$bin\psql.exe" -U postgres -h localhost -d papeliza_verify -c "drop schema public cascade"
& "$bin\pg_restore.exe" -U postgres -h localhost -d papeliza_verify --no-owner --no-privileges "$pasta\papeliza-public-private.dump"
& "$bin\psql.exe" -U postgres -h localhost -d papeliza_verify -At -F " | " -f "$pasta\verificar-dump.sql"
& "$bin\psql.exe" -U postgres -h localhost -c "drop database papeliza_verify"
Remove-Item Env:PGPASSWORD
```
**Resultado esperado** (colhido na produção em 2026-11-16, antes de qualquer migração). As 4 linhas devem ser **idênticas**:
```
admin_access | 3 | 331162720da762da1699224005ae67a7
catalog_categories | 10 | 0afae9e32395a0b49a7449cad09c9866
catalog_products | 39 | da749684107215f1ce6b1a4dd4cd68f8
stores | 2 | 4cddc524c78f2dc993f8086bdfd5c8c7
```
Se algum valor diferir, houve alteração no catálogo entre a minha leitura e o seu dump (por exemplo, um produto editado). Me diga qual linha, **sem enviar dados nem senhas**, e refazemos a referência.

## 6. Guardar
- Faça **2 cópias** em lugares diferentes (por exemplo, disco externo e nuvem privada), de preferência dentro de um arquivo **7-Zip com AES-256** e senha forte guardada à parte.
- O arquivo B contém **e-mails reais e hash de senha**. **Nunca** envie ao GitHub, e-mail ou chat.

## 7. O que me informar
Só isto: nomes dos arquivos, **tamanhos**, o `SHA256.txt` e as **4 linhas** do passo 5b. Nenhuma senha, string de conexão ou conteúdo do banco.
