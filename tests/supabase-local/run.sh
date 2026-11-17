#!/usr/bin/env bash
# Teste da migração de aparência em Supabase LOCAL (Docker): imagem real supabase/postgres + GoTrue + Storage reais.
# NUNCA toca o projeto real. Requer Docker. Uso: bash tests/supabase-local/run.sh  (sobe os contêineres se preciso)
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGPASSWORD=postgres
PORT=${PGPORT_LOCAL:-54329}
ADMIN=(psql -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q)
APP=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
echo "== reset (apenas objetos de teste)"
"${ADMIN[@]}" -c "drop schema if exists private cascade; drop table if exists public.storefront_appearance_history, public.storefront_appearance, public.storefront_templates, public.catalog_products, public.catalog_categories, public.stores cascade; drop function if exists public.publish_appearance(uuid), public.restore_appearance(uuid,integer), public.appearance_config_valid(uuid,jsonb), public.authorized_store_ids() cascade; delete from storage.objects where bucket_id='catalog-images'; delete from storage.buckets where id='catalog-images'; drop policy if exists catalog_photo_admin_read on storage.objects; drop policy if exists catalog_photo_admin_insert on storage.objects; drop policy if exists catalog_photo_admin_delete on storage.objects; delete from auth.users where email like '%@example.invalid';"
echo "== esquema real (baseline) + storage + dados fictícios"
"${APP[@]}" -f tests/supabase-local/baseline.sql
"${ADMIN[@]}" -f tests/supabase-local/baseline-storage.sql
"${APP[@]}" -f tests/supabase-local/baseline-seed.sql
echo "== migração database/storefront-appearance.sql"; "${APP[@]}" -f database/storefront-appearance.sql
echo "== verify-appearance-isolation.sql"; "${APP[@]}" -t -A -f database/verify-appearance-isolation.sql | tail -1
echo "== exposição de funções (anon/authenticated) e RLS"
"${APP[@]}" -t -A -f tests/supabase-local/verify-real-differences.sql
