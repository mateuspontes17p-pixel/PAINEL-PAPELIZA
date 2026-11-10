const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const {chooseStore,storefrontPath}=await import('../public/store-context.js');
 const stores=[{id:'lapis',name:'Lápis de Cor',slug:'lapis-de-cor'},{id:'london',name:'London Papelaria',slug:'london-papelaria'}];
 async function scenario(allowed,slug){
  const elements={},get=id=>elements[id]??={hidden:false,options:[],replaceChildren(...xs){this.options=xs}},links=[{},{}],names=[{}],scripts=[],memory=new Map();
  const location={href:'https://example.com/?loja='+slug,protocol:'https:',origin:'https://example.com',pathname:'/',assign(url){this.assigned=url}};
  const context={URL,Error,Option:function(name,slug){return {text:name,value:slug}},chooseStore,storefrontPath,location,history:{replaceState(a,b,url){location.href=url.href}},localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},window:{addEventListener(){}},document:{getElementById:get,querySelectorAll:q=>q==='[data-store-name]'?names:links,createElement:()=>({}),head:{append:s=>scripts.push(s)}},client:{auth:{getUser:async()=>({data:{user:{id:'user',email:'test@example.invalid'}}}),onAuthStateChange(){}},from:()=>({select:()=>({order:async()=>({data:allowed})})})},setTimeout};
  vm.runInNewContext(fs.readFileSync('public/auth.js','utf8').replace(/^import[^\n]+\r?\n/gm,''),context);await new Promise(r=>setImmediate(r));
  return {context,get,links,names,scripts};
 }
 const both=await scenario(stores,'london-papelaria');assert.equal(both.context.window.PAPELIZA_STORE.id,'london');assert.equal(both.get('store-select').options.length,2);assert.equal(both.get('store-select').value,'london-papelaria');assert.equal(both.links[0].href,'london/index.html');assert.equal(both.names[0].textContent,'London Papelaria');assert.equal(both.scripts.length,1);
 both.get('store-select').value='lapis-de-cor';both.get('store-select').onchange();assert.match(both.context.location.assigned,/loja=lapis-de-cor/);
 both.context.window.PAPELIZA_CATALOG_BUSY=true;both.context.location.assigned=null;both.get('store-select').value='lapis-de-cor';both.get('store-select').onchange();assert.equal(both.context.location.assigned,null);
 const denied=await scenario([stores[0]],'london-papelaria');assert.equal(denied.scripts.length,0);assert.match(denied.get('auth-status').textContent,/não tem acesso/);
 console.log('PASS: multi-store login initializes selected catalog and links; switching blocked during saves; unauthorized store does not load the panel.');
})().catch(e=>{console.error(e);process.exitCode=1});
