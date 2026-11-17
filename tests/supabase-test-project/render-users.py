#!/usr/bin/env python3
"""Gera o SQL dos 3 usuários de TESTE do PAINEL 2 e o arquivo de credenciais (JSON), com senhas aleatórias.
Uso: python3 render-users.py <pasta-fora-do-repositório>   ->  <pasta>/20-test-users.sql  e  <pasta>/users.json
As senhas NÃO ficam no repositório. Papéis: lapis (admin da Lápis de Cor), london (admin da London), outsider (logado, sem vínculo)."""
import json, secrets, sys, os
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
LAPIS, LONDON = '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'
users = {
    'lapis':    {'id': '00000000-0000-4000-8000-0000000000a1', 'email': 'teste-lapis@papeliza-teste.example', 'store': LAPIS},
    'london':   {'id': '00000000-0000-4000-8000-0000000000b1', 'email': 'teste-london@papeliza-teste.example', 'store': LONDON},
    'outsider': {'id': '00000000-0000-4000-8000-0000000000c1', 'email': 'teste-sem-vinculo@papeliza-teste.example', 'store': None},
}
sql = ['-- Usuários de TESTE (PAINEL 2). E-mail já confirmado; senha por bcrypt (pgcrypto). Gerado por render-users.py.', 'begin;']
for name, u in users.items():
    u['password'] = secrets.token_urlsafe(18)
    sql.append(
        "insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change) "
        f"values ('00000000-0000-0000-0000-000000000000', '{u['id']}', 'authenticated', 'authenticated', '{u['email']}', extensions.crypt('{u['password']}', extensions.gen_salt('bf')), now(), "
        "'{\"provider\":\"email\",\"providers\":[\"email\"]}', '{}', now(), now(), '', '', '', '');")
    sql.append(
        "insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) "
        f"values ('{u['id']}', '{u['id']}', jsonb_build_object('sub', '{u['id']}', 'email', '{u['email']}', 'email_verified', true), 'email', now(), now(), now());")
    if u['store']:
        sql.append(f"insert into private.admin_access (email, store_id) values ('{u['email']}', '{u['store']}');")
sql.append('commit;')
open(os.path.join(out, '20-test-users.sql'), 'w').write('\n'.join(sql) + '\n')
json.dump({k: {'email': v['email'], 'password': v['password']} for k, v in users.items()}, open(os.path.join(out, 'users.json'), 'w'), indent=1)
os.chmod(os.path.join(out, 'users.json'), 0o600)
print('gerado em', out)
