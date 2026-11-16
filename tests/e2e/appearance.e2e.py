#!/usr/bin/env python3
"""Teste ponta a ponta do editor de aparência em um Chrome real, com Supabase SIMULADO no navegador.

Nada aqui acessa o Supabase nem os sites publicados: o módulo @supabase/supabase-js e as chamadas REST
públicas são interceptados e respondidos por um backend em memória que replica as regras principais
(gate de modelo, conflito por updated_at, validação). As regras reais estão em database/*.sql e são
testadas em tests/pg/run.sh.

Requisitos: python3 + playwright + google-chrome. Uso: python3 tests/e2e/appearance.e2e.py [pasta-de-capturas]
"""
import json, os, subprocess, sys, time, re
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8765
BASE = f'http://localhost:{PORT}'
SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp/papeliza-shots'
os.makedirs(SHOTS, exist_ok=True)
LONDON = '22222222-2222-4222-8222-222222222222'
LAPIS = '11111111-1111-4111-8111-111111111111'
STORES = [{'id': LAPIS, 'name': 'Lápis de Cor', 'slug': 'lapis-de-cor'},
          {'id': LONDON, 'name': 'London Papelaria & Presentes Criativos', 'slug': 'london-papelaria'}]
PRODUCTS = [{'id': f'p{i}', 'name': n, 'detail': 'Detalhe', 'category': c, 'price_cents': 1990 + i * 100, 'image_path': None,
             'image_index': i, 'tag': '', 'available': True}
            for i, (n, c) in enumerate([('Caderno Rosé', 'Cadernos'), ('Canetas Pastel', 'Escrita'), ('Planner', 'Cadernos'),
                                         ('Estojo', 'Acessórios'), ('Blocos', 'Acessórios'), ('Kit Presente', 'Presentes')])]

FAKE_SUPABASE = r"""
const KEY='fakeDb';
const load=()=>JSON.parse(localStorage.getItem(KEY)||'{"mode":"ok","rows":{},"history":[],"tick":0}');
const save=db=>localStorage.setItem(KEY,JSON.stringify(db));
const STORES=%STORES%;
const native={'london-papelaria':['london'],'lapis-de-cor':['lapis-de-cor']};
const stamp=db=>new Date(Date.UTC(2026,10,16,12,0,0)+(++db.tick)*1000).toISOString();
const unavailable={error:{code:'PGRST205',status:404,message:'missing'}};
const bad=(c,m)=>({error:{code:c,message:m}});
const textsBad=cfg=>JSON.stringify(cfg||{}).includes('<');
class Q{constructor(t){this.t=t;this.f=[];this.op='select'}
 select(){return this}eq(k,v){this.f.push([k,v]);return this}order(){return this}limit(){return this}
 maybeSingle(){this.single=true;return this}insert(r){this.op='insert';this.row=r;return this}update(r){this.op='update';this.row=r;return this}
 then(a,b){return Promise.resolve(this.run()).then(a,b)}
 run(){const db=load(),f=Object.fromEntries(this.f);
  if(this.t==='stores')return{data:STORES};
  if(this.t==='catalog_categories')return{data:[{name:'Cadernos'},{name:'Escrita'}]};
  if(this.t==='catalog_products')return{data:[]};
  if(db.mode==='unavailable')return unavailable;
  if(this.t==='storefront_appearance_history')return{data:db.history.filter(h=>h.store_id===f.store_id).sort((a,b)=>b.version-a.version)};
  if(this.t!=='storefront_appearance')return{data:[]};
  const row=db.rows[f.store_id];
  if(this.op==='select')return{data:this.single?(row||null):(row?[row]:[])};
  if(this.op==='insert'){const r=this.row;if(textsBad(r.draft)){return bad('23514','check')}
   const n={store_id:r.store_id,draft_template_id:r.draft_template_id,draft:r.draft,published_template_id:null,published:{version:1},published_version:0,published_at:null,updated_at:stamp(db)};db.rows[r.store_id]=n;save(db);return{data:[n]}}
  if(this.op==='update'){if(!row||(f.updated_at&&row.updated_at!==f.updated_at))return{data:[]};if(textsBad(this.row.draft))return bad('23514','check');
   Object.assign(row,this.row,{updated_at:stamp(db)});save(db);return{data:[row]}}
  return{data:[]}}}
export const createClient=()=>({
 auth:{getUser:async()=>({data:{user:{id:'u1',email:'admin@example.invalid'}},error:null}),onAuthStateChange(){},signOut:async()=>({error:null}),signInWithPassword:async()=>({error:null})},
 from:t=>new Q(t),
 rpc:async(name,args)=>{const db=load(),row=db.rows[args.p_store],store=STORES.find(s=>s.id===args.p_store);
  if(db.mode==='unavailable')return unavailable;
  if(name==='publish_appearance'){if(!row)return bad('42501','sem rascunho');
   if(!(native[store.slug]||[]).includes(row.draft_template_id))return bad('42501','Este modelo ainda não pode ser publicado para esta loja.');
   row.published=JSON.parse(JSON.stringify(row.draft));row.published_template_id=row.draft_template_id;row.published_version+=1;row.published_at=stamp(db);row.updated_at=stamp(db);
   db.history.push({store_id:row.store_id,version:row.published_version,template_id:row.published_template_id,config:row.published,created_at:row.published_at});save(db);return{data:row.published_version}}
  if(name==='restore_appearance'){const h=db.history.find(x=>x.store_id===args.p_store&&x.version===args.p_version);if(!row||!h)return bad('P0002','Versão não encontrada');
   row.draft=JSON.parse(JSON.stringify(h.config));row.draft_template_id=h.template_id;row.updated_at=stamp(db);save(db);return{data:row.updated_at}}
  return bad('404','?')},
 storage:{from:()=>({upload:async path=>({data:{path},error:null})})}
});
""".replace('%STORES%', json.dumps(STORES))

results = []
def check(name, condition, detail=''):
    results.append((name, bool(condition)))
    print(('  ok   ' if condition else '  FAIL ') + name + ((' — ' + str(detail)) if detail and not condition else ''))

def start_server():
    proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', os.path.join(ROOT, 'public')],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            import urllib.request; urllib.request.urlopen(BASE + '/index.html', timeout=1); return proc
        except Exception: time.sleep(0.1)
    raise RuntimeError('servidor local não subiu')

def install_routes(context, appearance):
    """appearance: dict mutável { 'mode': 'missing'|'none'|'row', 'row': {...} } para a leitura pública da vitrine."""
    def fake_module(route):
        route.fulfill(status=200, content_type='application/javascript', body=FAKE_SUPABASE)
    def rest(route):
        url = route.request.url
        def js(body, status=200): route.fulfill(status=status, content_type='application/json', body=json.dumps(body))
        if '/rest/v1/stores' in url:
            slug = re.search(r'slug=eq\.([^&]+)', url).group(1)
            return js([{'id': s['id'], 'name': s['name']} for s in STORES if s['slug'] == slug])
        if '/rest/v1/catalog_products' in url: return js(PRODUCTS)
        if '/rest/v1/catalog_categories' in url: return js([{'name': n} for n in ['Cadernos', 'Escrita', 'Acessórios', 'Presentes']])
        if '/rest/v1/storefront_appearance' in url:
            if appearance['mode'] == 'missing': return js({'code': 'PGRST205', 'message': 'missing'}, 404)
            if appearance['mode'] == 'none': return js([])
            return js([appearance['row']])
        return js([])
    context.route('https://esm.sh/@supabase/supabase-js@2.49.8', fake_module)
    context.route('**/rest/v1/**', rest)
    context.route(re.compile(r'https://(fonts\.googleapis\.com|fonts\.gstatic\.com)/.*'), lambda r: r.abort())

def root_var(page, name):
    return page.evaluate("n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()", name)

def open_store(browser, appearance, path, mobile=False, **kw):
    context = browser.new_context(viewport={'width': 390, 'height': 800} if mobile else {'width': 1360, 'height': 900}, locale='pt-BR', **kw)
    install_routes(context, appearance)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + path)
    page.wait_for_selector('.product-card', timeout=8000)
    return context, page, errors

def main():
    server = start_server()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
            appearance = {'mode': 'missing'}

            print('\n[1] Vitrines sem aparência (tabela inexistente: migração ainda não aplicada)')
            ctx, page, errors = open_store(browser, appearance, '/london/index.html')
            check('London carrega produtos com tabela inexistente', page.locator('.product-card').count() == 6)
            check('London mantém cor original', root_var(page, '--green') == '#07558a' and page.evaluate("document.documentElement.dataset.appearance") is None)
            check('London mantém título original', page.inner_text('#school-kit-title').replace('\n', ' ') == 'Novas ideias. Novas descobertas.')
            check('London sem erros de JS', not errors, errors)
            page.screenshot(path=f'{SHOTS}/london-padrao-desktop.png'); ctx.close()
            ctx, page, errors = open_store(browser, appearance, '/vitrine/index.html')
            check('Lápis de Cor carrega com tabela inexistente', page.locator('.product-card').count() == 6)
            check('Lápis título original', page.inner_text('#studio-title').replace('\n', ' ') == 'Material escolar e papelaria.')
            page.wait_for_timeout(400)  # o botão tem transição de cor de 150ms
            check('Lápis: cores originais (roxo #69509c e terracota #c95b49)', root_var(page, '--green') == '#69509c' and root_var(page, '--red') == '#c95b49')
            check('Lápis: botão principal original usa o destaque (#c95b49)', page.evaluate("getComputedStyle(document.querySelector('.btn.primary')).backgroundColor") == 'rgb(201, 91, 73)')
            check('Lápis sem erros de JS', not errors, errors)
            page.screenshot(path=f'{SHOTS}/lapis-padrao-desktop.png'); ctx.close()

            print('\n[2] Vitrines com aparência publicada')
            cfg_london = {'version': 1, 'colors': {'primary': '#0b6b3a', 'accent': '#d4620a'},
                          'texts': {'storeName': 'Nova Papelaria', 'heroEyebrow': 'NOVA PAPELARIA', 'heroTitle': 'Volta às aulas', 'heroHighlight': 'com cor e estilo', 'heroSubtitle': 'Kit completo'},
                          'contact': {'whatsapp': '5543999990000', 'instagram': 'https://www.instagram.com/nova.papelaria/'},
                          'images': {'logoPath': f'{LONDON}/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'}}
            appearance.update(mode='row', row={'published_template_id': 'london', 'published': cfg_london})
            ctx, page, errors = open_store(browser, appearance, '/london/index.html')
            page.wait_for_function("document.documentElement.dataset.appearance==='custom'", timeout=5000)
            check('London: cor principal aplicada', root_var(page, '--green') == '#0b6b3a')
            check('London: destaque aplicado', root_var(page, '--red') == '#d4620a')
            page.wait_for_timeout(400)
            check('London: botão usa a nova cor', page.evaluate("getComputedStyle(document.querySelector('.btn.primary')).backgroundColor") == 'rgb(11, 107, 58)')
            check('London: título em duas linhas com destaque', page.inner_text('#school-kit-title').replace('\n', ' ') == 'Volta às aulas com cor e estilo' and page.locator('#school-kit-title em').inner_text() == 'com cor e estilo')
            check('London: chamada e subtítulo', page.inner_text('[data-ap=heroEyebrow]') == 'NOVA PAPELARIA' and page.inner_text('[data-ap=heroSubtitle]') == 'Kit completo')
            check('London: instagram nos 2 links', page.eval_on_selector_all('[data-ap-href=instagram]', 'els=>els.every(e=>e.href==="https://www.instagram.com/nova.papelaria/")'))
            check('London: WhatsApp no texto do pedido', page.eval_on_selector_all('[data-ap-whatsapp-display]', 'els=>els.length===2&&els.every(e=>e.textContent==="(43) 99999-0000")'))
            check('London: pedido usa o novo número', page.evaluate("VITRINE.whatsapp==='5543999990000'&&VITRINE.name==='Nova Papelaria'"))
            check('London: logo nas 3 posições', page.eval_on_selector_all('[data-ap=logo]', 'els=>els.length===3&&els.every(e=>e.src.includes("/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"))'))
            check('London: catálogo intacto (6 produtos)', page.locator('.product-card').count() == 6)
            check('London sem erros de JS', not errors, errors)
            page.screenshot(path=f'{SHOTS}/london-personalizada-desktop.png'); ctx.close()
            ctx, page, errors = open_store(browser, appearance, '/london/index.html', mobile=True)
            page.wait_for_function("document.documentElement.dataset.appearance==='custom'", timeout=5000)
            check('London mobile: sem rolagem horizontal', page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), page.evaluate("document.documentElement.scrollWidth"))
            page.screenshot(path=f'{SHOTS}/london-personalizada-mobile.png'); ctx.close()

            cfg_lapis = {'version': 1, 'colors': {'primary': '#1d5c8a', 'accent': '#c2410c'},
                         'texts': {'storeName': 'Papelaria Nova', 'heroTitle': 'Tudo para o\nano letivo', 'heroSubtitle': 'Cadernos e canetas para toda a turma.'},
                         'contact': {'whatsapp': '(43) 98888-7777'.replace('(', '').replace(')', '').replace(' ', '').replace('-', ''), 'instagram': 'https://www.instagram.com/papelaria.nova/'}}
            cfg_lapis['contact']['whatsapp'] = '5543988887777'
            appearance.update(row={'published_template_id': 'lapis-de-cor', 'published': cfg_lapis})
            ctx, page, errors = open_store(browser, appearance, '/vitrine/index.html')
            page.wait_for_function("document.documentElement.dataset.appearance==='custom'", timeout=5000)
            page.wait_for_timeout(400)
            check('Lápis: cor principal aplicada', root_var(page, '--green') == '#1d5c8a')
            check('Lápis: destaque recolore o botão principal (antes era literal)', root_var(page, '--red') == '#c2410c' and page.evaluate("getComputedStyle(document.querySelector('.btn.primary')).backgroundColor") == 'rgb(194, 65, 12)')
            check('Lápis: Instagram aplicado', page.eval_on_selector_all('[data-ap-href=instagram]', 'els=>els.length>=1&&els.every(e=>e.href==="https://www.instagram.com/papelaria.nova/")'))
            check('Lápis: título em 2 linhas', page.inner_text('#studio-title').replace('\n', ' ') == 'Tudo para o ano letivo' and page.locator('#studio-title br').count() == 1)
            check('Lápis: nome na marca e no rodapé, mantendo a legenda', page.inner_text('.studio-brand span').startswith('Papelaria Nova') and 'PAPELARIA EM LONDRINA' in page.inner_text('.studio-brand span') and page.inner_text('.footer-title') == 'Papelaria Nova')
            check('Lápis: WhatsApp nos 3 links', page.eval_on_selector_all('[data-ap-href=whatsapp]', 'els=>els.length===3&&els.every(e=>e.href==="https://wa.me/5543988887777")'))
            check('Lápis: sem erros de JS', not errors, errors)
            page.screenshot(path=f'{SHOTS}/lapis-personalizada-desktop.png'); ctx.close()
            ctx, page, errors = open_store(browser, appearance, '/vitrine/index.html', mobile=True)
            page.wait_for_function("document.documentElement.dataset.appearance==='custom'", timeout=5000)
            check('Lápis mobile: sem rolagem horizontal', page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), page.evaluate("document.documentElement.scrollWidth"))
            page.screenshot(path=f'{SHOTS}/lapis-personalizada-mobile.png'); ctx.close()

            print('\n[3] Segurança das vitrines')
            appearance.update(row={'published_template_id': 'london', 'published': {'version': 1, 'texts': {'heroTitle': '<img src=x onerror=alert(1)>'}, 'colors': {'primary': '#ff0000'}}})
            ctx, page, errors = open_store(browser, appearance, '/london/index.html')
            page.wait_for_timeout(400)
            check('Configuração inválida publicada é ignorada por inteiro', root_var(page, '--green') == '#07558a' and 'Novas ideias' in page.inner_text('#school-kit-title'))
            check('Catálogo segue funcionando com configuração inválida', page.locator('.product-card').count() == 6)
            ctx.close()
            appearance.update(row={'published_template_id': 'lapis-de-cor', 'published': {'version': 1, 'colors': {'primary': '#ff0000'}}})
            ctx, page, errors = open_store(browser, appearance, '/london/index.html')
            page.wait_for_timeout(400)
            check('Aparência de outro modelo não é aplicada', root_var(page, '--green') == '#07558a')
            ctx.close()
            print('\n[3b] Modo loja: sem avisos de demonstração e com fallbacks de logotipo/banner')
            for path, tid in (('/london/index.html', 'london'), ('/vitrine/index.html', 'lapis-de-cor')):
                appearance.update(mode='row', row={'published_template_id': tid, 'published': {'version': 1, 'options': {'storeMode': True}, 'contact': {'whatsapp': '5543911112222'}, 'texts': {'storeName': 'Papelaria Girassol', 'address': 'Rua das Flores, 100\nCambé, PR'}}})
                ctx, page, errors = open_store(browser, appearance, path)
                page.wait_for_function("document.documentElement.hasAttribute('data-store-mode')", timeout=4000)
                visible = lambda sel: page.evaluate("s=>[...document.querySelectorAll(s)].some(e=>e.getClientRects().length>0)", sel)
                check(f'{tid}: avisos e prazo de demonstração ocultos', not visible('[data-demo]'))
                check(f'{tid}: título da página usa o nome da loja', page.title() == 'Papelaria Girassol')
                # London não mostra o nome ao lado do logotipo: o fallback cria o texto. Lápis de Cor já mostra o nome ao lado.
                name_visible = visible('.ap-brand-fallback') if tid == 'london' else page.evaluate("[...document.querySelectorAll('.studio-brand span')].some(e=>e.getClientRects().length>0&&e.textContent.includes('Papelaria Girassol'))")
                check(f'{tid}: sem logotipo, logotipo do modelo oculto e nome da loja em texto', not visible('img[data-ap=logo]') and name_visible and page.evaluate("[...document.querySelectorAll('.ap-brand-fallback')].every(e=>e.textContent==='Papelaria Girassol')"))
                check(f'{tid}: sem banner, banner do modelo oculto e fundo com as cores da loja', not visible('img[data-ap=banner]') and page.evaluate("document.querySelector('.ap-banner-fallback')!==null"))
                check(f'{tid}: nenhuma imagem de outra loja (London/Lápis) aparece', not page.evaluate("[...document.images].some(i=>i.getClientRects().length>0 && /london-logo|kit-escolar|assets\\/logo\\.png/.test(i.src))"))
                check(f'{tid}: textos da loja de origem ocultos (Londrina/Igapó/London/Lápis)', not page.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.children.length===0&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden').some(e=>/London|Lápis|LÁPIS|LONDON|Igapó|Inglaterra|Higien/.test(e.textContent))"))
                check(f'{tid}: link do WhatsApp é o da loja e Instagram da origem some', page.evaluate("[...document.querySelectorAll('[data-ap-href=whatsapp]')].every(a=>a.href==='https://wa.me/5543911112222')") and not visible('[data-ap-href=instagram]'))
                check(f'{tid}: endereço da loja aparece em duas linhas', page.evaluate("document.querySelector('[data-ap-lines=address]').innerHTML")=='Rua das Flores, 100<br>Cambé, PR')
                check(f'{tid}: modo loja sem erros de JS', not errors, errors)
                page.screenshot(path=f'{SHOTS}/{tid}-modo-loja-desktop.png'); ctx.close()
                ctx, page, errors = open_store(browser, appearance, path, mobile=True)
                page.wait_for_function("document.documentElement.hasAttribute('data-store-mode')", timeout=4000)
                check(f'{tid}: modo loja sem rolagem horizontal no celular', page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
                page.screenshot(path=f'{SHOTS}/{tid}-modo-loja-celular.png'); ctx.close()
            appearance.update(mode='none')
            ctx, page, errors = open_store(browser, appearance, '/london/index.html?preview=1')
            page.evaluate("window.postMessage({type:'papeliza:appearance',config:{version:1,colors:{primary:'#ff0000'}}},'*')")
            page.wait_for_timeout(300)
            check('Prévia fora de um iframe do painel não aceita mensagens', root_var(page, '--green') == '#07558a')
            ctx.close()

            print('\n[4] Painel: editor de aparência (London)')
            appearance.update(mode='none')
            context = browser.new_context(viewport={'width': 1360, 'height': 900}, locale='pt-BR')
            install_routes(context, appearance)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(BASE + '/index.html?loja=london-papelaria#aparencia')
            page.wait_for_selector('#ap-templates input', timeout=8000)
            page.wait_for_function("document.getElementById('ap-state').textContent!==''")
            check('Aba Aparência aberta e catálogo oculto', page.is_visible('#appearance-main') and not page.is_visible('#catalog-main'))
            check('Navegação marca Aparência como atual', page.get_attribute('nav a[data-view=appearance]', 'aria-current') == 'page')
            check('Estado inicial: sem personalização', page.inner_text('#ap-state') == 'Sem personalização')
            check('Modelo da loja pré-selecionado (London)', page.is_checked('input[name=ap-template][value=london]'))
            check('Salvar e publicar desabilitados sem alterações', page.is_disabled('#ap-save') and page.is_disabled('#ap-publish'))
            frame = page.frame_locator('#ap-frame')
            frame.locator('.product-card').first.wait_for(timeout=8000)
            page.wait_for_timeout(300)
            page.screenshot(path=f'{SHOTS}/painel-aparencia-inicial.png', full_page=False)

            page.fill('#ap-primary', '#0b6b3a')
            page.fill('#ap-heroTitle', 'Volta às aulas')
            page.fill('#ap-heroHighlight', 'sem estresse')
            page.wait_for_function("document.getElementById('ap-frame').contentDocument.documentElement.style.getPropertyValue('--green')==='#0b6b3a'", timeout=4000)
            check('Prévia ao vivo: cor muda no iframe sem salvar', True)
            fdoc = lambda js: page.evaluate(f"document.getElementById('ap-frame').contentDocument.{js}")
            check('Prévia ao vivo: título muda no iframe', fdoc("querySelector('#school-kit-title').textContent").replace('\n', ' ').startswith('Volta às aulas'))
            page.fill('#ap-address', 'Rua das Flores, 100\nCentro · Cambé, PR'); page.fill('#ap-aboutText', 'Papelaria de bairro com atendimento caprichado.')
            page.fill('#ap-footerTagline', 'Tudo para o seu estudo'); page.fill('#ap-mapUrl', 'https://maps.app.goo.gl/AbC123xy')
            page.wait_for_function("document.getElementById('ap-frame').contentDocument.querySelector('[data-ap-lines=address]').textContent.includes('Cambé')", timeout=4000)
            check('Prévia: endereço em duas linhas (com <br>, sem HTML injetado)', fdoc("querySelector('[data-ap-lines=address]').innerHTML") == 'Rua das Flores, 100<br>Centro · Cambé, PR')
            check('Prévia: texto sobre a loja e frase do rodapé', fdoc("querySelector('[data-ap=aboutText]').textContent") == 'Papelaria de bairro com atendimento caprichado.' and fdoc("querySelector('[data-ap=footerTagline]').textContent") == 'Tudo para o seu estudo')
            check('Prévia: link do mapa atualizado', fdoc("querySelector('[data-ap-href=map]').href") == 'https://maps.app.goo.gl/AbC123xy')
            check('London não mostra o campo de horários', not page.is_visible('[data-ap-field="hours"]'))
            page.fill('#ap-mapUrl', 'https://evil.example/x'); page.click('#ap-save')
            page.wait_for_function("document.getElementById('ap-error').textContent.includes('Google Maps')", timeout=4000)
            check('Link de mapa inválido é recusado ao salvar, com mensagem clara e campo marcado', page.get_attribute('#ap-mapUrl', 'aria-invalid') == 'true')
            check('Nada foi gravado com o mapa inválido', page.evaluate("JSON.parse(localStorage.getItem('fakeDb')||'{}').rows?.['%s']" % LONDON) is None)
            for field in ('address', 'aboutText', 'footerTagline', 'mapUrl'): page.fill('#ap-' + field, '')
            check('Estado: alterações não salvas', page.inner_text('#ap-state') == 'Alterações não salvas')
            check('Nada foi gravado antes de salvar', page.evaluate("JSON.parse(localStorage.getItem('fakeDb')||'{}').rows?.['%s']" % LONDON) is None)
            page.fill('#ap-primary', '#ffee00')
            page.wait_for_function("document.getElementById('ap-contrast').dataset.low==='true'")
            check('Aviso de contraste baixo', 'Abaixo de 4,5:1' in page.inner_text('#ap-contrast'))
            page.fill('#ap-primary', '#0b6b3a')

            page.fill('#ap-primary', 'verde')
            page.click('#ap-save')
            check('Cor inválida bloqueia o salvamento e marca o campo', page.get_attribute('#ap-primary', 'aria-invalid') == 'true' and 'RRGGBB' in page.inner_text('#ap-error'))
            check('Nada gravado com valor inválido', page.evaluate("JSON.parse(localStorage.getItem('fakeDb')||'{}').rows?.['%s']" % LONDON) is None)
            page.fill('#ap-primary', '#0b6b3a')
            page.fill('#ap-whatsapp', '(43) 99999-0000')
            page.fill('#ap-instagram', 'https://evil.example/x')
            page.click('#ap-save')
            check('Instagram fora do domínio é recusado', page.get_attribute('#ap-instagram', 'aria-invalid') == 'true')
            page.fill('#ap-instagram', 'https://www.instagram.com/nova.papelaria/')

            page.click('#ap-mobile')
            check('Prévia celular: iframe com 390px', page.evaluate("document.getElementById('ap-frame').getBoundingClientRect().width") == 390)
            page.screenshot(path=f'{SHOTS}/painel-aparencia-editando-mobile-preview.png')
            page.click('#ap-desktop')

            page.click('#ap-save')
            page.wait_for_function("document.getElementById('ap-state').textContent.startsWith('Rascunho salvo')")
            check('Rascunho salvo (não publicado)', page.inner_text('#ap-state') == 'Rascunho salvo · não publicado')
            db = page.evaluate("JSON.parse(localStorage.getItem('fakeDb'))")
            row = db['rows'][LONDON]
            check('WhatsApp salvo volta formatado no formulário', page.input_value('#ap-whatsapp') == '(43) 99999-0000', page.input_value('#ap-whatsapp'))
            check('Rascunho gravado com configuração normalizada', row['draft']['colors']['primary'] == '#0b6b3a' and row['draft']['contact']['whatsapp'] == '5543999990000' and row['published_version'] == 0, row)
            check('Visitantes ainda não veem nada (publicado vazio)', row['published_template_id'] is None)

            page.click('#ap-publish')
            check('Publicar pede confirmação', page.inner_text('#ap-publish') == 'Confirmar publicação')
            page.click('#ap-publish')
            page.wait_for_function("document.getElementById('ap-state').textContent.startsWith('Publicado')")
            check('Publicado: versão 1', page.inner_text('#ap-state') == 'Publicado · versão 1')
            check('Histórico lista a versão 1', page.locator('#ap-history li').count() == 1 and 'Versão 1' in page.inner_text('#ap-history'))
            db = page.evaluate("JSON.parse(localStorage.getItem('fakeDb'))")
            check('Publicação gravou versão pública e histórico', db['rows'][LONDON]['published']['colors']['primary'] == '#0b6b3a' and len(db['history']) == 1)
            page.screenshot(path=f'{SHOTS}/painel-aparencia-publicado.png')

            page.fill('#ap-primary', '#8a1c1c'); page.fill('#ap-heroTitle', 'Segunda versão')
            page.click('#ap-save'); page.wait_for_function("document.getElementById('ap-state').textContent.startsWith('Rascunho salvo')")
            page.click('#ap-publish'); page.click('#ap-publish')
            page.wait_for_function("document.getElementById('ap-state').textContent==='Publicado · versão 2'")
            check('Segunda publicação: versão 2 e 2 itens no histórico', page.locator('#ap-history li').count() == 2)
            page.locator('#ap-history li', has_text='Versão 1').get_by_role('button').click()
            page.wait_for_function("document.getElementById('ap-primary').value==='#0b6b3a'")
            check('Restaurar versão 1 traz os valores para o formulário', page.input_value('#ap-heroTitle') == 'Volta às aulas')
            db = page.evaluate("JSON.parse(localStorage.getItem('fakeDb'))")
            check('Restaurar não altera a versão pública (v2 segue no ar)', db['rows'][LONDON]['published']['colors']['primary'] == '#8a1c1c')
            check('Estado após restaurar: rascunho não publicado', page.inner_text('#ap-state') == 'Rascunho salvo · não publicado')

            print('\n[5] Painel: modelo de outra loja e conflitos')
            page.check('input[name=ap-template][value=lapis-de-cor]')
            check('Troca de modelo recarrega a prévia no layout escolhido', 'vitrine/index.html' in page.get_attribute('#ap-frame', 'src'))
            check('Modelo de outra loja: aviso visível e publicação bloqueada', page.is_visible('#ap-template-note') and page.is_disabled('#ap-publish'))
            check('Campo de destaque some no modelo Lápis de Cor', not page.is_visible('[data-ap-field="heroHighlight"]'))
            check('Lápis de Cor mostra o campo de horários', page.is_visible('[data-ap-field="hours"]'))
            page.fill('#ap-hours', 'Seg a sex · 8h às 17h\nSáb · 8h às 12h')
            page.wait_for_function("document.getElementById('ap-frame').contentDocument.querySelector('[data-ap-lines=hours]')?.textContent.includes('8h às 17h')", timeout=6000)
            check('Prévia Lápis de Cor: horários em duas linhas', fdoc("querySelector('[data-ap-lines=hours]').innerHTML") == 'Seg a sex · 8h às 17h<br>Sáb · 8h às 12h')
            page.fill('#ap-hours', '')
            page.check('input[name=ap-template][value=london]')
            check('Volta ao modelo da loja: publicação liberada de novo', not page.is_visible('#ap-template-note'))
            # conflito: outra aba altera o rascunho
            page.evaluate("(()=>{const db=JSON.parse(localStorage.getItem('fakeDb'));db.rows['%s'].updated_at='2030-01-01T00:00:00.000Z';localStorage.setItem('fakeDb',JSON.stringify(db))})()" % LONDON)
            page.fill('#ap-heroEyebrow', 'ALTERAÇÃO CONFLITANTE'); page.click('#ap-save')
            page.wait_for_function("document.getElementById('ap-message').textContent.includes('outra aba')")
            check('Conflito de edição é detectado e preserva o formulário', page.input_value('#ap-heroEyebrow') == 'ALTERAÇÃO CONFLITANTE')

            print('\n[6] Painel: migração ainda não aplicada')
            page.evaluate("(()=>{const db=JSON.parse(localStorage.getItem('fakeDb'));db.mode='unavailable';localStorage.setItem('fakeDb',JSON.stringify(db))})()")
            page.reload(); page.wait_for_selector('#ap-templates input', timeout=8000)
            page.wait_for_function("document.getElementById('ap-state').textContent.includes('não ativado')", timeout=5000)
            check('Recurso indisponível: aviso claro', 'ainda não foi ativado' in page.inner_text('#ap-message'))
            check('Recurso indisponível: salvar/publicar desabilitados', page.is_disabled('#ap-save') and page.is_disabled('#ap-publish'))
            page.fill('#ap-primary', '#123456')
            page.wait_for_function("document.getElementById('ap-frame').contentDocument.documentElement.style.getPropertyValue('--green')==='#123456'", timeout=4000)
            check('Recurso indisponível: prévia continua funcionando', True)
            check('Painel sem erros de JS', not errors, errors)
            context.close()

            print('\n[7] Painel: catálogo e celular')
            ctx = browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR'); install_routes(ctx, {'mode': 'none'})
            m = ctx.new_page(); merr = []; m.on('pageerror', lambda e: merr.append(str(e)))
            m.goto(BASE + '/index.html?loja=lapis-de-cor'); m.wait_for_selector('#new:not([disabled])', timeout=8000)
            check('Catálogo continua visível por padrão', m.is_visible('#catalog-main') and not m.is_visible('#appearance-main'))
            check('Painel mobile sem rolagem horizontal (catálogo)', m.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), m.evaluate("document.documentElement.scrollWidth"))
            m.screenshot(path=f'{SHOTS}/painel-catalogo-mobile.png')
            m.click('nav a[data-view=appearance]'); m.wait_for_selector('#ap-templates input', timeout=8000)
            check('Painel mobile sem rolagem horizontal (aparência)', m.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), m.evaluate("document.documentElement.scrollWidth"))
            check('Painel mobile: barra de botões não fica fixa cobrindo o formulário', m.evaluate("getComputedStyle(document.querySelector('.ap-buttons')).position")=='static')
            m.screenshot(path=f'{SHOTS}/painel-aparencia-mobile.png', full_page=True)
            check('Painel mobile sem erros de JS', not merr, merr); ctx.close()
            browser.close()
    finally:
        server.terminate()
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} verificações passaram. Capturas em {SHOTS}")
    if failed:
        print('FALHAS:', *failed, sep='\n  - '); sys.exit(1)

if __name__ == '__main__':
    main()
