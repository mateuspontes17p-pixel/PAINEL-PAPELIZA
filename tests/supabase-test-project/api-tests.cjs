// Testes de API do ambiente de TESTES (PAINEL 2): Auth, REST (PostgREST), Storage e isolamento entre lojas.
// NUNCA aponte para o projeto de produção. A suíte recusa a URL de produção (Papeliza AI).
//
// Hospedado (PAINEL 2):  SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon/publishable> USERS_FILE=users.json node api-tests.cjs
// Local (Docker, sem PostgREST): AUTH_URL=http://127.0.0.1:9999 STORAGE_URL=http://127.0.0.1:5000 SKIP_REST=1 SUPABASE_ANON_KEY=<jwt> USERS_FILE=users.json node api-tests.cjs
// Dependências: banco com 10-base-schema.sql + database/storefront-appearance.sql + 20-test-users.sql.
const fs = require('fs'), assert = require('assert'), crypto = require('crypto');

const PROD_REF = 'ipqawywfqydgyabcynbh';
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
if (URL_.includes(PROD_REF)) { console.error('RECUSADO: esta suíte não roda no projeto de produção.'); process.exit(2); }
const AUTH = process.env.AUTH_URL || URL_ + '/auth/v1';
const REST = process.env.REST_URL || URL_ + '/rest/v1';
const STORAGE = process.env.STORAGE_URL || URL_ + '/storage/v1';
const ANON = process.env.SUPABASE_ANON_KEY;
const SKIP_REST = process.env.SKIP_REST === '1';
if (!ANON || !process.env.USERS_FILE || (!URL_ && !(process.env.AUTH_URL && process.env.STORAGE_URL))) { console.error('Defina SUPABASE_URL (ou AUTH_URL/STORAGE_URL), SUPABASE_ANON_KEY e USERS_FILE.'); process.exit(2); }
const USERS = JSON.parse(fs.readFileSync(process.env.USERS_FILE, 'utf8'));
const LAPIS = '11111111-1111-4111-8111-111111111111', LONDON = '22222222-2222-4222-8222-222222222222';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let failures = 0, passed = 0;
const check = (ok, name, detail) => { if (ok) passed++; else failures++; console.log((ok ? '  ok   ' : '  FAIL ') + name + (!ok && detail !== undefined ? '  → ' + String(detail).slice(0, 180) : '')); };
const section = title => console.log('\n[' + title + ']');
const denied = r => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 406; // recusado de qualquer forma
const body = async res => { const text = await res.text(); try { return JSON.parse(text); } catch { return text; } };

async function login(user) {
  const res = await fetch(AUTH + '/token?grant_type=password', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ email: user.email, password: user.password }) });
  const json = await body(res);
  return { status: res.status, token: json && json.access_token, json };
}
async function rest(method, path, { token, data, prefer, headers } = {}) {
  const res = await fetch(REST + '/' + path, { method, headers: { apikey: ANON, Authorization: 'Bearer ' + (token || ANON), 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: res.status, json: await body(res) };
}
const upload = (token, path, buf, type) => fetch(`${STORAGE}/object/catalog-images/${path}`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + token, 'Content-Type': type }, body: buf });
const uid = () => crypto.randomUUID();

(async () => {
  section('Auth');
  const lapisL = await login(USERS.lapis), londonL = await login(USERS.london), outsiderL = await login(USERS.outsider);
  check(!!lapisL.token && !!londonL.token && !!outsiderL.token, 'login por senha dos 3 usuários de teste (JWT real)', JSON.stringify(lapisL.json).slice(0, 100));
  if (!lapisL.token || !londonL.token || !outsiderL.token) { console.log('Sem login, não há como continuar.'); process.exit(1); }
  const bad = await login({ email: USERS.lapis.email, password: 'senha-errada-xyz' });
  check(!bad.token && bad.status >= 400, 'senha errada é recusada');
  const claims = JSON.parse(Buffer.from(lapisL.token.split('.')[1], 'base64url').toString());
  check(claims.role === 'authenticated' && claims.email === USERS.lapis.email, 'JWT traz role=authenticated e o e-mail do usuário');
  const T = { lapis: lapisL.token, london: londonL.token, outsider: outsiderL.token };

  if (!SKIP_REST) {
    section('REST · visitante anônimo');
    let r = await rest('GET', 'stores?select=id,name,slug'); check(r.status === 200 && r.json.length === 2, 'lê lojas (id, nome, slug)', r.status);
    r = await rest('GET', 'catalog_products?select=id,store_id'); check(r.status === 200 && r.json.length === 2, 'lê só produtos visíveis (catálogo existente intacto)', JSON.stringify(r.json).slice(0, 80));
    r = await rest('GET', 'admin_access?select=*', { headers: { 'Accept-Profile': 'private' } }); check(denied(r) || r.status >= 400, 'schema private não é exposto', r.status);
    r = await rest('GET', 'storefront_templates?select=id'); check(r.status === 200 && r.json.length === 2, 'lê o catálogo de modelos (2)', r.status);
    r = await rest('GET', 'storefront_appearance?select=published_template_id,published'); check(r.status === 200 && Array.isArray(r.json), 'lê só colunas publicadas da aparência', r.status);
    r = await rest('GET', 'storefront_appearance?select=draft'); check(denied(r), 'NÃO lê o rascunho', r.status);
    r = await rest('GET', 'storefront_appearance?select=*'); check(denied(r), 'select=* é recusado (privilégio por coluna)', r.status);
    r = await rest('GET', 'storefront_appearance_history?select=*'); check(denied(r), 'NÃO lê o histórico', r.status);
    r = await rest('POST', 'storefront_appearance', { data: { store_id: LAPIS, draft_template_id: 'lapis-de-cor', draft: { version: 1 } } }); check(denied(r), 'NÃO grava aparência', r.status);
    r = await rest('POST', 'rpc/publish_appearance', { data: { p_store: LAPIS } }); check(denied(r), 'NÃO chama publish_appearance', r.status);
    r = await rest('POST', 'rpc/appearance_config_valid', { data: { p_store: LAPIS, cfg: { version: 1 } } }); check(denied(r), 'NÃO chama appearance_config_valid', r.status);

    section('REST · lojista da Lápis de Cor');
    r = await rest('GET', 'storefront_appearance?select=*', { token: T.lapis }); check(r.status === 200 && r.json.length === 0, 'começa sem aparência (se falhar, rode 90-reset-test-data.sql)', JSON.stringify(r.json).slice(0, 80));
    r = await rest('POST', 'storefront_appearance?select=*', { token: T.lapis, prefer: 'return=representation', data: { store_id: LAPIS, draft_template_id: 'lapis-de-cor', draft: { version: 1, colors: { primary: '#2a6f3b' }, texts: { address: 'Rua das Flores, 100\nCambé, PR' } } } });
    const row = Array.isArray(r.json) ? r.json[0] : null;
    check(r.status === 201 && row && row.published_version === 0, 'insere rascunho com RETURNING', r.status + ' ' + JSON.stringify(r.json).slice(0, 80));
    r = await rest('POST', 'storefront_appearance', { token: T.lapis, data: { store_id: LAPIS, draft_template_id: 'lapis-de-cor', draft: { version: 1 } } }); check(r.status === 409, 'segunda inserção da mesma loja é conflito (chave primária)', r.status);
    r = await rest('POST', 'storefront_appearance', { token: T.lapis, data: { store_id: LAPIS, draft_template_id: 'lapis-de-cor', draft: { version: 1, colors: { primary: 'vermelho' } } } }); check(r.status >= 400, 'configuração inválida é recusada pelo banco', r.status);
    const stamp = row && row.updated_at;
    r = await rest('PATCH', `storefront_appearance?store_id=eq.${LAPIS}&updated_at=eq.${encodeURIComponent(stamp)}&select=*`, { token: T.lapis, prefer: 'return=representation', data: { draft_template_id: 'lapis-de-cor', draft: { version: 1, colors: { primary: '#123456' } } } });
    check(r.status === 200 && r.json.length === 1 && r.json[0].draft.colors.primary === '#123456', 'update com filtro de updated_at (microssegundos, "+" codificado) altera 1 linha', r.status + ' ' + JSON.stringify(r.json).slice(0, 80));
    const stamp2 = r.json[0] && r.json[0].updated_at;
    r = await rest('PATCH', `storefront_appearance?store_id=eq.${LAPIS}&updated_at=eq.${encodeURIComponent(stamp)}&select=*`, { token: T.lapis, prefer: 'return=representation', data: { draft: { version: 1 } } });
    check(r.status === 200 && r.json.length === 0, 'update com updated_at antigo não altera nada (detecção de conflito)', JSON.stringify(r.json).slice(0, 60));
    check(!!stamp2 && stamp2 !== stamp, 'trigger atualiza updated_at a cada alteração');
    r = await rest('PATCH', `storefront_appearance?store_id=eq.${LAPIS}`, { token: T.lapis, data: { published_version: 99 } }); check(denied(r) || r.status >= 400, 'NÃO altera colunas publicadas diretamente', r.status);
    r = await rest('POST', 'rpc/publish_appearance', { token: T.lapis, data: { p_store: LAPIS } }); check(r.status === 200 && r.json === 1, 'publica: retorna a versão 1', r.status + ' ' + JSON.stringify(r.json));
    r = await rest('GET', 'storefront_appearance_history?select=version,template_id', { token: T.lapis }); check(r.status === 200 && r.json.length === 1 && r.json[0].version === 1, 'histórico registra a versão 1', JSON.stringify(r.json).slice(0, 80));
    r = await rest('GET', 'storefront_appearance?select=published_template_id,published'); check(r.status === 200 && r.json.length === 1 && r.json[0].published_template_id === 'lapis-de-cor' && r.json[0].published.colors.primary === '#123456', 'visitante já vê a versão publicada');
    r = await rest('GET', 'storefront_appearance?select=draft'); check(denied(r), 'visitante continua sem ver o rascunho', r.status);
    const cur = (await rest('GET', 'storefront_appearance?select=updated_at', { token: T.lapis })).json[0].updated_at;
    r = await rest('PATCH', `storefront_appearance?store_id=eq.${LAPIS}&updated_at=eq.${encodeURIComponent(cur)}&select=*`, { token: T.lapis, prefer: 'return=representation', data: { draft_template_id: 'london', draft: { version: 1 } } });
    check(r.status === 200 && r.json.length === 1, 'rascunho com o modelo de outra loja é aceito (prévia)');
    r = await rest('POST', 'rpc/publish_appearance', { token: T.lapis, data: { p_store: LAPIS } }); check(r.status >= 400, 'publicar modelo de outra loja SEM modo loja é recusado', r.status);
    const cur2 = (await rest('GET', 'storefront_appearance?select=updated_at', { token: T.lapis })).json[0].updated_at;
    r = await rest('PATCH', `storefront_appearance?store_id=eq.${LAPIS}&updated_at=eq.${encodeURIComponent(cur2)}&select=*`, { token: T.lapis, prefer: 'return=representation', data: { draft: { version: 1, options: { storeMode: true } } } });
    r = await rest('POST', 'rpc/publish_appearance', { token: T.lapis, data: { p_store: LAPIS } }); check(r.status >= 400, 'modo loja SEM WhatsApp próprio é recusado', r.status);
    const cur3 = (await rest('GET', 'storefront_appearance?select=updated_at', { token: T.lapis })).json[0].updated_at;
    await rest('PATCH', `storefront_appearance?store_id=eq.${LAPIS}&updated_at=eq.${encodeURIComponent(cur3)}`, { token: T.lapis, data: { draft: { version: 1, options: { storeMode: true }, contact: { whatsapp: '5543911112222' } } } });
    r = await rest('POST', 'rpc/publish_appearance', { token: T.lapis, data: { p_store: LAPIS } }); check(r.status === 200 && r.json === 2, 'modo loja + WhatsApp próprio publica (versão 2)', r.status + ' ' + JSON.stringify(r.json));
    r = await rest('POST', 'rpc/restore_appearance', { token: T.lapis, data: { p_store: LAPIS, p_version: 1 } }); check(r.status === 200 && typeof r.json === 'string', 'restaura a versão 1 para o rascunho (retorna timestamp)', r.status + ' ' + JSON.stringify(r.json).slice(0, 60));
    r = await rest('GET', 'storefront_appearance?select=published_version,draft', { token: T.lapis }); check(r.json[0] && r.json[0].published_version === 2 && r.json[0].draft.colors && r.json[0].draft.colors.primary === '#123456', 'restauração mexeu só no rascunho (versão 2 segue no ar)');
    r = await rest('POST', 'storefront_appearance_history', { token: T.lapis, data: { store_id: LAPIS, version: 99, template_id: 'lapis-de-cor', config: { version: 1 } } }); check(r.status >= 400, 'administrador NÃO fabrica versão no histórico', r.status);
    r = await rest('DELETE', `storefront_appearance?store_id=eq.${LAPIS}`, { token: T.lapis }); check(r.status >= 400, 'administrador NÃO apaga a aparência', r.status);

    section('REST · isolamento entre lojas');
    r = await rest('GET', 'storefront_appearance?select=*', { token: T.london }); check(r.status === 200 && r.json.length === 0, 'London não enxerga a aparência da Lápis de Cor', JSON.stringify(r.json).slice(0, 60));
    r = await rest('GET', 'storefront_appearance_history?select=*', { token: T.london }); check(r.status === 200 && r.json.length === 0, 'London não enxerga o histórico da Lápis de Cor');
    r = await rest('POST', 'storefront_appearance', { token: T.london, data: { store_id: LAPIS, draft_template_id: 'london', draft: { version: 1 } } }); check(r.status >= 400, 'London NÃO grava na Lápis de Cor', r.status);
    r = await rest('PATCH', `storefront_appearance?store_id=eq.${LAPIS}&select=*`, { token: T.london, prefer: 'return=representation', data: { draft: { version: 1, texts: { storeName: 'INVASÃO' } } } }); check(r.status === 200 && r.json.length === 0, 'London NÃO altera o rascunho da Lápis de Cor (0 linhas)', JSON.stringify(r.json).slice(0, 60));
    r = await rest('POST', 'rpc/publish_appearance', { token: T.london, data: { p_store: LAPIS } }); check(r.status >= 400, 'London NÃO publica na Lápis de Cor', r.status);
    r = await rest('POST', 'rpc/restore_appearance', { token: T.london, data: { p_store: LAPIS, p_version: 1 } }); check(r.status >= 400, 'London NÃO restaura versão da Lápis de Cor', r.status);
    r = await rest('POST', 'storefront_appearance?select=*', { token: T.london, prefer: 'return=representation', data: { store_id: LONDON, draft_template_id: 'london', draft: { version: 1, colors: { primary: '#07558a' } } } }); check(r.status === 201, 'London cria a própria aparência', r.status);
    r = await rest('POST', 'rpc/publish_appearance', { token: T.london, data: { p_store: LONDON } }); check(r.status === 200 && r.json === 1, 'London publica o próprio modelo (versão 1)', r.status);
    r = await rest('GET', 'storefront_appearance?select=*', { token: T.lapis }); check(r.json.length === 1 && r.json[0].store_id === LAPIS, 'Lápis de Cor continua vendo só a própria linha');
    r = await rest('GET', 'storefront_appearance?select=*', { token: T.outsider }); check(r.status === 200 && r.json.length === 0, 'usuário logado sem vínculo não vê nada');
    r = await rest('POST', 'storefront_appearance', { token: T.outsider, data: { store_id: LAPIS, draft_template_id: 'lapis-de-cor', draft: { version: 1 } } }); check(r.status >= 400, 'usuário sem vínculo NÃO grava', r.status);
    r = await rest('POST', 'rpc/publish_appearance', { token: T.outsider, data: { p_store: LAPIS } }); check(r.status >= 400, 'usuário sem vínculo NÃO publica', r.status);

    section('REST · catálogo existente (regressão)');
    r = await rest('GET', 'catalog_products?select=store_id,id', { token: T.lapis }); check(r.status === 200 && r.json.length === 1 && r.json[0].store_id === LAPIS, 'lojista vê só os produtos da própria loja');
    r = await rest('PATCH', `catalog_products?store_id=eq.${LONDON}&select=id`, { token: T.lapis, prefer: 'return=representation', data: { tag: 'x' } }); check(r.status >= 400 || (r.status === 200 && r.json.length === 0), 'lojista NÃO altera produto de outra loja', r.status);
    r = await rest('POST', 'catalog_products', { token: T.lapis, data: { store_id: LONDON, id: 'invasao', name: 'x', detail: 'x', category: 'Escrita', price_cents: 1 } }); check(r.status >= 400, 'lojista NÃO cria produto em outra loja', r.status);
    r = await rest('GET', 'rpc/authorized_store_ids', { token: T.lapis }); check(r.status === 200 && r.json.length === 1 && r.json[0] === LAPIS, 'authorized_store_ids devolve só a loja do usuário', JSON.stringify(r.json));
    r = await rest('POST', 'rpc/authorized_store_ids', { data: {} }); check(denied(r) || r.status >= 400, 'visitante NÃO chama authorized_store_ids', r.status);
  } else {
    console.log('\n[REST] PULADO (SKIP_REST=1): PostgREST não disponível neste ambiente.');
  }

  section('Storage · logotipo e banner');
  const logo = `${LAPIS}/branding/${uid()}.png`, banner = `${LAPIS}/branding/${uid()}.png`;
  check((await upload(T.lapis, logo, PNG, 'image/png')).ok, 'lojista envia o logotipo para <store_id>/branding/');
  check((await upload(T.lapis, banner, PNG, 'image/png')).ok, 'lojista envia o banner');
  check((await upload(T.lapis, `${LONDON}/branding/${uid()}.png`, PNG, 'image/png')).status >= 400, 'lojista NÃO envia para a pasta de outra loja');
  check((await upload(T.london, `${LAPIS}/branding/${uid()}.png`, PNG, 'image/png')).status >= 400, 'London NÃO envia para a pasta da Lápis de Cor');
  check((await upload(T.outsider, `${LAPIS}/branding/${uid()}.png`, PNG, 'image/png')).status >= 400, 'usuário sem vínculo NÃO envia');
  check((await upload(ANON, `${LAPIS}/branding/${uid()}.png`, PNG, 'image/png')).status >= 400, 'visitante NÃO envia');
  check((await upload(T.lapis, `${LAPIS}/branding/${uid()}.png`, Buffer.concat([PNG, Buffer.alloc(1_200_000)]), 'image/png')).status >= 400, 'arquivo acima de 1 MB é recusado');
  check((await upload(T.lapis, `${LAPIS}/branding/${uid()}.gif`, Buffer.from('GIF89a'), 'image/gif')).status >= 400, 'GIF é recusado');
  check((await upload(T.lapis, `${LAPIS}/branding/${uid()}.svg`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).status >= 400, 'SVG é recusado');
  const pub = await fetch(`${STORAGE}/object/public/catalog-images/${logo}`);
  check(pub.ok && pub.headers.get('content-type') === 'image/png', 'logotipo é legível sem login (bucket público)');
  if (URL_) { const cors = await fetch(`${STORAGE}/object/public/catalog-images/${logo}`, { headers: { Origin: 'https://papeliza-ai-painel.netlify.app' } }); check(cors.headers.get('access-control-allow-origin') !== null, 'imagem pública responde com CORS para o domínio do painel'); }
  const delOther = await fetch(`${STORAGE}/object/catalog-images/${banner}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: 'Bearer ' + T.outsider } });
  check((await fetch(`${STORAGE}/object/public/catalog-images/${banner}`)).ok, 'usuário sem vínculo NÃO apaga a imagem (status ' + delOther.status + ')');
  // limpeza das imagens de teste
  for (const p of [logo, banner]) await fetch(`${STORAGE}/object/catalog-images/${p}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: 'Bearer ' + T.lapis } });
  check(!(await fetch(`${STORAGE}/object/public/catalog-images/${logo}`)).ok, 'lojista remove a própria imagem');

  console.log(`\nResultado: ${passed} ok, ${failures} falha(s)`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
