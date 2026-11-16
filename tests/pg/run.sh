#!/usr/bin/env bash
# Testa a migração de aparência em um PostgreSQL local DESCARTÁVEL (nunca no Supabase real).
# Usa um stub do esquema (tests/pg/stub-supabase.sql). Sem PostgreSQL instalado, pula com aviso.
set -euo pipefail
cd "$(dirname "$0")/../.."
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)
if [ -z "${BIN:-}" ] || [ ! -x "$BIN/initdb" ]; then echo "SKIP: PostgreSQL local não encontrado."; exit 0; fi

DIR=$(mktemp -d /tmp/papeliza-pg.XXXXXX); PORT=$((20000 + RANDOM % 20000))
if [ "$(id -u)" = 0 ]; then RUN=(runuser -u postgres --); chown postgres "$DIR"; else RUN=(env); fi
chmod 755 "$DIR"; chmod -R a+rX database tests >/dev/null 2>&1 || true
cleanup() { "${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

"${RUN[@]}" "$BIN/initdb" -D "$DIR/data" -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
SQL=("${RUN[@]}" "$BIN/psql" -h "$DIR" -p "$PORT" -d postgres -v ON_ERROR_STOP=1 -q)

"${SQL[@]}" -f tests/pg/stub-supabase.sql
echo "== aplicando database/storefront-appearance.sql"; "${SQL[@]}" -f database/storefront-appearance.sql
echo "== verify-appearance-isolation.sql"; "${SQL[@]}" -t -A -f database/verify-appearance-isolation.sql
echo "== rollback e reaplicação (idempotência do ciclo)"
"${SQL[@]}" -f database/storefront-appearance-rollback.sql
"${SQL[@]}" -f database/storefront-appearance.sql
"${SQL[@]}" -t -A -f database/verify-appearance-isolation.sql
echo "== rollback não toca em lojas"; "${SQL[@]}" -f database/storefront-appearance-rollback.sql
test "$("${SQL[@]}" -t -A -c 'select count(*) from public.stores')" = 2 && echo "PASS: lojas preservadas após rollback."
