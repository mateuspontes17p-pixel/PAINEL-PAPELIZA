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

export function resetAppearance(doc = document) {
  while (touched.length) touched.pop()();
  doc.documentElement.removeAttribute('data-appearance');
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
  for (const key of ['heroEyebrow', 'heroSubtitle']) {
    if (texts[key]) all('[data-ap="' + key + '"]').forEach(el => setProp(el, 'textContent', texts[key]));
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
      if (texts.storeName) setAttr(img, 'alt', kind === 'logo' ? 'Logo ' + texts.storeName : 'Banner ' + texts.storeName);
    });
  }
  root.setAttribute('data-appearance', 'custom');
  return config;
}
