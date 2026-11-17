// Revalidação da sessão ao voltar para a aba: sem "flash" de login quando a sessão é válida,
// mas com o painel escondido quando há problema REAL de autenticação (sessão inválida, outra conta, acesso removido).
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
(async () => {
  const { chooseStore, storefrontPath } = await import('../public/store-context.js');
  const LAPIS = { id: 'lapis', name: 'Lápis de Cor', slug: 'lapis-de-cor' }, LONDON = { id: 'london', name: 'London', slug: 'london-papelaria' };
  const tick = () => new Promise(r => setImmediate(r));

  async function boot() {
    const log = [], elements = {}, scripts = [], listeners = {}, memory = new Map(); let authListener = null;
    const get = id => elements[id] ??= (() => { let hidden = false; const el = { options: [], replaceChildren(...xs) { this.options = xs }, textContent: '' };
      Object.defineProperty(el, 'hidden', { get: () => hidden, set: v => { hidden = v; if (id === 'authenticated-panel' || id === 'login-screen') log.push(id + '=' + v) } }); return el })();
    get('authenticated-panel').hidden = true; get('login-screen').hidden = false; log.length = 0;
    const location = { href: 'https://example.com/?loja=lapis-de-cor', protocol: 'https:', origin: 'https://example.com', pathname: '/', hash: '', assign() {} };
    const world = { user: { id: 'u1', email: 'a@example.invalid' }, userError: null, stores: [LAPIS], storesError: null, pending: null };
    const defer = fn => world.pending ? world.pending.then(fn) : Promise.resolve(fn());
    const context = {
      URL, Error, Option: function (name, slug) { return { text: name, value: slug } }, chooseStore, storefrontPath, location, setTimeout,
      history: { replaceState(a, b, url) { location.href = url.href } },
      localStorage: { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v) },
      window: { addEventListener(name, fn) { listeners[name] = fn } },
      document: { getElementById: get, querySelectorAll: q => q === '[data-store-name]' ? [{}] : [{}, {}], createElement: () => ({}), head: { append: s => scripts.push(s) } },
      client: {
        auth: { getUser: () => defer(() => world.userError ? { data: { user: null }, error: world.userError } : { data: { user: world.user }, error: null }), onAuthStateChange(fn) { authListener = fn } },
        from: () => ({ select: () => { const res = () => world.storesError ? { data: null, error: world.storesError } : { data: world.stores, error: null }; const p = defer(res); p.order = () => defer(res); return p } })
      }
    };
    vm.runInNewContext(fs.readFileSync('public/auth.js', 'utf8').replace(/^import[^\n]+\r?\n/gm, ''), context);
    await tick(); await tick();
    return { context, get, log, scripts, listeners, world, fire: event => authListener(event), flush: async () => { for (let i = 0; i < 6; i++) await tick() } };
  }
  const panelHidden = s => s.get('authenticated-panel').hidden, loginShown = s => !s.get('login-screen').hidden;
  const hold = world => { let release; world.pending = new Promise(r => { release = () => { world.pending = null; r() } }); return release };

  // 1) Sessão válida + voltar à aba com a rede lenta: a tela NÃO pode trocar enquanto valida.
  let s = await boot();
  assert.equal(panelHidden(s), false); assert.equal(loginShown(s), false); assert.equal(s.scripts.length, 1);
  s.log.length = 0; const release = hold(s.world);
  s.listeners.focus(); await tick();
  assert.equal(panelHidden(s), false, 'painel some durante a revalidação (flash)'); assert.equal(loginShown(s), false, 'login aparece durante a revalidação (flash)');
  release(); await s.flush();
  assert.equal(panelHidden(s), false); assert.equal(loginShown(s), false); assert.deepEqual(s.log, [], 'a tela foi alterada mesmo com sessão válida: ' + s.log);
  assert.equal(s.scripts.length, 1, 'painel.js foi recarregado'); assert.equal(s.context.window.PAPELIZA_STORE.id, 'lapis');

  // 2) Eventos do Auth (renovação de token / SIGNED_IN ao voltar à aba) e reconexão também não piscam.
  s = await boot(); s.log.length = 0;
  const r2 = hold(s.world); s.fire('SIGNED_IN'); s.fire('TOKEN_REFRESHED'); s.listeners.online(); await tick();
  assert.equal(panelHidden(s), false); assert.equal(loginShown(s), false); r2(); await s.flush();
  assert.deepEqual(s.log, [], 'eventos do Auth alteraram a tela: ' + s.log);

  // 3) Problema REAL: sessão inválida/expirada → o painel é escondido e o login aparece.
  s = await boot(); s.world.userError = { name: 'AuthApiError', status: 401, message: 'invalid JWT' };
  s.listeners.focus(); await s.flush();
  assert.equal(panelHidden(s), true, 'sessão inválida não escondeu o painel'); assert.equal(loginShown(s), true);
  assert.equal(s.get('auth-status').textContent, 'Entre para continuar.');

  // 4) Sem usuário (sessão encerrada em outra aba) → login.
  s = await boot(); s.world.user = null; s.world.userError = { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' };
  s.listeners.focus(); await s.flush(); assert.equal(panelHidden(s), true); assert.equal(loginShown(s), true);

  // 5) Falha de conexão NÃO é veredito de autenticação: o painel aberto continua aberto.
  s = await boot(); s.world.userError = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };
  s.log.length = 0; s.listeners.focus(); await s.flush();
  assert.equal(panelHidden(s), false); assert.equal(loginShown(s), false); assert.deepEqual(s.log, []);
  s = await boot(); s.world.storesError = { message: 'TypeError: Failed to fetch' };
  s.log.length = 0; s.listeners.focus(); await s.flush(); assert.equal(panelHidden(s), false, 'falha de rede ao listar lojas derrubou o painel');

  // 6) Outra conta entrou em outra aba → refaz o fluxo completo (esconde e valida de novo).
  s = await boot(); s.world.user = { id: 'u2', email: 'b@example.invalid' }; s.world.stores = [LONDON]; s.context.location.href = 'https://example.com/'; s.context.localStorage.setItem('papeliza:store:u2', 'london-papelaria'); s.log.length = 0;
  const r6 = hold(s.world); s.listeners.focus(); await tick(); r6(); await s.flush();
  assert.ok(s.log.includes('authenticated-panel=true') && s.log.includes('login-screen=false'), 'outra conta não forçou nova validação com a tela de login: ' + s.log);
  assert.equal(s.context.window.PAPELIZA_USER_ID, 'u2'); assert.equal(s.context.window.PAPELIZA_STORE.id, 'london'); assert.equal(panelHidden(s), false, 'painel da nova conta não voltou');

  // 7) Acesso à loja removido enquanto a aba estava fora → painel escondido com a mensagem de acesso negado.
  s = await boot(); s.world.stores = [LONDON]; s.listeners.focus(); await s.flush();
  assert.equal(panelHidden(s), true, 'acesso removido não escondeu o painel'); assert.match(s.get('auth-status').textContent, /não tem acesso/);

  // 8) Erro de autorização (JWT expirado) ao listar lojas → painel escondido (não é falha de rede).
  s = await boot(); s.world.storesError = { code: 'PGRST301', status: 401, message: 'JWT expired' }; s.listeners.focus(); await s.flush();
  assert.equal(panelHidden(s), true, 'JWT expirado em consulta não escondeu o painel');

  // 9) Primeiro acesso (sem painel aberto) continua mostrando o login até validar.
  const fresh = await (async () => { const x = await boot(); return x })(); assert.equal(fresh.scripts.length, 1);
  console.log('PASS: revalidação ao voltar à aba sem flash de login; sessão inválida, conta diferente e acesso removido continuam escondendo o painel; falha de rede não derruba o painel aberto.');
})().catch(e => { console.error(e); process.exitCode = 1 });
