// Testa o envio de logotipo/banner contra o Storage REAL (storage-api) e o login real (GoTrue), em Docker local.
// Pré-requisito: bash tests/supabase-local/run.sh (cria esquema, migração e dados fictícios). Nunca toca o projeto real.
const { execFileSync } = require('child_process');
const fs = require('fs'), assert = require('assert'), crypto = require('crypto');
const AUTH = 'http://127.0.0.1:9999', STORAGE = 'http://127.0.0.1:5000';
const ANON = fs.readFileSync(process.env.ANON_JWT_FILE, 'utf8').trim();
const LAPIS = '11111111-1111-4111-8111-111111111111', LONDON = '22222222-2222-4222-8222-222222222222';
const psql = sql => execFileSync('psql', ['-h', '127.0.0.1', '-p', '54329', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const check = (ok, name) => { console.log((ok ? '  ok   ' : '  FAIL ') + name); if (!ok) process.exitCode = 1; };
const upload = (token, path, body, type) => fetch(`${STORAGE}/object/catalog-images/${path}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': type, 'x-upsert': 'false' }, body });
const uid = () => crypto.randomUUID();

(async () => {
  // usuários reais no GoTrue (e-mail confirmado automaticamente); só o lojista Lápis é autorizado na Lápis
  const sign = async email => { const r = await fetch(AUTH + '/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ email, password: 'senha-de-teste-123' }) }); const j = await r.json(); assert.ok(j.access_token, 'signup falhou: ' + JSON.stringify(j).slice(0, 120)); return j.access_token; };
  const tag = Date.now();
  const lapisEmail = `lapis${tag}@example.invalid`, otherEmail = `outro${tag}@example.invalid`;
  const lapis = await sign(lapisEmail), outro = await sign(otherEmail);
  psql(`insert into private.admin_access(email, store_id) values ('${lapisEmail}', '${LAPIS}')`);

  const logo = `${LAPIS}/branding/${uid()}.png`, banner = `${LAPIS}/branding/${uid()}.png`;
  check((await upload(lapis, logo, PNG, 'image/png')).ok, 'lojista envia o logotipo para <store_id>/branding/');
  check((await upload(lapis, banner, PNG, 'image/png')).ok, 'lojista envia o banner para <store_id>/branding/');
  check((await upload(lapis, `${LONDON}/branding/${uid()}.png`, PNG, 'image/png')).status >= 400, 'lojista NÃO envia para a pasta de outra loja');
  check((await upload(outro, `${LAPIS}/branding/${uid()}.png`, PNG, 'image/png')).status >= 400, 'usuário logado sem vínculo NÃO envia');
  check((await upload(ANON, `${LAPIS}/branding/${uid()}.png`, PNG, 'image/png')).status >= 400, 'visitante anônimo NÃO envia');
  check((await upload(lapis, `${LAPIS}/branding/${uid()}.png`, Buffer.concat([PNG, Buffer.alloc(1_200_000)]), 'image/png')).status >= 400, 'arquivo maior que 1 MB é recusado pelo bucket');
  check((await upload(lapis, `${LAPIS}/branding/${uid()}.gif`, Buffer.from('GIF89a'), 'image/gif')).status >= 400, 'tipo não permitido (gif) é recusado');
  check((await upload(lapis, `${LAPIS}/branding/${uid()}.svg`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).status >= 400, 'SVG é recusado');

  const pub = await fetch(`${STORAGE}/object/public/catalog-images/${logo}`);
  check(pub.ok && pub.headers.get('content-type') === 'image/png', 'logotipo publicado é legível sem login (bucket público), como a vitrine precisa');

  // o caminho enviado passa na validação do banco (migração)
  const ok = psql(`select public.appearance_config_valid('${LAPIS}', '{"images":{"logoPath":"${logo}","bannerPath":"${banner}"}}'::jsonb)`);
  check(ok === 't', 'o banco aceita os caminhos enviados como logotipo/banner da própria loja');
  const bad = psql(`select public.appearance_config_valid('${LAPIS}', '{"images":{"logoPath":"${LONDON}/branding/${uid()}.png"}}'::jsonb)`);
  check(bad === 'f', 'o banco recusa caminho de imagem de outra loja');

  const del = await fetch(`${STORAGE}/object/catalog-images/${logo}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + lapis } });
  check(del.ok, 'lojista remove a própria imagem');
  const delOther = await fetch(`${STORAGE}/object/catalog-images/${banner}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + outro } });
  const still = await fetch(`${STORAGE}/object/public/catalog-images/${banner}`);
  check(still.ok, 'usuário sem vínculo NÃO apaga a imagem da loja (status ' + delOther.status + ')');
  psql(`delete from private.admin_access where email = '${lapisEmail}'`);
})().catch(e => { console.error(e); process.exitCode = 1; });
