import {client,imageURL} from './supabase-client.js';
import {demoProductImage} from './demo-product-images.js';
const store=()=>window.PAPELIZA_STORE.id;
export function productFromRow(p){return {id:p.id,name:p.name,detail:p.detail,category:p.category,priceCents:p.price_cents,image:p.image_path?imageURL(p.image_path):demoProductImage(p,p.store_id),imagePath:p.image_path,imageIndex:p.image_index,tag:p.tag,visible:p.visible,available:p.available,archived:p.archived,updatedAt:p.updated_at}}
function check(result){if(result.error)throw result.error;return result.data}
export async function loadCatalog(){
 const [cats,products]=await Promise.all([
  client.from('catalog_categories').select('name').eq('store_id',store()).order('created_at').order('name'),
  client.from('catalog_products').select('*').eq('store_id',store()).order('created_at').order('id')
 ]);
 return {categories:check(cats).map(c=>c.name),products:check(products).map(productFromRow)};
}
export async function saveProduct(p,previous){
 const row={store_id:store(),id:p.id,name:p.name,detail:p.detail,category:p.category,price_cents:p.priceCents,image_path:p.imagePath||null,image_index:p.imageIndex??0,tag:p.tag||'',visible:p.visible,available:p.available,archived:p.archived};
 const query=previous?client.from('catalog_products').update(row).eq('store_id',store()).eq('id',p.id).eq('updated_at',previous.updatedAt):client.from('catalog_products').insert(row);
 const saved=check(await query.select('id'));
 if(saved.length!==1)throw Error('Este produto mudou em outra aba. Atualize o catálogo antes de editar novamente.');
}
export async function addCategory(name){check(await client.from('catalog_categories').insert({store_id:store(),name}))}
export async function renameCategory(old,name){const rows=check(await client.from('catalog_categories').update({name}).eq('store_id',store()).eq('name',old).select('name'));if(rows.length!==1)throw Error('A categoria mudou. Atualize o catálogo.')}
export async function deleteCategory(name){const rows=check(await client.from('catalog_categories').delete().eq('store_id',store()).eq('name',name).select('name'));if(rows.length!==1)throw Error('A categoria mudou. Atualize o catálogo.')}
export async function uploadPhoto(file){
 const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
 if(!ext||file.size>1048576)throw Error('Escolha JPEG, PNG ou WebP de até 1 MB.');
 const path=store()+'/'+crypto.randomUUID()+'.'+ext;
 check(await client.storage.from('catalog-images').upload(path,file,{contentType:file.type,upsert:false}));
 return {path,url:imageURL(path)};
}
export async function discardPhoto(path){check(await client.storage.from('catalog-images').remove([path]))}
