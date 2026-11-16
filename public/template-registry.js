// Catálogo de modelos visuais da PAPELIZA AI.
// O template define a estrutura; os dados e permissões pertencem à loja.
export const TEMPLATES=Object.freeze([
  Object.freeze({id:'london',name:'London',preview:'/london/index.html',description:'Vitrine London Papelaria'}),
  Object.freeze({id:'lapis-de-cor',name:'Lápis de Cor',preview:'/vitrine/index.html',description:'Vitrine Lápis de Cor'})
]);
export function findTemplate(id){return TEMPLATES.find(template=>template.id===id)||null}
export function validateAppearance(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Configuração inválida');
  const out={};
  for(const field of ['primaryColor','secondaryColor']){
    if(value[field]!==undefined){
      if(typeof value[field]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(value[field]))throw Error('Cor inválida');
      out[field]=value[field];
    }
  }
  for(const field of ['storeTitle','heroTitle','heroSubtitle']){
    if(value[field]!==undefined){
      if(typeof value[field]!=='string'||value[field].trim().length>160)throw Error('Texto inválido');
      out[field]=value[field].trim();
    }
  }
  return out;
}
