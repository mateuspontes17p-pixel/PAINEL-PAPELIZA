// Editor visual: aba "Aparência" do painel. Carrega depois do login (observa #authenticated-panel).
// Fluxo: editar -> prévia ao vivo (iframe, sem salvar) -> Salvar rascunho -> Publicar -> Restaurar versão.
// Autorização e validação definitivas ficam no banco; este módulo só guia a pessoa e evita erros óbvios.
import { TEMPLATES, findTemplate, validateAppearance, canPublishTemplate, contrastRatio, normalizeWhatsApp, formatWhatsApp, TEXT_LABELS } from './template-registry.js';
import { loadAppearance, loadHistory, saveDraft, publish, restore, uploadBrandImage, UNAVAILABLE, MAX_IMAGE_BYTES } from './appearance-api.js';

const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const TEXT_FIELDS = ['storeName', 'heroEyebrow', 'heroTitle', 'heroHighlight', 'heroSubtitle', 'aboutText', 'address', 'hours', 'footerTagline'];
const IMAGE_KEYS = ['logoPath', 'bannerPath'];
const IMAGE_INPUT = { logoPath: 'ap-logo', bannerPath: 'ap-banner' };
const IMAGE_CLEAR = { logoPath: 'ap-clear-logo', bannerPath: 'ap-clear-banner' };

const state = {
  row: null, history: [], templateId: null, available: true, busy: false,
  images: {}, files: {}, urls: {}, snapshot: '', confirmTimer: 0, ready: false, lastValid: { version: 1 }, started: false
};

const store = () => window.PAPELIZA_STORE;
const template = () => findTemplate(state.templateId);
const dateText = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';
const say = text => { $('ap-message').textContent = text || ''; };

function explain(error) {
  if (error?.code === UNAVAILABLE) return 'O recurso de aparência ainda não foi ativado no banco de dados. A prévia funciona, mas salvar e publicar ficam disponíveis após a ativação.';
  if (error?.code === 'conflict') return error.message;
  if (error?.code === '42501' || error?.status === 403) return 'Seu acesso não permite esta ação. Entre novamente ou peça a liberação da loja.';
  if (error?.code === '23514') return 'O servidor recusou algum valor. Revise as cores, os textos e o contato.';
  return error instanceof Error && error.message ? error.message : 'Não foi possível concluir. Confira a conexão e tente novamente.';
}

// ---------- leitura e validação do formulário ----------
function readForm() {
  const raw = { version: 1 };
  const colors = {};
  for (const key of ['primary', 'accent']) { const v = $('ap-' + key).value.trim(); if (v) colors[key] = v; }
  if (Object.keys(colors).length) raw.colors = colors;
  const texts = {};
  for (const key of TEXT_FIELDS) {
    if (!template()?.fields.includes(key)) continue;
    const v = $('ap-' + key).value;
    if (v.trim()) texts[key] = v;
  }
  if (Object.keys(texts).length) raw.texts = texts;
  const contact = {};
  const whatsapp = $('ap-whatsapp').value.trim();
  if (whatsapp) contact.whatsapp = normalizeWhatsApp(whatsapp);
  const instagram = $('ap-instagram').value.trim();
  if (instagram) contact.instagram = instagram;
  const mapUrl = $('ap-mapUrl').value.trim();
  if (mapUrl) contact.mapUrl = mapUrl;
  if (Object.keys(contact).length) raw.contact = contact;
  const images = {};
  for (const key of IMAGE_KEYS) if (state.images[key]) images[key] = state.images[key];
  if (Object.keys(images).length) raw.images = images;
  return raw;
}

function fieldId(field) {
  const map = { 'colors.primary': 'ap-primary', 'colors.accent': 'ap-accent', 'contact.whatsapp': 'ap-whatsapp', 'contact.instagram': 'ap-instagram', 'contact.mapUrl': 'ap-mapUrl', 'images.logoPath': 'ap-logo', 'images.bannerPath': 'ap-banner' };
  if (map[field]) return map[field];
  return field?.startsWith('texts.') ? 'ap-' + field.slice(6) : null;
}
function clearErrors() {
  $('ap-error').textContent = '';
  document.querySelectorAll('#ap-form [aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
}
// Retorna a configuração normalizada ou null (mostrando o erro junto ao campo).
function validated(showErrors = true) {
  const raw = readForm();
  try {
    const config = validateAppearance(raw, { storeId: store().id });
    if (showErrors) clearErrors();
    return config;
  } catch (error) {
    if (showErrors) {
      clearErrors();
      $('ap-error').textContent = error.message;
      const id = fieldId(error.field);
      if (id) { $(id)?.setAttribute('aria-invalid', 'true'); $(id)?.focus?.(); }
    }
    return null;
  }
}

// ---------- estado e interface ----------
function currentSnapshot() {
  const config = validated(false) || readForm();
  const pending = IMAGE_KEYS.filter(k => state.files[k]).join(',');
  return JSON.stringify({ t: state.templateId, c: config, p: pending });
}
const isDirty = () => state.snapshot !== currentSnapshot();
const savedPublishedSame = () => state.row && state.row.publishedVersion > 0 && state.row.publishedTemplateId === state.row.draftTemplateId
  && JSON.stringify(state.row.published) === JSON.stringify(state.row.draft);

function renderState() {
  const dirty = isDirty();
  let text;
  if (!state.available) text = 'Recurso ainda não ativado no banco';
  else if (dirty) text = 'Alterações não salvas';
  else if (!state.row) text = 'Sem personalização';
  else if (savedPublishedSame()) text = 'Publicado · versão ' + state.row.publishedVersion;
  else text = 'Rascunho salvo · não publicado';
  const chip = $('ap-state');
  chip.textContent = text;
  chip.dataset.tone = !state.available ? 'off' : dirty ? 'warn' : savedPublishedSame() ? 'ok' : 'info';
  const canWrite = state.available && !state.busy;
  const gate = canPublishTemplate(store().slug, state.templateId);
  $('ap-save').disabled = !canWrite || !dirty;
  $('ap-discard').disabled = state.busy || !dirty;
  $('ap-publish').disabled = !canWrite || !gate || (!dirty && (!state.row || savedPublishedSame()));
  $('ap-publish').textContent = state.confirmTimer ? 'Confirmar publicação' : 'Publicar na vitrine';
  const note = $('ap-template-note');
  note.hidden = gate;
  note.textContent = gate ? '' : 'Prévia do layout de outra loja: o modelo ainda traz endereço, horários e contatos da loja original, por isso só pode ser publicado pela loja de origem. Você pode explorar e salvar como rascunho.';
  for (const key of IMAGE_KEYS) $(IMAGE_CLEAR[key]).hidden = !(state.images[key] || state.files[key]);
  document.querySelectorAll('#ap-form [data-needs-write]').forEach(n => { n.disabled = !canWrite; });
}

function applyTemplateUI() {
  const t = template();
  for (const key of TEXT_FIELDS) {
    const input = $('ap-' + key);
    input.placeholder = (t.defaults.texts[key] || '').replace(/\n/g, ' / ');
  }
  document.querySelectorAll('[data-ap-field]').forEach(row => { row.hidden = !t.fields.includes(row.dataset.apField); });
  $('ap-mapUrl').placeholder = t.defaults.contact.mapUrl;
  $('ap-whatsapp').placeholder = t.defaults.contact.whatsapp ? 'Padrão do modelo' : '(43) 99999-9999';
  $('ap-instagram').placeholder = t.defaults.contact.instagram;
  for (const key of ['primary', 'accent']) {
    const input = $('ap-' + key);
    input.placeholder = t.defaults.colors[key];
    $('ap-' + key + '-picker').value = HEX.test(input.value.trim()) ? input.value.trim() : t.defaults.colors[key];
  }
  $('ap-open').href = t.path;
  $('ap-open').hidden = false;
  updateContrast();
}
const HEX = /^#[0-9a-f]{6}$/i;
function updateContrast() {
  const t = template();
  const value = HEX.test($('ap-primary').value.trim()) ? $('ap-primary').value.trim() : t.defaults.colors.primary;
  const ratio = contrastRatio(value, '#ffffff');
  $('ap-contrast').textContent = ratio < 4.5
    ? `Contraste da cor principal com texto branco: ${ratio.toFixed(1)}:1. Abaixo de 4,5:1, botões e textos podem ficar difíceis de ler.`
    : `Contraste da cor principal com texto branco: ${ratio.toFixed(1)}:1 (adequado).`;
  $('ap-contrast').dataset.low = String(ratio < 4.5);
}

// ---------- prévia ----------
function frameSrc() {
  return `${template().path}?preview=1&loja=${encodeURIComponent(store().slug)}`;
}
function loadFrame() {
  const frame = $('ap-frame');
  state.ready = false;
  frame.src = frameSrc();
}
let previewTimer = 0;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(postPreview, 100);
}
function postPreview() {
  const config = validated(false);
  if (config) state.lastValid = config;
  if (!state.ready) return;
  const localImages = {};
  for (const key of IMAGE_KEYS) if (state.urls[key]) localImages[key] = state.urls[key];
  $('ap-frame').contentWindow?.postMessage({ type: 'papeliza:appearance', config: state.lastValid, localImages }, location.origin);
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== $('ap-frame')?.contentWindow || event.data?.type !== 'papeliza:preview-ready') return;
  state.ready = true;
  postPreview();
});

// ---------- dados <-> formulário ----------
function populate(row) {
  const t = findTemplate(row?.draftTemplateId) || findTemplate(store().slug === 'london-papelaria' ? 'london' : 'lapis-de-cor') || TEMPLATES[0];
  state.templateId = t.id;
  const config = row?.draft || {};
  for (const key of ['primary', 'accent']) {
    $('ap-' + key).value = config.colors?.[key] || '';
  }
  for (const key of TEXT_FIELDS) $('ap-' + key).value = config.texts?.[key] || '';
  $('ap-whatsapp').value = formatWhatsApp(config.contact?.whatsapp);
  $('ap-instagram').value = config.contact?.instagram || '';
  $('ap-mapUrl').value = config.contact?.mapUrl || '';
  state.images = { ...(config.images || {}) };
  releaseFiles();
  for (const radio of document.querySelectorAll('input[name="ap-template"]')) radio.checked = radio.value === t.id;
  clearErrors();
  applyTemplateUI();
  state.snapshot = currentSnapshot();
  renderState();
}
function releaseFiles() {
  for (const key of IMAGE_KEYS) { if (state.urls[key]) URL.revokeObjectURL(state.urls[key]); $(IMAGE_INPUT[key]).value = ''; }
  state.files = {}; state.urls = {};
}

function renderHistory() {
  const list = $('ap-history');
  list.replaceChildren();
  $('ap-history-empty').hidden = state.history.length > 0 || !state.available;
  for (const item of state.history) {
    const li = el('li');
    const info = el('div');
    info.append(el('strong', 'Versão ' + item.version), el('small', dateText(item.createdAt) + ' · ' + (findTemplate(item.templateId)?.name || item.templateId)));
    const button = el('button', 'Restaurar no rascunho');
    button.type = 'button';
    button.dataset.needsWrite = '';
    button.disabled = state.busy;
    button.onclick = () => run(async () => {
      await restore(store().id, item.version);
      await reload();
      say('Versão ' + item.version + ' carregada no rascunho. Publique para colocar no ar.');
    });
    li.append(info, button);
    list.append(li);
  }
}

async function reload() {
  try {
    state.available = true;
    state.row = await loadAppearance(store().id);
    state.history = state.row ? await loadHistory(store().id) : [];
  } catch (error) {
    if (error?.code !== UNAVAILABLE) throw error;
    state.available = false; state.row = null; state.history = [];
  }
  populate(state.row);
  renderHistory();
  loadFrame();
}

async function run(task, { quiet } = {}) {
  if (state.busy) return false;
  state.busy = true;
  window.PAPELIZA_CATALOG_BUSY = true;
  $('appearance-main').setAttribute('aria-busy', 'true');
  renderState();
  if (!quiet) say('Salvando…');
  try { await task(); return true; }
  catch (error) { say(explain(error)); return false; }
  finally {
    state.busy = false;
    window.PAPELIZA_CATALOG_BUSY = false;
    $('appearance-main').removeAttribute('aria-busy');
    renderHistory(); renderState();
  }
}

async function saveCurrent() {
  const config = validated();
  if (!config) return false;
  return run(async () => {
    const images = { ...(config.images || {}) };
    for (const key of IMAGE_KEYS) if (state.files[key]) images[key] = await uploadBrandImage(store().id, state.files[key]);
    const final = validateAppearance({ ...config, images }, { storeId: store().id });
    state.row = await saveDraft(store().id, { templateId: state.templateId, config: final }, state.row);
    populate(state.row);
    say('Rascunho salvo. Os visitantes ainda veem a versão publicada.');
  });
}

async function publishCurrent() {
  if (!canPublishTemplate(store().slug, state.templateId)) return;
  if (isDirty() && !(await saveCurrent())) return;
  const done = await run(async () => {
    const version = await publish(store().id);
    await reload();
    say('Publicado: versão ' + version + '. Visitantes veem a mudança ao abrir ou recarregar a vitrine.');
  });
  return done;
}

// ---------- eventos ----------
function bindColor(key) {
  const text = $('ap-' + key), picker = $('ap-' + key + '-picker');
  picker.addEventListener('input', () => { text.value = picker.value; changed(); });
  text.addEventListener('input', () => { if (HEX.test(text.value.trim())) picker.value = text.value.trim(); changed(); });
}
function changed() {
  updateContrast();
  schedulePreview();
  renderState();
}
function bindImage(key) {
  const input = $(IMAGE_INPUT[key]);
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      $('ap-error').textContent = 'Escolha JPEG, PNG ou WebP de até 1 MB.';
      input.value = '';
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = url; });
    } catch { URL.revokeObjectURL(url); $('ap-error').textContent = 'Não foi possível ler esta imagem.'; input.value = ''; return; }
    if (state.urls[key]) URL.revokeObjectURL(state.urls[key]);
    state.files[key] = file; state.urls[key] = url;
    clearErrors();
    changed();
  });
  $(IMAGE_CLEAR[key]).addEventListener('click', () => {
    if (state.urls[key]) URL.revokeObjectURL(state.urls[key]);
    delete state.files[key]; delete state.urls[key]; delete state.images[key];
    input.value = '';
    changed();
    say('A imagem do modelo será usada. A prévia mostra o resultado ao recarregar.');
    loadFrame();
  });
}

function buildTemplates() {
  const box = $('ap-templates');
  box.replaceChildren();
  for (const t of TEMPLATES) {
    const label = el('label', undefined, 'ap-template');
    const radio = el('input');
    radio.type = 'radio'; radio.name = 'ap-template'; radio.value = t.id; radio.dataset.needsWrite = '';
    const body = el('span');
    const own = t.nativeStore === store().slug;
    body.append(el('strong', t.name + (own ? ' · atual da loja' : '')), el('small', t.description));
    label.append(radio, body);
    radio.addEventListener('change', () => {
      state.templateId = t.id;
      applyTemplateUI();
      loadFrame();
      renderState();
    });
    box.append(label);
  }
}

function setDevice(device) {
  $('ap-frame-wrap').dataset.device = device;
  $('ap-desktop').setAttribute('aria-pressed', String(device === 'desktop'));
  $('ap-mobile').setAttribute('aria-pressed', String(device === 'mobile'));
}

function route() {
  const appearance = location.hash === '#aparencia';
  $('catalog-main').hidden = appearance;
  $('appearance-main').hidden = !appearance;
  document.querySelectorAll('nav a[data-view]').forEach(link => {
    const current = appearance ? link.dataset.view === 'appearance' : link.dataset.view === 'catalog' && (link.getAttribute('href') === (location.hash || '#produtos'));
    if (current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (appearance && !state.started) { state.started = true; start(); }
}

async function start() {
  $('appearance-store-label').textContent = 'APARÊNCIA · ' + store().name;
  const mirror = $('store-select-appearance'), original = $('store-select');
  mirror.replaceChildren(...[...original.options].map(o => new Option(o.text, o.value)));
  mirror.value = original.value;
  mirror.disabled = original.options.length <= 1;
  mirror.onchange = () => { original.value = mirror.value; original.onchange?.(); };
  buildTemplates();
  say('Carregando aparência…');
  try { await reload(); say(''); } catch (error) { populate(null); loadFrame(); say(explain(error)); }
  renderState();
  if (!state.available) say(explain({ code: UNAVAILABLE }));
}

function init() {
  const form = $('ap-form');
  form.addEventListener('submit', event => event.preventDefault());
  for (const key of ['primary', 'accent']) bindColor(key);
  for (const key of IMAGE_KEYS) bindImage(key);
  for (const field of [...TEXT_FIELDS, 'whatsapp', 'instagram', 'mapUrl']) $('ap-' + field).addEventListener('input', changed);
  $('ap-reset-colors').addEventListener('click', () => {
    $('ap-primary').value = ''; $('ap-accent').value = '';
    applyTemplateUI(); changed(); loadFrame();
  });
  $('ap-clear').addEventListener('click', () => {
    for (const id of ['primary', 'accent', ...TEXT_FIELDS, 'whatsapp', 'instagram', 'mapUrl']) $('ap-' + id).value = '';
    releaseFiles(); state.images = {};
    applyTemplateUI(); changed(); loadFrame();
    say('Personalização removida do formulário. Salve e publique para aplicar à vitrine.');
  });
  $('ap-save').addEventListener('click', () => { saveCurrent(); });
  $('ap-discard').addEventListener('click', () => { populate(state.row); loadFrame(); say('Alterações descartadas.'); });
  $('ap-publish').addEventListener('click', () => {
    if (state.busy || $('ap-publish').disabled) return;
    if (!state.confirmTimer) {
      // Confirmação em duas etapas, sem janela modal: o botão pede novo clique por 6 segundos.
      state.confirmTimer = setTimeout(() => { state.confirmTimer = 0; renderState(); }, 6000);
      say('Publicar muda a vitrine de ' + store().name + ' para todos os visitantes. Clique em "Confirmar publicação" para continuar.');
      renderState();
      return;
    }
    clearTimeout(state.confirmTimer); state.confirmTimer = 0;
    publishCurrent();
  });
  $('ap-desktop').addEventListener('click', () => setDevice('desktop'));
  $('ap-mobile').addEventListener('click', () => setDevice('mobile'));
  $('ap-frame').addEventListener('load', () => { state.ready = false; });
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', event => { if (state.started && isDirty()) { event.preventDefault(); event.returnValue = ''; } });
  route();
}

// Aguarda o login (auth.js define PAPELIZA_STORE e revela o painel) antes de ligar o editor.
let initialized = false;
function maybeInit() {
  if (initialized || $('authenticated-panel').hidden || !window.PAPELIZA_STORE) return;
  initialized = true;
  init();
}
new MutationObserver(maybeInit).observe($('authenticated-panel'), { attributes: true, attributeFilter: ['hidden'] });
maybeInit();

export { TEXT_LABELS };
