// Catálogo de modelos visuais e contrato de aparência da PAPELIZA AI.
// O template define a ESTRUTURA; textos, cores, imagens e permissões pertencem à loja.
// Este módulo é puro (sem DOM, sem rede): é usado pelo painel, pelas vitrines e pelos testes.
// A mesma validação existe no banco (database/storefront-appearance.sql); o banco é a autoridade.

export const APPEARANCE_VERSION = 1;

export const TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'london',
    name: 'London',
    description: 'Hero amplo com banner de kit escolar, tom azul e vermelho.',
    nativeStore: 'london-papelaria',
    path: 'london/index.html',
    // Variáveis CSS que cada cor controla neste modelo.
    cssVars: Object.freeze({ primary: ['--green'], accent: ['--red'] }),
    defaults: Object.freeze({
      colors: { primary: '#07558a', accent: '#cf203c' },
      texts: {
        storeName: 'London Papelaria & Presentes Criativos',
        heroEyebrow: 'LONDON PAPELARIA',
        heroTitle: 'Novas ideias.',
        heroHighlight: 'Novas descobertas.',
        heroSubtitle: 'Kit escolar demonstrativo',
        aboutText: 'Esta proposta apresenta uma possibilidade de presença digital para a London Papelaria & Presentes Criativos, reunindo uma vitrine de produtos e uma forma simples de montar pedidos.',
        address: 'Av. Inglaterra, 639 · Loja 02\nIgapó · Londrina, PR',
        footerTagline: 'Papelaria & Presentes Criativos · Londrina, PR'
      },
      contact: { whatsapp: '5543996654884', instagram: 'https://www.instagram.com/londonpapelariaepresentes/', mapUrl: 'https://www.google.com/maps/search/?api=1&query=Avenida%20Inglaterra%20639%20Londrina%20PR' }
    }),
    fields: Object.freeze(['storeName', 'heroEyebrow', 'heroTitle', 'heroHighlight', 'heroSubtitle', 'aboutText', 'address', 'footerTagline'])
  }),
  Object.freeze({
    id: 'lapis-de-cor',
    name: 'Lápis de Cor',
    description: 'Cabeçalho com busca, categorias ilustradas, tom roxo e terracota.',
    nativeStore: 'lapis-de-cor',
    path: 'vitrine/index.html',
    cssVars: Object.freeze({ primary: ['--green'], accent: ['--red', '--red-light'] }),
    defaults: Object.freeze({
      colors: { primary: '#69509c', accent: '#c95b49' },
      texts: {
        storeName: 'Lápis de Cor',
        heroEyebrow: 'LÁPIS DE COR PAPELARIA',
        heroTitle: 'Material escolar\ne papelaria.',
        heroSubtitle: 'Cadernos, canetas e acessórios para os estudos e o trabalho. Veja os produtos e monte seu pedido pelo WhatsApp.',
        aboutText: 'Confira o endereço e os horários de atendimento.',
        address: 'Av. Higienópolis, 1387 — Boa Vista\nLondrina/PR',
        hours: 'Segunda a sexta · 9h às 18h\nSábado · 9h às 13h',
        footerTagline: 'Material escolar e de escritório · Londrina/PR'
      },
      contact: { whatsapp: '554399953336', instagram: 'https://www.instagram.com/lapisdecorpapelaria/', mapUrl: 'https://maps.app.goo.gl/SE1D8WGk5qQjX8FF6' }
    }),
    fields: Object.freeze(['storeName', 'heroEyebrow', 'heroTitle', 'heroSubtitle', 'aboutText', 'address', 'hours', 'footerTagline'])
  })
]);

export function findTemplate(id) {
  return TEMPLATES.find(template => template.id === id) || null;
}

// O modelo de outra loja carrega endereço, horários e contatos próprios no HTML.
// Enquanto esse conteúdo não for genérico, só a loja de origem pode PUBLICAR o modelo.
// A prévia de qualquer modelo continua liberada.
export function canPublishTemplate(storeSlug, templateId) {
  const template = findTemplate(templateId);
  return !!template && template.nativeStore === storeSlug;
}

export const TEXT_LIMITS = Object.freeze({ storeName: 80, heroEyebrow: 40, heroTitle: 80, heroHighlight: 80, heroSubtitle: 200, aboutText: 300, address: 120, hours: 120, footerTagline: 80 });
export const TEXT_LABELS = Object.freeze({
  storeName: 'Nome da loja', heroEyebrow: 'Chamada acima do título', heroTitle: 'Título principal',
  heroHighlight: 'Segunda linha em destaque', heroSubtitle: 'Subtítulo',
  aboutText: 'Texto "sobre a loja"', address: 'Endereço (até duas linhas)', hours: 'Horários (até duas linhas)', footerTagline: 'Frase do rodapé'
});
const HEX = /^#[0-9a-f]{6}$/i;
const MULTILINE = Object.freeze(['heroTitle', 'address', 'hours']);
const MAP_URL = /^https:\/\/(www\.google\.com\/maps[\w\-./?=&%+,@:!*]{0,250}|maps\.app\.goo\.gl\/[A-Za-z0-9]{4,40}|goo\.gl\/maps\/[A-Za-z0-9]{4,40}|maps\.google\.com\/[\w\-./?=&%+,@:!*]{0,250})$/;
const INSTAGRAM = /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const IMAGE_KEYS = Object.freeze({ logoPath: 'logo', bannerPath: 'banner' });

function fail(field, message) {
  const error = new Error(message);
  error.field = field;
  throw error;
}
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
function exactKeys(value, allowed, where) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(where, 'Campo não permitido: ' + key);
}

// Aceita números digitados com máscara. 10–11 dígitos são tratados como Brasil (DDD + número).
export function normalizeWhatsApp(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length <= 11 ? '55' + digits : digits;
}

// Exibição amigável de um número já normalizado: 5543996654884 -> (43) 99665-4884.
export function formatWhatsApp(digits) {
  const d = String(digits ?? '');
  const local = /^55\d{10,11}$/.test(d) ? d.slice(2) : '';
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return d ? '+' + d : '';
}

export function imagePathPattern(storeId) {
  return new RegExp('^' + storeId + '/branding/' + UUID + '\\.(png|jpg|webp)$', 'i');
}

export function emptyAppearance() {
  return { version: APPEARANCE_VERSION };
}

// Valida e normaliza. Campos vazios significam "usar o padrão do modelo" e são removidos.
// storeId é obrigatório para aceitar caminhos de imagem (cada loja só referencia a própria pasta).
export function validateAppearance(value, { storeId } = {}) {
  if (!isObject(value)) fail('config', 'Configuração inválida.');
  exactKeys(value, ['version', 'colors', 'texts', 'contact', 'images'], 'config');
  if (value.version !== undefined && value.version !== APPEARANCE_VERSION) fail('version', 'Versão de configuração não suportada.');
  const out = emptyAppearance();

  if (value.colors !== undefined) {
    if (!isObject(value.colors)) fail('colors', 'Cores inválidas.');
    exactKeys(value.colors, ['primary', 'accent'], 'colors');
    const colors = {};
    for (const key of ['primary', 'accent']) {
      const color = value.colors[key];
      if (color === undefined || color === null || color === '') continue;
      if (typeof color !== 'string' || !HEX.test(color)) fail('colors.' + key, 'Use cores no formato #RRGGBB.');
      colors[key] = color.toLowerCase();
    }
    if (Object.keys(colors).length) out.colors = colors;
  }

  if (value.texts !== undefined) {
    if (!isObject(value.texts)) fail('texts', 'Textos inválidos.');
    exactKeys(value.texts, Object.keys(TEXT_LIMITS), 'texts');
    const texts = {};
    for (const [key, max] of Object.entries(TEXT_LIMITS)) {
      let text = value.texts[key];
      if (text === undefined || text === null) continue;
      if (typeof text !== 'string') fail('texts.' + key, 'Texto inválido.');
      text = text.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).join('\n').trim();
      if (!text) continue;
      if (!MULTILINE.includes(key) && text.includes('\n')) fail('texts.' + key, 'Use uma única linha neste campo.');
      if (MULTILINE.includes(key) && text.split('\n').length > 2) fail('texts.' + key, TEXT_LABELS[key] + ': no máximo duas linhas.');
      if (text.length > max) fail('texts.' + key, TEXT_LABELS[key] + ': no máximo ' + max + ' caracteres.');
      if (/[<>]/.test(text) || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) fail('texts.' + key, TEXT_LABELS[key] + ': remova < > e caracteres de controle.');
      texts[key] = text;
    }
    if (Object.keys(texts).length) out.texts = texts;
  }

  if (value.contact !== undefined) {
    if (!isObject(value.contact)) fail('contact', 'Contato inválido.');
    exactKeys(value.contact, ['whatsapp', 'instagram', 'mapUrl'], 'contact');
    const contact = {};
    if (value.contact.whatsapp !== undefined && value.contact.whatsapp !== null && value.contact.whatsapp !== '') {
      if (typeof value.contact.whatsapp !== 'string') fail('contact.whatsapp', 'WhatsApp inválido.');
      const digits = normalizeWhatsApp(value.contact.whatsapp);
      if (!/^\d{10,15}$/.test(digits)) fail('contact.whatsapp', 'Informe o WhatsApp com DDD, por exemplo (43) 99999-9999.');
      contact.whatsapp = digits;
    }
    if (value.contact.instagram !== undefined && value.contact.instagram !== null && value.contact.instagram !== '') {
      const url = typeof value.contact.instagram === 'string' ? value.contact.instagram.trim() : '';
      if (!INSTAGRAM.test(url)) fail('contact.instagram', 'Use o endereço do perfil, por exemplo https://www.instagram.com/sualoja/.');
      contact.instagram = url;
    }
    if (value.contact.mapUrl !== undefined && value.contact.mapUrl !== null && value.contact.mapUrl !== '') {
      const url = typeof value.contact.mapUrl === 'string' ? value.contact.mapUrl.trim() : '';
      if (!MAP_URL.test(url)) fail('contact.mapUrl', 'Use um link do Google Maps (https://maps.app.goo.gl/... ou https://www.google.com/maps/...).');
      contact.mapUrl = url;
    }
    if (Object.keys(contact).length) out.contact = contact;
  }

  if (value.images !== undefined) {
    if (!isObject(value.images)) fail('images', 'Imagens inválidas.');
    exactKeys(value.images, Object.keys(IMAGE_KEYS), 'images');
    const images = {};
    for (const key of Object.keys(IMAGE_KEYS)) {
      const path = value.images[key];
      if (path === undefined || path === null || path === '') continue;
      if (typeof path !== 'string' || !storeId || !imagePathPattern(storeId).test(path)) fail('images.' + key, 'Imagem inválida ou de outra loja.');
      images[key] = path;
    }
    if (Object.keys(images).length) out.images = images;
  }
  return out;
}

// ---------- cores ----------
function rgb(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
}
function toHex(channels) {
  return '#' + channels.map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}
// amount 0 = cor original, 1 = branco
export function tint(hex, amount) {
  return toHex(rgb(hex).map(c => c + (255 - c) * amount));
}
// amount 0 = cor original, 1 = preto
export function shade(hex, amount) {
  return toHex(rgb(hex).map(c => c * (1 - amount)));
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Variáveis CSS a aplicar para as cores escolhidas. Sem cor escolhida, nada é aplicado
// e a vitrine mantém exatamente o visual original.
export function cssVariables(templateId, colors = {}) {
  const template = findTemplate(templateId);
  const vars = {};
  if (!template) return vars;
  if (colors.primary) {
    for (const name of template.cssVars.primary) vars[name] = colors.primary;
    vars['--green-dark'] = shade(colors.primary, 0.22);
    vars['--green-soft'] = tint(colors.primary, 0.92);
    vars['--blue-soft'] = tint(colors.primary, 0.93);
  }
  if (colors.accent) {
    for (const name of template.cssVars.accent) vars[name] = colors.accent;
    vars['--red-dark'] = shade(colors.accent, 0.22);
    vars['--pink'] = tint(colors.accent, 0.93);
  }
  return vars;
}
