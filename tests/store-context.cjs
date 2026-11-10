const assert=require('node:assert/strict');
(async()=>{
 const {chooseStore,storefrontPath}=await import('../public/store-context.js');
 const london={id:'london',slug:'london-papelaria',name:'London'},lapis={id:'lapis',slug:'lapis-de-cor',name:'Lápis'};
 assert.equal(chooseStore([london,lapis],'london-papelaria','lapis-de-cor'),london);
 assert.equal(chooseStore([lapis],'london-papelaria','lapis-de-cor'),null);
 assert.equal(chooseStore([london,lapis],null,'london-papelaria'),london);
 assert.equal(chooseStore([london,lapis],null,'unauthorized'),lapis);
 assert.equal(chooseStore([london],null,'lapis-de-cor'),london);
 assert.equal(chooseStore([],null,null),null);
 assert.equal(storefrontPath('london-papelaria'),'london/index.html');
 assert.equal(storefrontPath('lapis-de-cor'),'vitrine/index.html');
 assert.equal(storefrontPath('unconfigured'),null);
 assert.equal(storefrontPath('__proto__'),null);
 console.log('PASS: explicit store selection, remembered store, unauthorized route denied, single-store and multi-store accounts.');
})().catch(e=>{console.error(e);process.exitCode=1});
