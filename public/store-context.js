export function chooseStore(stores,requested,remembered){
 if(!Array.isArray(stores)||!stores.length)return null;
 if(requested)return stores.find(s=>s.slug===requested)||null;
 return stores.find(s=>s.slug===remembered)||stores.find(s=>s.slug==='lapis-de-cor')||stores[0];
}
export function storefrontPath(slug){
 const routes={'lapis-de-cor':'vitrine/index.html','london-papelaria':'london/index.html'};
 return Object.hasOwn(routes,slug)?routes[slug]:null;
}
