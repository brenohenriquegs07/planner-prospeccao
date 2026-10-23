// Renova o token de longa duração do Instagram (mais 60 dias) e mostra o novo na tela.
// O token precisa ter pelo menos 24 horas e ainda não ter expirado.
// Uso: npm run renovar-token   (lê IG_ACCESS_TOKEN do .env ou do ambiente)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(RAIZ, '.env')); } catch { }

const token = process.env.IG_ACCESS_TOKEN;
if (!token) { console.error('ERRO: defina IG_ACCESS_TOKEN no .env ou no ambiente.'); process.exit(1); }

const url = new URL('https://graph.instagram.com/refresh_access_token');
url.search = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
const r = await fetch(url);
const json = await r.json().catch(() => ({}));
if (!r.ok || json.error) { console.error('ERRO ao renovar:', json.error?.message || `HTTP ${r.status}`); process.exit(1); }

const expira = new Date(Date.now() + json.expires_in * 1000);
console.log('Novo token (copie para o .env e para o Secret IG_ACCESS_TOKEN no GitHub):\n');
console.log(json.access_token);
console.log(`\nVálido até ${expira.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`);
