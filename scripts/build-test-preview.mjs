// Gera uma CÓPIA de public/ apontada para um projeto Supabase de TESTES, pronta para publicar em um site de teste.
// O repositório não é alterado. Uso:
//   TEST_SUPABASE_URL=https://<ref>.supabase.co TEST_SUPABASE_KEY=<chave pública/publishable> node scripts/build-test-preview.mjs <pasta-de-saida>
// Recusa a URL/chave do projeto de produção e confere que a cópia não contém o ID de produção.
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'ipqawywfqydgyabcynbh';
const url = (process.env.TEST_SUPABASE_URL || '').replace(/\/$/, ''), key = process.env.TEST_SUPABASE_KEY || '';
const out = resolve(process.argv[2] || 'dist-test-preview');
if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) || !key) { console.error('Defina TEST_SUPABASE_URL (https://<ref>.supabase.co) e TEST_SUPABASE_KEY.'); process.exit(2); }
if (url.includes(PROD_REF) || key.includes(PROD_REF)) { console.error('RECUSADO: URL/chave do projeto de produção.'); process.exit(2); }
if (!/^(sb_publishable_|eyJ)/.test(key)) { console.error('RECUSADO: use apenas a chave PÚBLICA (sb_publishable_… ou anon). Nunca a service_role.'); process.exit(2); }
if (key.startsWith('eyJ')) { try { const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; if (role !== 'anon') throw new Error(role); } catch { console.error('RECUSADO: o JWT informado não é da role anon.'); process.exit(2); } }

const src = resolve(fileURLToPath(new URL('..', import.meta.url)), 'public');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true }); cpSync(src, out, { recursive: true });

const client = join(out, 'supabase-client.js');
let js = readFileSync(client, 'utf8');
js = js.replace(/export const URL='[^']*'/, `export const URL='${url}'`).replace(/export const KEY='[^']*'/, `export const KEY='${key}'`);
writeFileSync(client, js);

// Faixa fixa no painel para ninguém confundir com a produção.
const index = join(out, 'index.html');
writeFileSync(index, readFileSync(index, 'utf8').replace(/<body([^>]*)>/, '<body$1><div style="position:sticky;top:0;z-index:99999;background:#b45309;color:#fff;text-align:center;font:600 12px Arial;padding:6px">AMBIENTE DE TESTES · projeto Supabase PAINEL 2 · dados fictícios · não é a produção</div>'));

// Publicação estática sem build (a pasta de saída é a raiz do site), com os mesmos cabeçalhos de segurança do repositório.
writeFileSync(join(out, 'netlify.toml'), `[build]\n  publish = "."\n\n[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Content-Type-Options = "nosniff"\n    Referrer-Policy = "strict-origin-when-cross-origin"\n    X-Robots-Tag = "noindex, nofollow"\n`);

// Auditoria: nenhum arquivo da cópia pode citar o projeto de produção.
const leaks = [];
(function walk(dir) { for (const name of readdirSync(dir)) { const p = join(dir, name); statSync(p).isDirectory() ? walk(p) : readFileSync(p).toString('latin1').includes(PROD_REF) && leaks.push(p); } })(out);
if (leaks.length) { rmSync(out, { recursive: true, force: true }); console.error('RECUSADO: a cópia ainda cita o projeto de produção:\n' + leaks.join('\n')); process.exit(3); }
console.log(`Pronto: ${out}\nProjeto: ${url}\nReferências ao projeto de produção: 0`);
