#!/usr/bin/env bash
# Sobe um Supabase LOCAL mínimo em Docker: Postgres real do Supabase + GoTrue + Storage (sem PostgREST).
# Segredos gerados na hora em $WORK (padrão /tmp/papeliza-sb); nada é salvo no repositório. Nunca toca o projeto real.
set -euo pipefail
WORK=${WORK:-/tmp/papeliza-sb}; mkdir -p "$WORK/storage"
PGIMG=supabase/postgres:17.6.1.066; AUTHIMG=supabase/gotrue:v2.174.0; STOIMG=supabase/storage-api:v1.25.7
[ -f "$WORK/jwtsecret" ] || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > "$WORK/jwtsecret"
SECRET=$(cat "$WORK/jwtsecret")
sign() { node -e "const c=require('crypto'),b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const h=b({alg:'HS256',typ:'JWT'}),p=b(JSON.parse(process.argv[1]));console.log(h+'.'+p+'.'+c.createHmac('sha256',process.argv[2]).update(h+'.'+p).digest('base64url'))" "$1" "$SECRET"; }
EXP=$(( $(date +%s) + 86400 )); sign "{\"role\":\"anon\",\"exp\":$EXP}" > "$WORK/anon.jwt"; sign "{\"role\":\"service_role\",\"exp\":$EXP}" > "$WORK/service.jwt"
docker rm -f pg-real sb-storage sb-auth >/dev/null 2>&1 || true
docker run -d --name pg-real -e POSTGRES_PASSWORD=postgres -p 54329:5432 $PGIMG >/dev/null
for i in $(seq 1 60); do PGPASSWORD=postgres psql -h 127.0.0.1 -p 54329 -U postgres -d postgres -Atc 'select 1' >/dev/null 2>&1 && break; sleep 3; done
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54329 -U supabase_admin -d postgres -q -c "alter role supabase_storage_admin with password 'postgres'; alter role supabase_auth_admin with password 'postgres'; alter role authenticator with password 'postgres';"
docker run -d --name sb-auth --network host -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:9999 -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:54329/postgres" -e GOTRUE_SITE_URL=http://localhost -e GOTRUE_JWT_SECRET="$SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true $AUTHIMG >/dev/null
docker run -d --name sb-storage --network host -v "$WORK/storage":/var/lib/storage -e ANON_KEY="$(cat "$WORK/anon.jwt")" -e SERVICE_KEY="$(cat "$WORK/service.jwt")" -e AUTH_JWT_SECRET="$SECRET" -e PGRST_JWT_SECRET="$SECRET" -e DATABASE_URL="postgres://supabase_storage_admin:postgres@127.0.0.1:54329/postgres" -e POSTGREST_URL=http://127.0.0.1:3000 -e DB_INSTALL_ROLES=false -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage -e TENANT_ID=local -e REGION=local -e GLOBAL_S3_BUCKET=local -e SERVER_PORT=5000 -e ENABLE_IMAGE_TRANSFORMATION=false -e FILE_SIZE_LIMIT=52428800 $STOIMG >/dev/null
for i in $(seq 1 60); do curl -fsS -m 3 http://127.0.0.1:5000/status >/dev/null 2>&1 && curl -fsS -m 3 http://127.0.0.1:9999/health >/dev/null 2>&1 && break; sleep 3; done
echo "Pronto. Rode: bash tests/supabase-local/run.sh && ANON_JWT_FILE=$WORK/anon.jwt node tests/supabase-local/storage.e2e.cjs"
