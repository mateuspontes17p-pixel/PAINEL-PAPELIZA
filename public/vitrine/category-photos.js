const normalize=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
const photos={
 'cadernos':'cadernos',
 'escrita':'canetas',
 'acessorios':'estojos',
 'presentes':'agendas-planners',
 'lapis':'lapis',
 'materiais juliana utrera':'organizadores'
};
export function applyCategoryPhotos(){
 if(!document.getElementById('catalog-error')?.hidden)return;
 for(const button of document.querySelectorAll('.category-list [data-category]')){
  if(button.querySelector('img'))continue;
  const asset=photos[normalize(button.dataset.category)]||'organizadores';
  const image=document.createElement('img');image.className='category-photo';image.alt='';image.width=128;image.height=128;image.loading='lazy';image.decoding='async';
  const source=new URL(`assets/categorias/${asset}-v1.png`,import.meta.url);
  const local=location.protocol==='file:'||['localhost','127.0.0.1','::1'].includes(location.hostname);
  image.onerror=()=>{image.onerror=null;image.src=source.href};
  image.src=local?source.href:`/.netlify/images?url=${encodeURIComponent(source.pathname)}&w=320&h=320&fit=cover&fm=webp&q=82`;
  const old=button.querySelector('.category-product');if(old)old.replaceWith(image);else button.prepend(image);
 }
}
