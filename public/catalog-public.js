import {URL,KEY,imageURL} from './supabase-client.js';
const headers={apikey:KEY,Authorization:'Bearer '+KEY};
async function read(path){const response=await fetch(URL+'/rest/v1/'+path,{headers,cache:'no-store'});if(!response.ok)throw Error('catalog-unavailable');return response.json()}
function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s)})}
export async function startCatalog({slug,appScript,layoutScript}){
 const cfg=window.VITRINE;cfg.id=slug+'-online';cfg.products=[];
 if(cfg.presentation){cfg.presentation.enabled=false;cfg.presentation.popupEnabled=false}
 const retry=document.getElementById('retry-catalog');retry.onclick=()=>location.reload();retry.disabled=true;document.getElementById('catalog-error').hidden=true;
 try{
  const stores=await read('stores?slug=eq.'+encodeURIComponent(slug)+'&select=id,name');if(stores.length!==1)throw Error('store-unavailable');
  const id=encodeURIComponent(stores[0].id);
  const [products,categories]=await Promise.all([read('catalog_products?store_id=eq.'+id+'&select=id,name,detail,category,price_cents,image_path,image_index,tag,available&order=created_at,id'),read('catalog_categories?store_id=eq.'+id+'&select=name&order=created_at,name')]);
  cfg.products=products.map(p=>({id:p.id,name:p.name,detail:p.detail,category:p.category,priceCents:p.price_cents,image:p.image_path?imageURL(p.image_path):p.image_index,tag:p.tag,available:p.available}));
  document.querySelector('.filters').replaceChildren(...['Todos',...categories.map(c=>c.name)].map(c=>{const b=document.createElement('button');b.textContent=c;b.dataset.filter=c;b.setAttribute('aria-pressed',String(c==='Todos'));b.classList.toggle('active',c==='Todos');return b}));
  const tiles=document.querySelector('.category-list');
  if(tiles)tiles.replaceChildren(...categories.map((c,i)=>{const b=document.createElement('button');b.className='category-tile';b.dataset.category=c.name;const pic=document.createElement('span');pic.className='category-product sprite '+['photo-notebook','photo-pens','photo-case','photo-gift'][i%4];pic.setAttribute('aria-hidden','true');const text=document.createElement('strong');text.textContent=c.name;b.append(pic,text);return b}));
  const gifts=document.getElementById('show-gifts');if(gifts)gifts.closest('section').hidden=!categories.some(c=>c.name==='Presentes');
  await script(appScript);if(layoutScript)await script(layoutScript);
 }catch{document.getElementById('catalog-error').hidden=false;document.getElementById('results').textContent='Catálogo temporariamente indisponível.';retry.disabled=false}
}
