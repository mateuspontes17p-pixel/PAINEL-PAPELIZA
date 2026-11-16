#!/usr/bin/env bash
# Gera 10-base-schema.sql (esquema-base do PAINEL 2) a partir da reprodução do esquema real em tests/supabase-local/.
# Fonte única: evita divergência entre o teste local e o projeto de testes. Omite os GRANTs do Storage (a plataforma já os define).
set -euo pipefail
cd "$(dirname "$0")/../supabase-local"
{
  echo "-- ESQUEMA-BASE do projeto de TESTES (PAINEL 2): reproduz o estado do projeto real ANTES da migração de aparência."
  echo "-- Gerado por tests/supabase-test-project/build-base.sh. Dados FICTÍCIOS. NUNCA aplicar no projeto de produção (Papeliza AI)."
  echo "begin;"
  grep -v '^-- ' baseline.sql
  echo "-- Storage: bucket e políticas idênticos aos do projeto real"
  grep -v '^-- \|^grant \|^$' baseline-storage.sql
  echo "-- Dados fictícios (mesmos slugs das lojas reais)"
  grep -v '^-- ' baseline-seed.sql
  echo "commit;"
} > ../supabase-test-project/10-base-schema.sql
echo "gerado: $(wc -l < ../supabase-test-project/10-base-schema.sql) linhas"
