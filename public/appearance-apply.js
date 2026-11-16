// Aplica uma configuração de aparência (já validada) ao DOM de uma vitrine.
// Somente textContent, atributos src/href/alt e variáveis CSS: nunca HTML nem CSS arbitrário.
// Reversível: resetAppearance devolve cada elemento ao que veio no HTML original,
// o que permite atualizar a prévia a cada tecla e voltar ao visual padrão sem recarregar.
import { findTemplate, cssVariables, validateAppearance, formatWhatsApp } from './template-registry.js';

const touched = []; // { restore() }
const SAFE_URL = /^(https:\/\/[^\s]+|blob:[^\s]+)$/;

function track(restore) {
  touched.push(restore);
}
function setProp(el, prop, value) {
  const before = el[prop];
  el[prop] = value;
  track(() => { el[prop] = before; });
}
function setAttr(el, name, value) {
  const had = el.hasAttribute(name), before = el.getAttribute(name);
  el.setAttribute(name, value);
  track(() => { if (had) el.setAttribute(name, before); else el.removeAttribute(name); });
}
function setFirstTextNode(el, value) {
  const node = Array.from(el.childNodes).find(child => child.nodeType === 3 && child.nodeValue.trim());
  if (!node) return;
  const before = node.nodeValue;
  node.nodeValue = value;
  track(() => { node.nodeValue = before; });
}
function replaceChildren(el, nodes) {
  const before = Array.from(el.childNodes).map(node => node.cloneNode(true));
  el.replaceChildren(...nodes);
  track(() => el.replaceChildren(...before));
}

// Modo loja: oculta avisos e dados de demonstração da loja de origem. Regra estática, criada aqui e
// removida em resetAppearance; o convite de ativação também é bloqueado em campanha.js.
const STORE_MODE_CSS = '[data-store-mode] [data-demo],[data-store-mode] [hidden]{display:none!important}' +
  '.ap-brand-fallback{display:inline-flex;align-items:center;font-weight:800;line-height:1.1;color:var(--green,#222);max-width:14em;overflow-wrap:anywhere}' +
  // Fundo claro com um toque das cores da loja: os títulos dos modelos são escuros e ficam legíveis sobre ele.
  '.ap-banner-fallback{background:#f1f5f9!important;background:linear-gradient(135deg,color-mix(in srgb,var(--green,#555) 12%,#fff),color-mix(in srgb,var(--red,#999) 16%,#fff))!important;min-height:clamp(180px,32vw,340px)}' +
  '.ap-banner-fallback>img[data-ap="banner"]{display:none!important}';

function insertBefore(el, node) {
  el.parentNode.insertBefore(node, el);
  track(() => node.remove());
}
function addClass(el, name) {
  el.classList.add(name);
  track(() => el.classList.remove(name));
}

export function resetAppearance(doc = document) {
  while (touched.length) touched.pop()();
  doc.documentElement.removeAttribute('data-appearance');
  doc.documentElement.removeAttribute('data-store-mode');
}

// ctx.storeId: obrigatório para aceitar imagens.
// ctx.imageURL(path): monta a URL pública (Storage).
// ctx.localImages: { logoPath, bannerPath } com URLs blob: (somente na prévia do painel).
export function applyAppearance(doc, templateId, rawConfig, ctx = {}) {
  const template = findTemplate(templateId);
  if (!template) return null;
  resetAppearance(doc);
  const config = validateAppearance(rawConfig || {}, { storeId: ctx.storeId });
  const root = doc.documentElement;
  const texts = config.texts || {};
  const colors = config.colors || {};
  const contact = config.contact || {};
  const images = config.images || {};

  for (const [name, value] of Object.entries(cssVariables(template.id, colors))) {
    const before = root.style.getPropertyValue(name);
    root.style.setProperty(name, value);
    track(() => { if (before) root.style.setProperty(name, before); else root.style.removeProperty(name); });
  }

  const all = selector => Array.from(doc.querySelectorAll(selector));
  // O app.js das vitrines reaplica window.VITRINE (cores, Instagram, nome, WhatsApp) quando carrega,
  // normalmente DEPOIS desta função. Por isso a configuração também é gravada ali; sem isso ele
  // sobrescreveria a personalização com os valores do arquivo do modelo.
  const vitrine = doc.defaultView?.VITRINE;
  const setVitrine = (key, value) => {
    if (!vitrine) return;
    const had = Object.hasOwn(vitrine, key), before = vitrine[key];
    vitrine[key] = value;
    track(() => { if (had) vitrine[key] = before; else delete vitrine[key]; });
  };
  if (colors.primary || colors.accent) setVitrine('colors', { ...(vitrine?.colors || {}), ...colors });

  if (texts.storeName) {
    all('[data-ap-textnode="storeName"]').forEach(el => setFirstTextNode(el, texts.storeName));
    setVitrine('name', texts.storeName);
  }
  for (const key of ['heroEyebrow', 'heroSubtitle', 'aboutText', 'footerTagline']) {
    if (texts[key]) all('[data-ap="' + key + '"]').forEach(el => setProp(el, 'textContent', texts[key]));
  }
  // Endereço e horários: até duas linhas, separadas por <br> criado aqui (nunca HTML vindo da configuração).
  for (const key of ['address', 'hours']) {
    if (!texts[key]) continue;
    all('[data-ap-lines="' + key + '"]').forEach(el => {
      const nodes = [];
      texts[key].split('\n').forEach((line, index) => {
        if (index) nodes.push(doc.createElement('br'));
        nodes.push(doc.createTextNode(line));
      });
      replaceChildren(el, nodes);
    });
  }

  // Título: London usa "linha 1 + destaque"; Lápis de Cor usa até duas linhas.
  if (texts.heroTitle || texts.heroHighlight) {
    all('[data-ap-hero]').forEach(el => {
      const lines = (texts.heroTitle ?? el.dataset.apDefaultTitle ?? el.textContent).split('\n');
      const nodes = [];
      if (el.dataset.apHero === 'highlight') {
        nodes.push(doc.createTextNode(lines.join(' ')));
        const highlight = texts.heroHighlight ?? el.dataset.apDefaultHighlight;
        if (highlight) {
          nodes.push(doc.createElement('br'));
          const em = doc.createElement('em');
          em.textContent = highlight;
          nodes.push(em);
        }
      } else {
        lines.forEach((line, index) => {
          if (index) nodes.push(doc.createElement('br'));
          nodes.push(doc.createTextNode(line));
        });
      }
      replaceChildren(el, nodes);
    });
  }

  if (contact.whatsapp) {
    all('[data-ap-href="whatsapp"]').forEach(el => setAttr(el, 'href', 'https://wa.me/' + contact.whatsapp));
    all('[data-ap-whatsapp-display]').forEach(el => setProp(el, 'textContent', formatWhatsApp(contact.whatsapp)));
    // Número informado por quem administra a loja: habilita o pedido direto pelo WhatsApp.
    setVitrine('whatsapp', contact.whatsapp);
    setVitrine('enableOrderWhatsApp', true);
  }
  if (contact.instagram) {
    all('[data-ap-href="instagram"]').forEach(el => setAttr(el, 'href', contact.instagram));
    setVitrine('instagram', contact.instagram);
  }

  if (contact.mapUrl) all('[data-ap-href="map"]').forEach(el => setAttr(el, 'href', contact.mapUrl));

  const resolve = key => {
    const local = ctx.localImages?.[key];
    if (local && SAFE_URL.test(local) && local.startsWith('blob:')) return local;
    return images[key] && ctx.imageURL ? ctx.imageURL(images[key]) : null;
  };
  for (const [key, kind] of [['logoPath', 'logo'], ['bannerPath', 'banner']]) {
    const url = resolve(key);
    if (!url) continue;
    all('[data-ap="' + kind + '"]').forEach(img => {
      setAttr(img, 'src', url);
      if (img.hasAttribute('srcset')) setAttr(img, 'srcset', url);
      const altName = texts.storeName || (config.options?.storeMode ? ctx.storeName : '');
      if (altName) setAttr(img, 'alt', kind === 'logo' ? 'Logo ' + altName : 'Banner ' + altName);
    });
  }
  if (config.options?.storeMode) {
    root.setAttribute('data-store-mode', '');
    const style = doc.createElement('style');
    style.textContent = STORE_MODE_CSS;
    doc.head.append(style);
    track(() => style.remove());
    // Nome exibido: o escolhido no editor ou, na falta dele, o da própria loja (nunca o do modelo).
    const name = texts.storeName || ctx.storeName || '';
    if (name) {
      all('[data-ap-textnode="storeName"]').forEach(el => setFirstTextNode(el, name));
      setVitrine('name', name);
      setProp(doc, 'title', name);
    }
    // Rótulos de acessibilidade com o nome da loja (os do modelo citam a loja de origem).
    const labels = { home: name + ', início', back: name + ', voltar ao início', instagram: 'Instagram de ' + name + ', abre em nova aba' };
    if (name) all('[data-ap-label]').forEach(el => { const text = labels[el.dataset.apLabel]; if (text) setAttr(el, 'aria-label', text); });
    // Fallbacks: sem logotipo, mostra o nome da loja em texto; sem banner, um fundo com as cores da loja.
    // Assim o logotipo e o banner do modelo (que trazem a marca da loja de origem) nunca aparecem em outra loja.
    if (!resolve('logoPath')) {
      all('img[data-ap="logo"]').forEach(img => {
        setAttr(img, 'hidden', '');
        if (!name || img.hasAttribute('data-ap-name-beside')) return;
        const label = doc.createElement('span');
        label.className = 'ap-brand-fallback';
        label.textContent = name;
        insertBefore(img, label);
      });
    }
    // Textos que são da loja de origem e não foram preenchidos: ocultos, nunca exibidos como se fossem desta loja.
    for (const key of template.originTexts || []) {
      if (texts[key]) continue;
      all('[data-ap="' + key + '"],[data-ap-lines="' + key + '"]').forEach(el => setAttr(el, 'hidden', ''));
    }
    // app.js reaplica estes valores do window.VITRINE (da loja de origem): em modo loja, sem valor próprio, ficam vazios.
    if (!contact.instagram) setVitrine('instagram', '');
    if (!contact.whatsapp) { setVitrine('whatsapp', ''); setVitrine('enableOrderWhatsApp', false); }
    if (!contact.mapUrl) all('[data-ap-href="map"]').forEach(el => setAttr(el, 'hidden', ''));
    if (!contact.instagram) all('[data-ap-href="instagram"]').forEach(el => setAttr(el, 'hidden', ''));
    if (!contact.whatsapp) all('[data-ap-href="whatsapp"]').forEach(el => setAttr(el, 'hidden', ''));
    const description = doc.querySelector('meta[name="description"]');
    if (description && name) setAttr(description, 'content', name);
    if (!resolve('bannerPath')) {
      all('img[data-ap="banner"]').forEach(img => { addClass(img.parentElement, 'ap-banner-fallback'); });
    }
  }
  root.setAttribute('data-appearance', 'custom');
  return config;
}
