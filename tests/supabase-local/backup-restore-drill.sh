#!/usr/bin/env bash
# ENSAIO do backup/restauração em Docker local: dump do banco local, restauração em um banco NOVO e comparação por hash.
# Prova o procedimento de docs/migration-runbook.md sem tocar o projeto real. Requer: bash tests/supabase-local/up.sh e run.sh.
set -euo pipefail
OUT=${OUT:-/tmp/papeliza-drill}; mkdir -p "$OUT"; export PGPASSWORD=postgres
echo "== 1) backup lógico (schemas public e private: estrutura + dados)"
docker exec -e PGPASSWORD=postgres pg-real pg_dump -U postgres -d postgres -Fc --schema=public --schema=private -f /tmp/backup.dump
docker cp pg-real:/tmp/backup.dump "$OUT/backup.dump"; ( cd "$OUT" && sha256sum backup.dump > backup.dump.sha256 && sha256sum -c backup.dump.sha256 )
echo "== 2) banco NOVO e vazio para a restauração"
docker rm -f pg-restore >/dev/null 2>&1 || true
docker run -d --name pg-restore -e POSTGRES_PASSWORD=postgres -p 54330:5432 supabase/postgres:17.6.1.066 >/dev/null
for i in $(seq 1 60); do docker exec pg-restore pg_isready -U postgres >/dev/null 2>&1 && break; sleep 3; done
sleep 5
docker cp "$OUT/backup.dump" pg-restore:/tmp/backup.dump
echo "== 3) restauração"
# o dump recria o schema public: em um banco novo, remova o vazio antes (nunca faça isto em um banco com dados)
docker exec -e PGPASSWORD=postgres pg-restore psql -U postgres -d postgres -q -c "drop schema public cascade" 2>&1 | grep -v NOTICE || true
docker exec -e PGPASSWORD=postgres pg-restore pg_restore -U supabase_admin -d postgres --no-owner --exit-on-error /tmp/backup.dump 2>&1
echo "== 4) comparação por hash (origem x restaurado)"
Q="select 'stores', count(*), md5(string_agg(s::text,'#' order by id)) from public.stores s union all select 'categorias', count(*), md5(string_agg(c::text,'#' order by store_id,name)) from public.catalog_categories c union all select 'produtos', count(*), md5(string_agg(p::text,'#' order by store_id,id)) from public.catalog_products p union all select 'admin_access', count(*), md5(string_agg(a::text,'#' order by email,store_id)) from private.admin_access a order by 1"
docker exec -e PGPASSWORD=postgres pg-real psql -U postgres -d postgres -At -c "$Q" > "$OUT/src.txt"
docker exec -e PGPASSWORD=postgres pg-restore psql -U postgres -d postgres -At -c "$Q" > "$OUT/dst.txt"
diff "$OUT/src.txt" "$OUT/dst.txt" && echo "PASS: restauração idêntica à origem ($(wc -l < "$OUT/src.txt") conjuntos de dados)"
docker exec -e PGPASSWORD=postgres pg-restore psql -U postgres -d postgres -At -c "select count(*) from pg_policies where schemaname='public'" | sed 's/^/políticas restauradas: /'
docker rm -f pg-restore >/dev/null 2>&1
