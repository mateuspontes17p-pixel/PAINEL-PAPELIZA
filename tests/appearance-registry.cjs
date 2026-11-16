const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const R = await import('../public/template-registry.js');
  const STORE = '22222222-2222-4222-8222-222222222222', OTHER = '11111111-1111-4111-8111-111111111111';
  const IMG = id => id + '/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
  const ok = (v) => R.validateAppearance(v, { storeId: STORE });
  const bad = (v, field) => assert.throws(() => ok(v), e => !field || e.field === field);

  // --- válidos e normalização
  assert.deepEqual(ok({}), { version: 1 });
  assert.deepEqual(ok({ colors: { primary: '#ABCDEF', accent: '' } }), { version: 1, colors: { primary: '#abcdef' } });
  assert.deepEqual(ok({ texts: { heroTitle: '  Linha 1 \r\n Linha 2  ', storeName: '   ' } }), { version: 1, texts: { heroTitle: 'Linha 1\nLinha 2' } });
  assert.equal(ok({ contact: { whatsapp: '(43) 99665-4884' } }).contact.whatsapp, '5543996654884');
  assert.equal(ok({ contact: { whatsapp: '+55 43 99665-4884' } }).contact.whatsapp, '5543996654884');
  assert.equal(ok({ contact: { instagram: 'https://www.instagram.com/london.papelaria/' } }).contact.instagram, 'https://www.instagram.com/london.papelaria/');
  assert.deepEqual(ok({ images: { logoPath: IMG(STORE) } }).images, { logoPath: IMG(STORE) });

  // --- inválidos: o contrato é estrito
  bad(null); bad([]); bad('x'); bad({ extra: 1 }, 'config'); bad({ version: 2 }, 'version');
  bad({ colors: { primary: 'red' } }, 'colors.primary'); bad({ colors: { primary: '#fff' } }, 'colors.primary'); bad({ colors: { primary: 'url(x)' } }, 'colors.primary');
  bad({ colors: { background: '#ffffff' } }, 'colors');
  bad({ texts: { heroTitle: '<script>alert(1)</script>' } }, 'texts.heroTitle'); bad({ texts: { storeName: 'a>b' } }, 'texts.storeName');
  bad({ texts: { storeName: 'a\nb' } }, 'texts.storeName'); bad({ texts: { heroTitle: 'a\nb\nc' } }, 'texts.heroTitle');
  bad({ texts: { heroSubtitle: 'x'.repeat(201) } }, 'texts.heroSubtitle'); bad({ texts: { storeName: 'a\u0007b' } }, 'texts.storeName');
  bad({ texts: { css: 'body{}' } }, 'texts'); bad({ texts: { storeName: 5 } }, 'texts.storeName');
  bad({ contact: { whatsapp: '123' } }, 'contact.whatsapp'); bad({ contact: { whatsapp: 'abc' } }, 'contact.whatsapp');
  bad({ contact: { instagram: 'https://evil.example/london' } }, 'contact.instagram'); bad({ contact: { instagram: 'http://instagram.com/x' } }, 'contact.instagram');
  bad({ contact: { instagram: 'https://instagram.com.evil.example/x' } }, 'contact.instagram'); bad({ contact: { instagram: 'javascript:alert(1)' } }, 'contact.instagram');
  bad({ images: { logoPath: IMG(OTHER) } }, 'images.logoPath');           // imagem de outra loja
  bad({ images: { logoPath: STORE + '/../' + OTHER + '/x.png' } }, 'images.logoPath');
  bad({ images: { logoPath: STORE + '/branding/not-a-uuid.png' } }, 'images.logoPath');
  bad({ images: { logoPath: IMG(STORE).replace('.png', '.svg') } }, 'images.logoPath'); // SVG não é aceito
  bad({ images: { logoPath: 'https://evil.example/x.png' } }, 'images.logoPath');
  assert.throws(() => R.validateAppearance({ images: { logoPath: IMG(STORE) } }), e => e.field === 'images.logoPath'); // sem storeId

  // --- WhatsApp
  assert.equal(R.normalizeWhatsApp(''), ''); assert.equal(R.normalizeWhatsApp('4399665 4884'), '5543996654884'); assert.equal(R.normalizeWhatsApp('554399665488'), '554399665488');

  assert.equal(R.formatWhatsApp('5543996654884'), '(43) 99665-4884'); assert.equal(R.formatWhatsApp('554333334444'), '(43) 3333-4444');
  assert.equal(R.formatWhatsApp('15551234567'), '+15551234567'); assert.equal(R.formatWhatsApp(undefined), '');
  assert.equal(R.normalizeWhatsApp(R.formatWhatsApp('5543996654884')), '5543996654884'); // ida e volta

  // --- modelos e publicação
  assert.deepEqual(R.TEMPLATES.map(t => t.id), ['london', 'lapis-de-cor']);
  assert.ok(R.canPublishTemplate('london-papelaria', 'london')); assert.ok(R.canPublishTemplate('lapis-de-cor', 'lapis-de-cor'));
  assert.ok(!R.canPublishTemplate('london-papelaria', 'lapis-de-cor')); assert.ok(!R.canPublishTemplate('lapis-de-cor', 'london'));
  assert.ok(!R.canPublishTemplate('qualquer-loja', 'london')); assert.ok(!R.canPublishTemplate('london-papelaria', 'inexistente'));
  assert.equal(R.findTemplate('__proto__'), null);

  // --- cores
  assert.deepEqual(R.cssVariables('london', {}), {});                         // sem personalização: nada é aplicado
  const vars = R.cssVariables('lapis-de-cor', { primary: '#112233', accent: '#aa5500' });
  assert.equal(vars['--green'], '#112233'); assert.equal(vars['--red'], '#aa5500'); assert.equal(vars['--red-light'], '#aa5500'); assert.match(vars['--green-soft'], /^#[0-9a-f]{6}$/);
  assert.deepEqual(R.cssVariables('inexistente', { primary: '#112233' }), {});
  assert.equal(R.tint('#000000', 1), '#ffffff'); assert.equal(R.shade('#ffffff', 1), '#000000');
  assert.ok(Math.abs(R.contrastRatio('#000000', '#ffffff') - 21) < 0.01); assert.ok(R.contrastRatio('#ffff00', '#ffffff') < 2);

  // --- guarda de regressão: padrões do registro = visual real das vitrines (sem personalização nada muda)
  const css = {
    london: fs.readFileSync('public/london/styles.css', 'utf8'), 'lapis-de-cor': fs.readFileSync('public/vitrine/styles.css', 'utf8')
  };
  // O app.js das vitrines aplica window.VITRINE.colors em runtime: esse é o padrão efetivo, não o :root do CSS.
  const runtime = {
    london: fs.readFileSync('public/london/catalog-online.js', 'utf8').match(/colors:\{primary:'(#[0-9a-f]{6})',accent:'(#[0-9a-f]{6})'\}/i),
    'lapis-de-cor': fs.readFileSync('public/vitrine/catalogo.js', 'utf8').match(/"primary":\s*"(#[0-9a-f]{6})",\s*"accent":\s*"(#[0-9a-f]{6})"/i)
  };
  for (const t of R.TEMPLATES) {
    assert.ok(runtime[t.id], t.id + ': configuração de cores não encontrada');
    assert.equal(runtime[t.id][1].toLowerCase(), t.defaults.colors.primary, t.id + ': cor principal padrão difere da vitrine');
    assert.equal(runtime[t.id][2].toLowerCase(), t.defaults.colors.accent, t.id + ': cor de destaque padrão difere da vitrine');
  }
  // cores da marca não podem voltar a ser literais fora de declarações de variável e fallbacks (o editor não as recolore)
  const strip = text => text.replace(/var\(--[a-z-]+,#[0-9a-f]{6}\)/gi, '').replace(/--[a-z-]+:#[0-9a-f]{6}/gi, '');
  const lapisLiteral = strip(css['lapis-de-cor']);
  for (const hex of ['#69509c', '#b85545', '#c95b49', '#964333', '#503b7b', '#a84e40', '#eee7f6']) assert.ok(!lapisLiteral.toLowerCase().includes(hex), 'Lápis de Cor: ' + hex + ' literal no CSS');
  assert.ok(!/color:#07558a/i.test(css.london) && !/background:#06436d/i.test(css.london), 'London: azul literal no CSS');
  // app.js reaplica estas chaves: a personalização precisa ir também para window.VITRINE
  const apply = fs.readFileSync('public/appearance-apply.js', 'utf8');
  for (const key of ["'colors'", "'instagram'", "'whatsapp'", "'name'"]) assert.ok(apply.includes('setVitrine(' + key), 'appearance-apply não sincroniza VITRINE.' + key.replace(/'/g, ''));

  // --- ganchos HTML que o editor usa
  const html = { london: fs.readFileSync('public/london/index.html', 'utf8'), 'lapis-de-cor': fs.readFileSync('public/vitrine/index.html', 'utf8') };
  const count = (text, needle) => text.split(needle).length - 1;
  for (const id of ['london', 'lapis-de-cor']) {
    for (const hook of ['data-ap="logo"', 'data-ap="banner"', 'data-ap="heroEyebrow"', 'data-ap="heroSubtitle"', 'data-ap-hero=', 'data-ap-href="instagram"']) assert.ok(count(html[id], hook) >= 1, id + ' sem ' + hook);
  }
  assert.equal(count(html.london, 'data-ap="logo"'), 3); assert.equal(count(html['lapis-de-cor'], 'data-ap-href="whatsapp"'), 3);
  assert.equal(count(html.london, 'data-ap-whatsapp-display'), 2); assert.equal(count(html['lapis-de-cor'], 'data-ap-textnode="storeName"'), 2);
  // --- textos institucionais: ganchos, padrões iguais ao HTML e validação
  const fieldHook = { aboutText: 'data-ap="aboutText"', address: 'data-ap-lines="address"', hours: 'data-ap-lines="hours"', footerTagline: 'data-ap="footerTagline"' };
  for (const t of R.TEMPLATES) {
    for (const key of ['aboutText', 'address', 'hours', 'footerTagline']) {
      assert.equal(t.fields.includes(key), count(html[t.id], fieldHook[key]) === 1, t.id + ': campo ' + key + ' e gancho HTML divergem');
      if (t.fields.includes(key)) {
        const m = html[t.id].match(new RegExp(fieldHook[key].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^>]*>([^]*?)</(p|address)>'));
        const text = m[1].replace(/<br>/g, '\n').replace(/&amp;/g, '&');
        assert.equal(text, t.defaults.texts[key], t.id + ': padrão de ' + key + ' difere do HTML');
      }
    }
    assert.equal(count(html[t.id], 'data-ap-href="map"'), 1, t.id + ' sem link do mapa');
    assert.ok(R.validateAppearance({ contact: { mapUrl: t.defaults.contact.mapUrl } }).contact.mapUrl, t.id + ': mapa padrão deve ser válido');
  }
  const val = v => R.validateAppearance(v, {});
  assert.deepEqual(val({ texts: { address: 'Rua A, 10\nCentro' } }).texts.address, 'Rua A, 10\nCentro');
  assert.throws(() => val({ texts: { address: 'a\nb\nc' } }), /duas linhas/);
  assert.throws(() => val({ texts: { aboutText: 'x'.repeat(301) } }), /300/);
  assert.throws(() => val({ texts: { aboutText: 'a\nb' } }), /única linha/);
  assert.throws(() => val({ texts: { footerTagline: '<b>x</b>' } }));
  for (const bad of ['http://maps.app.goo.gl/abcd', 'https://evil.example/maps', 'javascript:alert(1)', 'https://www.google.com.evil.example/maps', 'https://maps.app.goo.gl.evil.example/abcd'])
    assert.throws(() => val({ contact: { mapUrl: bad } }), /Google Maps/, bad);
  assert.equal(val({ contact: { mapUrl: 'https://maps.app.goo.gl/AbC123xy' } }).contact.mapUrl, 'https://maps.app.goo.gl/AbC123xy');
  // --- modo loja: contrato, gate, ganchos e guardas
  assert.deepEqual(val({ options: { storeMode: true } }).options, { storeMode: true });
  assert.equal(val({ options: { storeMode: false } }).options, undefined);
  assert.throws(() => val({ options: { storeMode: 'sim' } })); assert.throws(() => val({ options: { x: true } })); assert.throws(() => val({ options: [] }));
  const sm = { options: { storeMode: true }, contact: { whatsapp: '5543999999999' } };
  assert.ok(R.canPublishTemplate('loja-nova', 'london', sm) && R.canPublishTemplate('loja-nova', 'lapis-de-cor', sm));
  assert.ok(!R.canPublishTemplate('loja-nova', 'london', { options: { storeMode: true } }), 'modo loja sem WhatsApp não publica');
  assert.ok(!R.canPublishTemplate('loja-nova', 'london', { options: { storeMode: false } }) && !R.canPublishTemplate('loja-nova', 'london', {}) && !R.canPublishTemplate('loja-nova', 'london'));
  assert.ok(!R.canPublishTemplate('loja-nova', 'inexistente', sm));
  for (const t of R.TEMPLATES) {
    assert.equal(t.generic, true);
    for (const hook of ['data-ap="aboutEyebrow"', 'data-ap="aboutTitle"']) assert.equal(count(html[t.id], hook), 1, t.id + ' sem ' + hook);
    for (const key of ['aboutEyebrow', 'aboutTitle']) {
      const m = html[t.id].match(new RegExp('data-ap="' + key + '"[^>]*>([^]*?)</(p|h2)>'));
      assert.equal(m[1].replace(/<br>/g, ' ').replace(/<[^>]+>/g, ''), t.defaults.texts[key], t.id + ': padrão de ' + key + ' difere do HTML');
    }
    assert.ok(count(html[t.id], 'data-demo') >= 5, t.id + ': avisos de demonstração sem data-demo');
    assert.ok(/id="activation-dialog"[^>]*data-demo/.test(html[t.id]) && /id="campanha"[^>]*data-demo/.test(html[t.id]), t.id + ': convite/prazo sem data-demo');
  }
  for (const f of ['public/london/campanha.js', 'public/vitrine/campanha.js']) assert.ok(/function show\(\)\{if\(document\.documentElement\.hasAttribute\('data-store-mode'\)\)return;/.test(fs.readFileSync(f, 'utf8')), f + ': convite de ativação não respeita o modo loja');
  console.log('PASS: contrato estrito (cores, textos, contato, imagens por loja), WhatsApp, gate de modelo, cores derivadas, padrões = vitrine em runtime, ganchos HTML.');
})().catch(e => { console.error(e); process.exitCode = 1; });
