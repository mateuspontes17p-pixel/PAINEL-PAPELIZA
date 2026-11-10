const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(tag='div'){this.tag=tag;this.value='';this.children=[];this.dataset={};this.style={};this.disabled=false;this.hidden=false;this.checked=false;this.attributes={};this.files=[]}
 get options(){return this.children} append(...nodes){this.children.push(...nodes)} replaceChildren(...nodes){this.children=[...nodes]}
 setAttribute(k,v){this.attributes[k]=v} removeAttribute(k){delete this.attributes[k]} addEventListener(){} reset(){} showModal(){this.open=true} close(){this.open=false} click(){return this.onclick?.({preventDefault(){}})}
}
const elements={},get=id=>elements[id]??=new Element();
const document={getElementById:get,createElement:tag=>new Element(tag)};
let backend={categories:['Cadernos'],products:[]},failSave=false,failLoad=false;
const copy=v=>structuredClone(v);
const context={document,Error,window:{PAPELIZA_STORE:{id:'store'},PAPELIZA_USER_ID:'user'},localStorage:{getItem:()=>null},URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},Blob,crypto:require('node:crypto').webcrypto,Intl,structuredClone,Option:function(text,value){const o=new Element('option');o.textContent=text;o.value=value;return o},setTimeout,
 loadCatalog:async()=>{if(failLoad)throw Error('Offline');return copy(backend)},
 saveProduct:async(record,previous)=>{if(failSave)throw Error('Falha de conexão');const p={...record,image:record.imagePath?'https://example.com/image.jpg':record.imageIndex,updatedAt:'revision'};if(previous)backend.products[backend.products.findIndex(p=>p.id===record.id)]=p;else backend.products.push(p)},
 addCategory:async name=>backend.categories.push(name),renameCategory:async()=>{},deleteCategory:async()=>{},uploadPhoto:async()=>{throw Error('Unexpected upload')}
};
vm.runInNewContext(fs.readFileSync('public/painel.js','utf8').replace(/^import[^\n]+\n/,''),context);
const tick=()=>new Promise(resolve=>setImmediate(resolve)),event={preventDefault(){}};
(async()=>{
 await tick();assert.equal(get('new').disabled,false);assert.equal(get('total').textContent,0);
 get('new').click();assert.equal(get('editor').open,true);
 get('name').value='Caderno de teste';get('detail').value='Produto demonstrativo';get('category').value='Cadernos';get('price').value='24,90';get('is-visible').checked=true;get('is-available').checked=true;
 await get('product-form').onsubmit(event);assert.equal(backend.products[0].priceCents,2490);assert.equal(get('editor').open,false);assert.equal(get('total').textContent,1);
 const actions=get('rows').children[0].children[4].children[0].children;
 actions[1].click();await tick();assert.equal(backend.products[0].visible,false);
 get('rows').children[0].children[4].children[0].children[0].click();get('price').value='1.234,56';await get('product-form').onsubmit(event);assert.match(get('form-error').textContent,/preço válido/);assert.equal(backend.products[0].priceCents,2490);
 get('price').value='30,00';failSave=true;await get('product-form').onsubmit(event);assert.equal(get('editor').open,true);assert.match(get('form-error').textContent,/Falha de conexão/);assert.equal(backend.products[0].priceCents,2490);assert.equal(get('product-form').inert,false);
 failSave=false;await get('product-form').onsubmit(event);assert.equal(backend.products[0].priceCents,3000);assert.equal(get('editor').open,false);
 assert.equal(get('category-list').children[0].children[3].disabled,true);
 failLoad=true;await get('refresh').click();assert.equal(get('total').textContent,1);assert.match(get('status').textContent,/Offline/);
 console.log('PASS: online load, price in cents, publish/hide, save failures preserve editor, retry, used category protection, offline preserves current view.');
})().catch(e=>{console.error(e);process.exitCode=1});
