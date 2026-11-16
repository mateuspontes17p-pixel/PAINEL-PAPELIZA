#!/usr/bin/env python3
"""Teste de NAVEGADOR REAL do painel e das vitrines contra um projeto Supabase de TESTES (PAINEL 2).

Isolamento (o repositório NÃO é alterado):
- copia public/ para uma pasta temporária e troca só ali a URL e a chave pública do Supabase;
- recusa rodar se a URL for a do projeto de produção e verifica que a cópia não contém o ID de produção;
- toda requisição do navegador para qualquer *.supabase.co passa por uma ponte: só o host de testes é encaminhado
  (via proxy/CA do ambiente); qualquer chamada ao projeto de produção é ABORTADA e registrada (o teste falha).

Variáveis: TEST_SUPABASE_URL, TEST_SUPABASE_KEY (chave pública/publishable), USERS_FILE (JSON lapis/london/outsider),
SUPABASE_BUNDLE (ESM local do supabase-js 2.49.8; o esm.sh não é usado), SHOTS (pasta de capturas).
Requer: python3 + playwright + google-chrome. Senhas nunca são impressas.
"""
import json, os, re, shutil, subprocess, sys, tempfile, time, struct, zlib, urllib.request, urllib.error
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

PROD_REF = 'ipqawywfqydgyabcynbh'
URL = os.environ['TEST_SUPABASE_URL'].rstrip('/'); KEY = os.environ['TEST_SUPABASE_KEY']
USERS = json.load(open(os.environ['USERS_FILE'])); BUNDLE = os.environ['SUPABASE_BUNDLE']
SHOTS = os.environ.get('SHOTS', '/tmp/papeliza-shots'); os.makedirs(SHOTS, exist_ok=True)
if PROD_REF in URL or PROD_REF in KEY: sys.exit('RECUSADO: URL/chave do projeto de produção.')
HOST = urlparse(URL).hostname
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8780; BASE = f'http://localhost:{PORT}'
LAPIS, LONDON = '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'

# ---------- cópia isolada de public/ apontando para o projeto de testes ----------
WORK = tempfile.mkdtemp(prefix='papeliza-painel2-'); PUB = os.path.join(WORK, 'public'); shutil.copytree(os.path.join(ROOT, 'public'), PUB)
cli = os.path.join(PUB, 'supabase-client.js'); src = open(cli, encoding='utf-8').read()
src = re.sub(r"export const URL='[^']*'", f"export const URL='{URL}'", src); src = re.sub(r"export const KEY='[^']*'", f"export const KEY='{KEY}'", src)
open(cli, 'w', encoding='utf-8').write(src)
leaks = [os.path.join(d, f) for d, _, fs in os.walk(PUB) for f in fs if PROD_REF in open(os.path.join(d, f), 'rb').read().decode('latin1')]
if leaks: sys.exit('RECUSADO: a cópia ainda referencia o projeto de produção: ' + ', '.join(leaks))

failures = 0; passed = 0
def check(ok, name, detail=''):
    global failures, passed
    if ok: passed += 1
    else: failures += 1
    print(('  ok   ' if ok else '  FAIL ') + name + ('' if ok else f'  → {str(detail)[:200]}'))

# ---------- PNGs de teste (sem dependências) ----------
def png(w, h, rgb_fn):
    raw = b''.join(b'\x00' + b''.join(bytes(rgb_fn(x, y, w, h)) for x in range(w)) for y in range(h))
    def chunk(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
LOGO = png(240, 240, lambda x, y, w, h: (30, 110, 70) if (x - w/2) ** 2 + (y - h/2) ** 2 < (w/2 - 8) ** 2 else (255, 255, 255))
BANNER = png(900, 300, lambda x, y, w, h: (int(40 + 150 * x / w), int(110 + 60 * y / h), 120))

# ---------- servidor estático local + ponte de rede ----------
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', PUB], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
HOSTS = {}; PROD_CALLS = []; SB_REQ = {}
def note(host): HOSTS[host] = HOSTS.get(host, 0) + 1
CORS = lambda origin: {'access-control-allow-origin': origin or '*', 'access-control-allow-credentials': 'true', 'access-control-expose-headers': '*', 'vary': 'Origin'}
def bridge(route):
    req = route.request; u = urlparse(req.url); host = u.hostname; note(host)
    origin = req.headers.get('origin', '*')
    if host == 'esm.sh' and 'supabase-js@2.49.8' in req.url:
        return route.fulfill(status=200, body=open(BUNDLE, 'rb').read(), headers={'content-type': 'text/javascript', **CORS(origin)})
    if host and PROD_REF in host:
        PROD_CALLS.append(req.url); return route.abort()
    if host != HOST: return route.abort()
    if req.method == 'OPTIONS':
        return route.fulfill(status=204, headers={**CORS(origin), 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-allow-headers': req.headers.get('access-control-request-headers', '*'), 'access-control-max-age': '600'})
    SB_REQ[u.path.split('/')[1] + '/' + (u.path.split('/')[2] if len(u.path.split('/')) > 2 else '')] = SB_REQ.get(u.path.split('/')[1] + '/' + (u.path.split('/')[2] if len(u.path.split('/')) > 2 else ''), 0) + 1
    headers = {k: v for k, v in req.headers.items() if k not in ('host', 'content-length', 'accept-encoding', 'connection', 'origin', 'referer') and not k.startswith('sec-')}
    r = urllib.request.Request(req.url, data=req.post_data_buffer, headers=headers, method=req.method)
    try: resp = urllib.request.urlopen(r, timeout=40); status, rh, body = resp.status, resp.headers, resp.read()
    except urllib.error.HTTPError as e: status, rh, body = e.code, e.headers, e.read()
    out = {k.lower(): v for k, v in rh.items() if k.lower() not in ('content-encoding', 'transfer-encoding', 'content-length', 'connection', 'access-control-allow-origin')}
    route.fulfill(status=status, headers={**out, **CORS(origin)}, body=body)

def new_context(browser, mobile=False):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1360, 'height': 900}, locale='pt-BR')
    ctx.route(re.compile(r'https?://(?!localhost)[^/]+/.*'), bridge)   # tudo que não é localhost passa pela ponte (fontes e outros: abortados)
    page = ctx.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'net::ERR_FAILED' not in m.text else None)
    return ctx, page, errors

def shot(page, name, full=False): page.screenshot(path=f'{SHOTS}/{name}.png', full_page=full)
def login(page, who):
    page.goto(BASE + '/index.html'); page.wait_for_selector('#login-screen', timeout=15000)
    page.fill('#auth-email', USERS[who]['email']); page.fill('#auth-password', USERS[who]['password']); page.click('#sign-in')
def open_appearance(page):
    page.click('nav a[data-view=appearance]'); page.wait_for_selector('#ap-templates input', timeout=15000)
    page.wait_for_function("document.getElementById('ap-state').textContent.trim().length>0", timeout=10000)
def state(page): return page.inner_text('#ap-state').strip()
def frame_var(page, name): return page.evaluate("n=>document.getElementById('ap-frame').contentDocument.documentElement.style.getPropertyValue(n).trim()", name)
def fdoc(page, js): return page.evaluate(f"document.getElementById('ap-frame').contentDocument.{js}")
def wait_state(page, text, timeout=20000): page.wait_for_function("t=>document.getElementById('ap-state').textContent.trim()===t", arg=text, timeout=timeout)

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        all_errors = []

        # ================= 1) Lápis de Cor: login, catálogo, aparência =================
        print('\n[1] Login e seleção de loja (lojista Lápis de Cor)')
        ctx, page, errors = new_context(browser); all_errors += [errors]
        page.goto(BASE + '/index.html'); page.wait_for_selector('#login-screen', timeout=15000); shot(page, '01-login')
        login(page, 'lapis'); page.wait_for_selector('#authenticated-panel:not([hidden])', timeout=20000)
        check(page.is_visible('#authenticated-panel'), 'login real (Auth do PAINEL 2) abre o painel')
        options = page.eval_on_selector_all('#store-select option', 'els=>els.map(e=>e.textContent.trim())')
        check(options == ['Lápis de Cor'], 'lojista vê somente a própria loja no seletor', options)
        page.wait_for_selector('#rows tr, #rows [data-id], #rows .row', timeout=15000)
        rows = page.inner_text('#rows'); check('Caderno' in rows and 'Caneta' not in rows, 'catálogo da Lápis de Cor lista só os produtos dela', rows[:80])
        shot(page, '02-painel-catalogo')

        print('\n[2] Aparência: edição e pré-visualização (computador e celular)')
        open_appearance(page)
        check(state(page) == 'Sem personalização', 'estado inicial: sem personalização', state(page))
        check(page.is_checked('input[name=ap-template][value=lapis-de-cor]'), 'modelo da loja (Lápis de Cor) pré-selecionado')
        fr = page.frame_locator('#ap-frame'); fr.locator('.product-card').first.wait_for(timeout=20000)
        check(fdoc(page, "querySelectorAll('.product-card').length") >= 1, 'prévia carrega a vitrine com o catálogo real do PAINEL 2')
        shot(page, '03-aparencia-inicial')
        page.fill('#ap-primary', '#1e6e46'); page.fill('#ap-accent', '#d97706')
        page.fill('#ap-heroEyebrow', 'GIRASSOL PAPELARIA'); page.fill('#ap-heroTitle', 'Volta às aulas\ncom estilo.'); page.fill('#ap-heroSubtitle', 'Cadernos, canetas e muito mais para o seu ano.')
        page.fill('#ap-aboutText', 'Papelaria de bairro com atendimento caprichado.'); page.fill('#ap-address', 'Rua das Flores, 100\nCambé, PR'); page.fill('#ap-hours', 'Seg a sex · 8h às 18h\nSáb · 8h às 12h')
        page.fill('#ap-footerTagline', 'Tudo para o seu estudo'); page.fill('#ap-mapUrl', 'https://maps.app.goo.gl/AbC123xy')
        page.fill('#ap-whatsapp', '(43) 99111-2222'); page.fill('#ap-instagram', 'https://www.instagram.com/papelaria.girassol/')
        page.wait_for_function("document.getElementById('ap-frame').contentDocument.documentElement.style.getPropertyValue('--green')==='#1e6e46'", timeout=8000)
        check(frame_var(page, '--green') == '#1e6e46' and frame_var(page, '--red') == '#d97706', 'prévia ao vivo: cores principal e de destaque')
        check(fdoc(page, "querySelector('#studio-title').innerText").replace('\n', ' ').startswith('Volta às aulas'), 'prévia ao vivo: título em duas linhas')
        check(fdoc(page, "querySelector('[data-ap-lines=address]').innerHTML") == 'Rua das Flores, 100<br>Cambé, PR', 'prévia: endereço em duas linhas sem HTML injetado')
        check(fdoc(page, "querySelector('[data-ap-lines=hours]').innerHTML") == 'Seg a sex · 8h às 18h<br>Sáb · 8h às 12h', 'prévia: horários em duas linhas')
        check(fdoc(page, "querySelector('[data-ap-href=map]').href") == 'https://maps.app.goo.gl/AbC123xy', 'prévia: link do mapa')
        check(fdoc(page, "querySelector('[data-ap-href=whatsapp]').href") == 'https://wa.me/5543911112222', 'prévia: WhatsApp normalizado')
        page.set_input_files('#ap-logo', files=[{'name': 'logo.png', 'mimeType': 'image/png', 'buffer': LOGO}])
        page.set_input_files('#ap-banner', files=[{'name': 'banner.png', 'mimeType': 'image/png', 'buffer': BANNER}])
        page.wait_for_function("document.getElementById('ap-frame').contentDocument.querySelector('img[data-ap=logo]').src.startsWith('blob:')", timeout=8000)
        check(fdoc(page, "querySelector('img[data-ap=banner]').src").startswith('blob:'), 'prévia usa logotipo e banner escolhidos antes de enviar (blob local)')
        shot(page, '04-aparencia-editando-desktop')
        page.click('#ap-mobile'); page.wait_for_timeout(500)
        width = page.evaluate("document.getElementById('ap-frame').getBoundingClientRect().width")
        check(page.get_attribute('#ap-mobile', 'aria-pressed') == 'true' and 300 <= width <= 460, 'modo celular reduz a prévia', width)
        check(fdoc(page, "documentElement.scrollWidth") <= width + 2, 'prévia no celular sem rolagem horizontal')
        shot(page, '05-aparencia-previa-celular'); page.click('#ap-desktop'); page.wait_for_timeout(300)
        check(page.evaluate("document.getElementById('ap-frame').getBoundingClientRect().width") > 700, 'modo computador restaura a largura da prévia')

        print('\n[3] Rascunho, publicação e restauração (PAINEL 2)')
        page.click('#ap-save'); wait_state(page, 'Rascunho salvo · não publicado')
        check(True, 'salvar rascunho grava no PAINEL 2 (estado "Rascunho salvo · não publicado")')
        page.reload(); page.wait_for_selector('#authenticated-panel:not([hidden])', timeout=20000); open_appearance(page)
        check(page.input_value('#ap-primary') == '#1e6e46' and page.input_value('#ap-heroTitle').replace('\n', ' ') == 'Volta às aulas com estilo.', 'após recarregar, o rascunho vem do banco')
        check(page.input_value('#ap-address') == 'Rua das Flores, 100\nCambé, PR' and page.input_value('#ap-whatsapp') == '(43) 99111-2222', 'endereço e WhatsApp persistidos')
        page.wait_for_function("document.getElementById('ap-frame').contentDocument.querySelector('img[data-ap=logo]')&&document.getElementById('ap-frame').contentDocument.querySelector('img[data-ap=logo]').src.includes('/storage/v1/object/public/catalog-images/')", timeout=20000)
        logo_src = fdoc(page, "querySelector('img[data-ap=logo]').src"); check(f'/{LAPIS}/branding/' in logo_src, 'logotipo foi enviado ao Storage na pasta da própria loja', logo_src)
        shot(page, '06-aparencia-rascunho-salvo')
        page.click('#ap-publish'); check(page.inner_text('#ap-publish').strip() == 'Confirmar publicação', 'publicar pede confirmação (2 etapas)'); page.click('#ap-publish')
        wait_state(page, 'Publicado · versão 1'); check(page.locator('#ap-history li').count() == 1, 'publicação v1 registra o histórico')
        shot(page, '07-aparencia-publicada-v1')

        # vitrine pública, visitante anônimo (contexto novo, sem login)
        vctx, vpage, verr = new_context(browser); all_errors += [verr]
        vpage.goto(BASE + '/vitrine/index.html'); vpage.wait_for_selector('.product-card', timeout=20000); vpage.wait_for_function("document.documentElement.getAttribute('data-appearance')==='custom'", timeout=15000)
        root = lambda n: vpage.evaluate("n=>document.documentElement.style.getPropertyValue(n).trim()", n)
        check(root('--green') == '#1e6e46', 'vitrine pública (visitante) já mostra a cor publicada')
        check(vpage.inner_text('#studio-title').replace('\n', ' ').startswith('Volta às aulas'), 'vitrine pública mostra o título publicado')
        check(vpage.evaluate("document.querySelector('[data-ap-lines=address]').innerHTML") == 'Rua das Flores, 100<br>Cambé, PR', 'vitrine pública mostra o endereço publicado')
        vpage.wait_for_function("[...document.querySelectorAll('img[data-ap=logo]')].every(i=>i.complete&&i.naturalWidth>0)", timeout=20000)
        check(vpage.evaluate("[...document.querySelectorAll('img[data-ap=logo],img[data-ap=banner]')].every(i=>i.src.includes('/storage/v1/object/public/catalog-images/')&&i.naturalWidth>0)"), 'logotipo e banner publicados carregam do Storage do PAINEL 2')
        check('Caderno' in vpage.inner_text('#results') or vpage.locator('.product-card').count() >= 1, 'catálogo da Lápis de Cor funciona na vitrine')
        shot(vpage, '08-vitrine-lapis-publicada-desktop'); vctx.close()
        mctx, mpage, merr = new_context(browser, mobile=True); all_errors += [merr]
        mpage.goto(BASE + '/vitrine/index.html'); mpage.wait_for_selector('.product-card', timeout=20000); mpage.wait_for_function("document.documentElement.getAttribute('data-appearance')==='custom'", timeout=15000)
        check(mpage.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), 'vitrine publicada sem rolagem horizontal no celular')
        shot(mpage, '09-vitrine-lapis-publicada-celular'); mctx.close()

        # v2 e restauração
        page.fill('#ap-primary', '#8a1c1c'); page.fill('#ap-heroTitle', 'Segunda versão.'); page.click('#ap-save'); wait_state(page, 'Rascunho salvo · não publicado')
        page.click('#ap-publish'); page.click('#ap-publish'); wait_state(page, 'Publicado · versão 2')
        check(page.locator('#ap-history li').count() == 2, 'publicação v2 registra o histórico (2 itens)')
        page.locator('#ap-history li', has_text='Versão 1').get_by_role('button').click()
        page.wait_for_function("document.getElementById('ap-primary').value==='#1e6e46'", timeout=15000)
        check(page.input_value('#ap-heroTitle').replace('\n', ' ') == 'Volta às aulas com estilo.', 'restaurar a versão 1 traz os valores para o formulário')
        check(state(page) == 'Rascunho salvo · não publicado', 'restauração vai para o rascunho, sem publicar', state(page))
        vctx, vpage, verr = new_context(browser); all_errors += [verr]
        vpage.goto(BASE + '/vitrine/index.html'); vpage.wait_for_function("document.documentElement.getAttribute('data-appearance')==='custom'", timeout=20000)
        check(vpage.evaluate("document.documentElement.style.getPropertyValue('--green').trim()") == '#8a1c1c', 'a versão 2 segue no ar depois de restaurar a 1 no rascunho'); vctx.close()
        shot(page, '10-aparencia-restaurada-v1')

        print('\n[4] Template 01 (London) escolhido por outra loja')
        page.check('input[name=ap-template][value=london]'); page.wait_for_function("document.getElementById('ap-frame').src.includes('london/index.html')", timeout=15000)
        page.wait_for_function("document.getElementById('ap-frame').contentDocument.querySelector('.product-card')", timeout=20000)
        check(page.is_visible('#ap-template-note') and page.is_disabled('#ap-publish'), 'modelo de outra loja: aviso visível e publicação bloqueada sem modo loja')
        shot(page, '11-template-london-na-lapis-bloqueado')
        page.check('#ap-storeMode'); page.wait_for_timeout(300)
        check(not page.is_disabled('#ap-publish') and not page.is_visible('#ap-template-note'), 'modo loja + WhatsApp próprio libera a publicação do modelo de outra loja (não publicado neste teste)')
        page.fill('#ap-whatsapp', ''); page.wait_for_timeout(300)
        check(page.is_disabled('#ap-publish'), 'sem WhatsApp próprio a publicação volta a ser bloqueada')
        page.fill('#ap-whatsapp', '(43) 99111-2222')
        page.check('input[name=ap-template][value=lapis-de-cor]'); page.uncheck('#ap-storeMode')
        page.click('#ap-discard') if page.is_enabled('#ap-discard') else None
        ctx.close()

        # ================= 2) London: isolamento =================
        print('\n[5] Isolamento: lojista London')
        lctx, lpage, lerr = new_context(browser); all_errors += [lerr]
        login(lpage, 'london'); lpage.wait_for_selector('#authenticated-panel:not([hidden])', timeout=20000)
        opts = lpage.eval_on_selector_all('#store-select option', 'els=>els.map(e=>e.textContent.trim())')
        check(len(opts) == 1 and opts[0].startswith('London'), 'lojista London vê somente a London', opts)
        lpage.wait_for_selector('#rows tr, #rows [data-id], #rows .row', timeout=15000); lrows = lpage.inner_text('#rows')
        check('Caneta' in lrows and 'Caderno' not in lrows, 'catálogo da London não mostra produtos da Lápis de Cor', lrows[:80])
        open_appearance(lpage); check(state(lpage) == 'Sem personalização', 'London NÃO enxerga a aparência da Lápis de Cor', state(lpage))
        check(lpage.is_checked('input[name=ap-template][value=london]'), 'modelo da London pré-selecionado')
        lpage.fill('#ap-primary', '#0b3d91'); lpage.fill('#ap-heroTitle', 'Novidades\nda London.'); lpage.fill('#ap-whatsapp', '(43) 98888-7777')
        lpage.click('#ap-save'); wait_state(lpage, 'Rascunho salvo · não publicado'); lpage.click('#ap-publish'); lpage.click('#ap-publish'); wait_state(lpage, 'Publicado · versão 1')
        check(lpage.locator('#ap-history li').count() == 1, 'London publica o próprio modelo (histórico próprio, só 1 versão)')
        shot(lpage, '12-aparencia-london-publicada')
        lpage.goto(BASE + '/index.html?loja=lapis-de-cor'); lpage.wait_for_timeout(2500)
        denied = not lpage.is_visible('#authenticated-panel') or 'Lápis' not in (lpage.inner_text('#store-context-name') if lpage.is_visible('#store-context-name') else '')
        check(denied, 'London tentando abrir ?loja=lapis-de-cor não acessa a Lápis de Cor')
        shot(lpage, '13-london-tenta-abrir-lapis'); lctx.close()

        sctx, spage, serr = new_context(browser); all_errors += [serr]
        spage.goto(BASE + '/london/index.html'); spage.wait_for_selector('.product-card', timeout=20000); spage.wait_for_function("document.documentElement.getAttribute('data-appearance')==='custom'", timeout=15000)
        check(spage.evaluate("document.documentElement.style.getPropertyValue('--green').trim()") == '#0b3d91', 'vitrine London publicada mostra a cor da London')
        check('Caneta' in spage.inner_text('body') and 'Caderno' not in spage.inner_text('#results'), 'vitrine London mostra só o catálogo da London')
        shot(spage, '14-vitrine-london-publicada-desktop'); spage.goto(BASE + '/vitrine/index.html'); spage.wait_for_function("document.documentElement.getAttribute('data-appearance')==='custom'", timeout=20000)
        check(spage.evaluate("document.documentElement.style.getPropertyValue('--green').trim()") == '#8a1c1c', 'vitrine Lápis de Cor segue com a própria aparência (a London não a afetou)'); sctx.close()

        # ================= 3) Sem vínculo =================
        print('\n[6] Usuário logado sem vínculo')
        octx, opage, oerr = new_context(browser); all_errors += [oerr]
        login(opage, 'outsider'); opage.wait_for_timeout(4000)
        check(not opage.is_visible('#authenticated-panel'), 'usuário sem vínculo NÃO abre o painel')
        shot(opage, '15-sem-vinculo-negado'); octx.close()

        # ================= 4) painel no celular =================
        print('\n[7] Painel no celular')
        pctx, ppage, perr = new_context(browser, mobile=True); all_errors += [perr]
        login(ppage, 'lapis'); ppage.wait_for_selector('#authenticated-panel:not([hidden])', timeout=20000); ppage.wait_for_selector('#rows tr, #rows [data-id], #rows .row', timeout=15000)
        check(ppage.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), 'painel (catálogo) sem rolagem horizontal no celular')
        shot(ppage, '16-painel-celular-catalogo'); open_appearance(ppage); ppage.wait_for_timeout(800)
        check(ppage.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), 'aba Aparência sem rolagem horizontal no celular')
        shot(ppage, '17-painel-celular-aparencia'); pctx.close(); browser.close()

        # ================= auditoria =================
        print('\n[8] Auditoria de rede e erros')
        check(not PROD_CALLS, 'NENHUMA chamada do navegador ao projeto de produção', PROD_CALLS[:3])
        extra = {h for h in HOSTS if h not in (HOST, 'esm.sh') and h != 'localhost'}
        print('  hosts contatados fora do localhost:', {h: HOSTS[h] for h in HOSTS if h != 'localhost'})
        check(all(h in (HOST, 'esm.sh') or h.endswith(('googleapis.com', 'gstatic.com')) for h in extra), 'somente o host de testes (e fontes, abortadas) foram contatados', extra)
        print('  requisições ao PAINEL 2 por serviço:', dict(sorted(SB_REQ.items())))
        flat = [e for errs in all_errors for e in errs]; check(not flat, 'sem erros de JavaScript nas páginas', flat[:3])
        print(f'\nResultado: {passed} ok, {failures} falha(s)')

try:
    main()
finally:
    server.terminate(); shutil.rmtree(WORK, ignore_errors=True)
sys.exit(1 if failures else 0)
