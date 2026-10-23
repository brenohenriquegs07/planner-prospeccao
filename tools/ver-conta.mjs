// Confere o token e mostra o IG user id da conta (o valor para IG_USER_ID).
// Uso: npm run ver-conta   (lê IG_ACCESS_TOKEN do .env ou do ambiente)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(RAIZ, '.env')); } catch { }

const token = process.env.IG_ACCESS_TOKEN;
const API = (process.env.IG_API_URL || 'https://graph.instagram.com/v26.0').replace(/\/+$/, '');
if (!token) { console.error('ERRO: defina IG_ACCESS_TOKEN no .env ou no ambiente.'); process.exit(1); }

async function get(caminho, fields) {
  const r = await fetch(`${API}/${caminho}?${new URLSearchParams({ fields, access_token: token })}`);
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json.error) {
    const e = json.error || {};
    throw new Error(`${e.message || `HTTP ${r.status}`} (código ${e.code ?? '?'}${e.error_subcode ? `, subcódigo ${e.error_subcode}` : ''})`);
  }
  return json;
}

try {
  const me = await get('me', 'user_id,username,account_type');
  const conta = me.data?.[0] || me; // a resposta pode vir dentro de "data"
  console.log(`Conta:        @${conta.username}`);
  console.log(`Tipo:         ${conta.account_type || '?'}`);
  console.log(`IG_USER_ID:   ${conta.user_id}`);
  const lim = await get(`${conta.user_id}/content_publishing_limit`, 'quota_usage,config');
  const d = lim.data?.[0] || {};
  console.log(`Publicações:  ${d.quota_usage ?? '?'} de ${d.config?.quota_total ?? '?'} nas últimas 24h`);
  console.log('\nToken válido e com acesso à publicação.');
} catch (err) {
  console.error(`ERRO: ${err.message}`);
  process.exit(1);
}
