// Imagens padrão dos produtos demonstrativos. Uma foto enviada pelo painel tem prioridade.
const storeId='e1419ffd-709d-4242-925b-16e2a005ca7f';
const categories='/vitrine/assets/categorias/';
const products='/vitrine/assets/produtos-demo/';
const illustrations={
 'demo-20261111-acessorios-01':categories+'estojos-v1.png',
 'demo-20261111-acessorios-02':categories+'organizadores-v1.png',
 'demo-20261111-acessorios-03':products+'blocos-adesivos-v1.png',
 'demo-20261111-cadernos-01':categories+'agendas-planners-v1.png',
 'demo-20261111-cadernos-02':categories+'cadernos-v1.png',
 'demo-20261111-cadernos-03':products+'caderno-azul-v1.png',
 'demo-20261111-escrita-01':categories+'canetas-v1.png',
 'demo-20261111-escrita-02':categories+'canetas-v1.png',
 'demo-20261111-escrita-03':products+'borrachas-v1.png',
 'demo-20261111-presentes-01':categories+'agendas-planners-v1.png',
 'demo-20261111-presentes-02':products+'desenho-pintura-v1.png',
 'demo-20261111-presentes-03':categories+'organizadores-v1.png',
 'demo-20261111-lapis-01':categories+'lapis-v1.png',
 'demo-20261111-lapis-02':products+'lapis-grafite-v1.png',
 'demo-20261111-lapis-03':products+'lapis-tradicional-v1.png',
 'demo-20261111-materiais-01':products+'caderno-azul-v1.png',
 'demo-20261111-materiais-02':categories+'organizadores-v1.png',
 'demo-20261111-materiais-03':categories+'canetas-v1.png'
};
export function demoProductImage(row,currentStoreId){
 const source=currentStoreId===storeId&&Object.hasOwn(illustrations,row.id)?illustrations[row.id]:null;
 if(!source)return row.image_index;
 const local=typeof location==='undefined'||location.protocol==='file:'||['localhost','127.0.0.1','::1'].includes(location.hostname);
 return local?source:`/.netlify/images?url=${encodeURIComponent(source)}&w=640&h=640&fit=cover&fm=webp&q=82`;
}
