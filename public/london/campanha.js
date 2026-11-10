'use strict';
// Prazo fixo de 7 dias contado da configuração, sem reiniciar ao recarregar.
const DEMO_END = '2026-11-16T13:50:30-03:00';
(()=>{
const end=Date.parse(DEMO_END),$=id=>document.getElementById(id);if(!Number.isFinite(end))return;
function tick(){const remaining=Math.max(0,Math.floor((end-Date.now())/1000));const units=[Math.floor(remaining/86400),Math.floor(remaining/3600)%24,Math.floor(remaining/60)%60,remaining%60];['days','hours','minutes','seconds'].forEach((key,i)=>$('timer-'+key).textContent=String(units[i]).padStart(2,'0'));if(!remaining){clearInterval(interval);$('demo-headline').textContent='O período de demonstração terminou.';$('demo-deadline-message').textContent='Fale com a gente para ativar sua vitrine e combinar os próximos passos.';$('countdown-label').textContent='Prazo encerrado';$('countdown-note').textContent='Entre em contato para ativar';}}
const interval=setInterval(tick,1000);tick();
})();


// Primeiro convite após 60 segundos; nova abertura 60 segundos após fechar.
(()=>{
const dialog=document.getElementById('activation-dialog');let task,previousFocus;
function schedule(delay=60000){clearTimeout(task);task=setTimeout(show,delay);}
function show(){if(document.hidden||document.querySelector('dialog[open]')){schedule(1000);return;}previousFocus=document.activeElement;dialog.showModal();}
dialog.addEventListener('close',()=>{previousFocus?.focus();schedule();});
document.getElementById('close-activation').addEventListener('click',()=>dialog.close());
document.getElementById('later-activation').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
schedule();
})();
