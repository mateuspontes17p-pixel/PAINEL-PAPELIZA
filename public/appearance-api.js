// Acesso ao Supabase para a aparência da vitrine. A autorização real está nas políticas RLS e nas
// funções do banco (database/storefront-appearance.sql); aqui só montamos as chamadas.
import { client, imageURL } from './supabase-client.js';

export const UNAVAILABLE = 'appearance-unavailable';
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_IMAGE_BYTES = 1048576;

function check(result) {
  if (result.error) {
    // PGRST205/42P01: a migração database/storefront-appearance.sql ainda não foi aplicada.
    if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(result.error.code) || result.error.status === 404) {
      const error = new Error(UNAVAILABLE);
      error.code = UNAVAILABLE;
      throw error;
    }
    throw result.error;
  }
  return result.data;
}

export const rowFromDb = row => row && ({
  storeId: row.store_id,
  draftTemplateId: row.draft_template_id,
  draft: row.draft || {},
  publishedTemplateId: row.published_template_id,
  published: row.published || {},
  publishedVersion: row.published_version,
  publishedAt: row.published_at,
  updatedAt: row.updated_at
});

export async function loadAppearance(storeId) {
  const row = check(await client.from('storefront_appearance').select('*').eq('store_id', storeId).maybeSingle());
  return rowFromDb(row);
}

export async function loadHistory(storeId) {
  return check(await client.from('storefront_appearance_history').select('version,template_id,created_at,config')
    .eq('store_id', storeId).order('version', { ascending: false }).limit(20))
    .map(h => ({ version: h.version, templateId: h.template_id, createdAt: h.created_at, config: h.config }));
}

// previous = linha carregada (ou null na primeira gravação). Conflito: outra aba alterou o rascunho.
export async function saveDraft(storeId, { templateId, config }, previous) {
  if (!previous) {
    const rows = check(await client.from('storefront_appearance')
      .insert({ store_id: storeId, draft_template_id: templateId, draft: config }).select('*'));
    return rowFromDb(rows[0]);
  }
  const rows = check(await client.from('storefront_appearance')
    .update({ draft_template_id: templateId, draft: config })
    .eq('store_id', storeId).eq('updated_at', previous.updatedAt).select('*'));
  if (rows.length !== 1) {
    const error = new Error('A aparência foi alterada em outra aba ou por outra pessoa. Recarregue antes de salvar.');
    error.code = 'conflict';
    throw error;
  }
  return rowFromDb(rows[0]);
}

export async function publish(storeId) {
  return check(await client.rpc('publish_appearance', { p_store: storeId }));
}

export async function restore(storeId, version) {
  return check(await client.rpc('restore_appearance', { p_store: storeId, p_version: version }));
}

// Mesma pasta de fotos de produtos (bucket catalog-images, políticas por loja), subpasta branding/.
export async function uploadBrandImage(storeId, file) {
  const ext = IMAGE_TYPES[file.type];
  if (!ext || file.size > MAX_IMAGE_BYTES) throw new Error('Escolha JPEG, PNG ou WebP de até 1 MB.');
  const path = `${storeId}/branding/${crypto.randomUUID()}.${ext}`;
  check(await client.storage.from('catalog-images').upload(path, file, { contentType: file.type, upsert: false }));
  return path;
}

export { imageURL };
