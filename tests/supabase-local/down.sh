#!/usr/bin/env bash
docker rm -f pg-real sb-storage sb-auth >/dev/null 2>&1 || true; echo "Supabase local removido."
