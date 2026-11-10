'use strict';
(()=>{
const cfg=window.VITRINE,p=cfg.presentation,$=id=>document.getElementById(id),strip=$('campanha'),dialog=$('activation-dialog');
strip.hidden=!p.enabled;
const number=p.activationWhatsApp,contact=dialog.querySelector('.demo-activate');
const valid=/^\d{10,15}$/.test(number);
contact.hidden=!valid;if(valid)contact.href='https://wa.me/'+number+'?text='+encodeURIComponent('Olá! Vi a demonstração da '+cfg.name+' e quero combinar a ativação da vitrine.');
if(!p.enabled)return;
const end=Date.parse(p.endAt);if(!Number.isFinite(end)){strip.hidden=true;return;}
$('countdown-note').textContent='Até '+new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(end))+' · Brasília';
function tick(){const left=Math.max(0,Math.floor((end-Date.now())/1000));const u=[Math.floor(left/86400),Math.floor(left/3600)%24,Math.floor(left/60)%60,left%60];['days','hours','minutes','seconds'].forEach((k,i)=>$('timer-'+k).textContent=String(u[i]).padStart(2,'0'));if(!left){clearInterval(interval);$('demo-headline').textContent='O período de demonstração terminou.';$('demo-deadline-message').textContent='Fale com a gente para ativar sua vitrine e combinar os próximos passos.';$('countdown-label').textContent='Prazo encerrado';}}
const interval=setInterval(tick,1000);tick();
if(!p.popupEnabled||!valid)return;
let task,lastFocus;
function schedule(ms){clearTimeout(task);task=setTimeout(show,ms);}
function show(){if(document.hidden||document.querySelector('dialog[open]')){schedule(1000);return;}lastFocus=document.activeElement;dialog.showModal();}
dialog.addEventListener('close',()=>{lastFocus?.focus();if(p.popupRepeatSeconds>0)schedule(p.popupRepeatSeconds*1000);});
$('close-activation').addEventListener('click',()=>dialog.close());$('later-activation').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
schedule(p.popupDelaySeconds*1000);
})();
