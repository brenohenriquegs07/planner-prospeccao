// Publica no Instagram os posts de export/posts.json cujo horário já chegou.
// Uso: npm run publicar [-- --dry-run] [-- --post post-01] [-- --agora 2026-10-23T19:05:00-03:00]
//
// Regras:
//  - no máximo 1 post por execução (atrasados saem um por vez, em ordem);
//  - post atrasado além da tolerância (TOLERANCIA_HORAS, padrão 6) não é publicado
//    sozinho: fica no log até você reagendar ou forçar com --post <id>;
//  - o estado fica em export/state.json, gravado logo após cada publicação.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQ_POSTS = path.join(RAIZ, 'export', 'posts.json');
const ARQ_ESTADO = path.join(RAIZ, 'export', 'state.json');
const FUSO = 'America/Sao_Paulo';

// ---------- configuração ----------
try { process.loadEnvFile(path.join(RAIZ, '.env')); } catch { /* sem .env: usa só o ambiente */ }

const args = process.argv.slice(2);
const opcao = nome => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
const DRY_RUN = args.includes('--dry-run');
const POST_FORCADO = opcao('--post');
const AGORA = opcao('--agora') ? new Date(opcao('--agora')) : new Date();
if (isNaN(AGORA)) falhar('--agora inválido. Use, por exemplo, 2026-10-23T19:05:00-03:00');

const TOKEN = process.env.IG_ACCESS_TOKEN || '';
const IG_USER_ID = process.env.IG_USER_ID || '';
const BASE_IMAGENS = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const API = (process.env.IG_API_URL || 'https://graph.instagram.com/v26.0').replace(/\/+$/, '');
const TOLERANCIA_MS = Number(process.env.TOLERANCIA_HORAS || 6) * 3600_000;
const ESPERA_STATUS_MS = Number(process.env.ESPERA_STATUS_MS || 5000);
const MAX_ESPERA_MS = 5 * 60_000; // a Meta recomenda checar o status por no máximo 5 minutos

// ---------- log ----------
const hora = d => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' }).format(d);
const log = (...m) => console.log(`[${hora(new Date())}]`, ...m);
function falhar(msg) { console.error(`ERRO: ${msg}`); process.exit(1); }

// ---------- estado ----------
function lerEstado() {
  if (!fs.existsSync(ARQ_ESTADO)) return { publicados: {}, pendente: null, ultima_falha: null };
  const e = JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8'));
  return { publicados: e.publicados || {}, pendente: e.pendente || null, ultima_falha: e.ultima_falha || null };
}
function gravarEstado(e) {
  // grava num temporário e renomeia, para nunca deixar o arquivo pela metade
  const tmp = ARQ_ESTADO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(e, null, 2) + '\n');
  fs.renameSync(tmp, ARQ_ESTADO);
}

// ---------- API ----------
class ErroApi extends Error {
  constructor(etapa, status, corpo) {
    const e = corpo?.error;
    super(e ? `${etapa}: ${e.message} (tipo ${e.type}, código ${e.code}${e.error_subcode ? `, subcódigo ${e.error_subcode}` : ''}${e.fbtrace_id ? `, fbtrace_id ${e.fbtrace_id}` : ''})`
      : `${etapa}: HTTP ${status} ${JSON.stringify(corpo).slice(0, 300)}`);
    this.erroApi = e || null;
  }
}
async function api(metodo, caminho, params, etapa) {
  // o token vai no corpo (POST) ou na query (GET), e nunca é impresso no log
  const url = new URL(`${API}/${caminho}`);
  const corpo = new URLSearchParams({ ...params, access_token: TOKEN });
  let resp;
  try {
    resp = metodo === 'GET'
      ? await fetch(`${url}?${corpo}`, { signal: AbortSignal.timeout(60_000) })
      : await fetch(url, { method: 'POST', body: corpo, signal: AbortSignal.timeout(60_000) });
  } catch (err) { throw new Error(`${etapa}: falha de rede (${err.message})`); }
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.error) throw new ErroApi(etapa, resp.status, json);
  return json;
}
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function aguardarContainer(id, etapa) {
  const inicio = Date.now();
  for (;;) {
    const { status_code: st } = await api('GET', id, { fields: 'status_code' }, `${etapa} (status)`);
    if (st === 'FINISHED' || st === 'PUBLISHED') return st;
    if (st === 'ERROR' || st === 'EXPIRED') throw new Error(`${etapa}: container ${id} terminou com status ${st}`);
    if (Date.now() - inicio > MAX_ESPERA_MS) throw new Error(`${etapa}: container ${id} ainda em ${st} após 5 minutos`);
    log(`  … container ${id}: ${st}, aguardando`);
    await dormir(ESPERA_STATUS_MS);
  }
}

async function limiteDePublicacao() {
  const r = await api('GET', `${IG_USER_ID}/content_publishing_limit`, { fields: 'quota_usage,config' }, 'content_publishing_limit');
  const d = r.data?.[0] || {};
  return { usado: d.quota_usage ?? 0, total: d.config?.quota_total ?? null };
}

async function criarContainer(post) {
  const url = arq => `${BASE_IMAGENS}/${arq}`;
  if (post.tipo === 'imagem') {
    log(`  criando container de imagem: ${url(post.arquivos[0])}`);
    const { id } = await api('POST', `${IG_USER_ID}/media`, { image_url: url(post.arquivos[0]), caption: post.legenda }, 'criar container');
    await aguardarContainer(id, 'container de imagem');
    return id;
  }
  const filhos = [];
  for (const [i, arq] of post.arquivos.entries()) {
    log(`  criando item ${i + 1}/${post.arquivos.length} do carrossel: ${url(arq)}`);
    const { id } = await api('POST', `${IG_USER_ID}/media`, { image_url: url(arq), is_carousel_item: 'true' }, `criar item ${i + 1} do carrossel`);
    filhos.push(id);
  }
  for (const [i, id] of filhos.entries()) await aguardarContainer(id, `item ${i + 1} do carrossel`);
  log('  criando container CAROUSEL');
  const { id } = await api('POST', `${IG_USER_ID}/media`, { media_type: 'CAROUSEL', children: filhos.join(','), caption: post.legenda }, 'criar container CAROUSEL');
  await aguardarContainer(id, 'container CAROUSEL');
  return id;
}

async function publicarContainer(post, containerId, estado) {
  // registra o container antes de publicar: se a execução cair no meio, a próxima
  // descobre pelo status se ele chegou a ser publicado e não publica de novo
  estado.pendente = { id: post.id, container_id: containerId, desde: new Date().toISOString() };
  gravarEstado(estado);
  log(`  chamando media_publish (container ${containerId})`);
  const { id: mediaId } = await api('POST', `${IG_USER_ID}/media_publish`, { creation_id: containerId }, 'media_publish');
  registrarPublicado(estado, post.id, mediaId, containerId);
  return mediaId;
}

function registrarPublicado(estado, id, mediaId, containerId) {
  estado.publicados[id] = { media_id: mediaId || null, container_id: containerId, publicado_em: new Date().toISOString() };
  estado.pendente = null;
  if (estado.ultima_falha?.id === id) estado.ultima_falha = null;
  gravarEstado(estado);
}

async function linkPermanente(estado, id) {
  const reg = estado.publicados[id];
  if (!reg?.media_id) return;
  try {
    const { permalink } = await api('GET', reg.media_id, { fields: 'permalink' }, 'permalink');
    reg.permalink = permalink; gravarEstado(estado);
    log(`  link: ${permalink}`);
  } catch (err) { log(`  (publicado, mas não consegui buscar o link: ${err.message})`); }
}

// resolve uma execução anterior que caiu entre o media_publish e a gravação do estado
async function resolverPendente(estado) {
  const p = estado.pendente;
  if (!p) return;
  log(`Execução anterior deixou ${p.id} pendente (container ${p.container_id}). Conferindo…`);
  let st;
  try { ({ status_code: st } = await api('GET', p.container_id, { fields: 'status_code' }, 'conferir pendente')); }
  catch (err) { throw new Error(`Não consegui conferir o container pendente de ${p.id}: ${err.message}. Nada será publicado até isso ser resolvido.`); }
  if (st === 'PUBLISHED') {
    log(`  ${p.id} já tinha sido publicado. Marcando no estado.`);
    registrarPublicado(estado, p.id, null, p.container_id);
  } else {
    log(`  container em ${st}: ${p.id} não foi publicado. Ele volta para a fila.`);
    estado.pendente = null; gravarEstado(estado);
  }
}

// ---------- seleção ----------
function validar(post) {
  const erros = [];
  if (!['imagem', 'carrossel'].includes(post.tipo)) erros.push(`tipo "${post.tipo}" não suportado`);
  if (post.tipo === 'imagem' && post.arquivos.length !== 1) erros.push('imagem precisa de exatamente 1 arquivo');
  if (post.tipo === 'carrossel' && (post.arquivos.length < 2 || post.arquivos.length > 20)) erros.push('carrossel precisa de 2 a 20 arquivos');
  if (post.arquivos.some(a => !/\.jpe?g$/i.test(a))) erros.push('a API só aceita JPEG');
  if ([...post.legenda].length > 2200) erros.push('legenda passa de 2.200 caracteres');
  if ((post.legenda.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) erros.push('mais de 30 hashtags');
  if (isNaN(new Date(post.data_hora))) erros.push(`data_hora inválida: ${post.data_hora}`);
  return erros;
}

function classificar(posts, estado) {
  const r = { publicar: null, atrasados: [], futuros: [], invalidos: [] };
  for (const p of [...posts].sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))) {
    if (estado.publicados[p.id]) continue;
    const erros = validar(p);
    if (erros.length) { r.invalidos.push({ p, erros }); continue; }
    if (POST_FORCADO) { if (p.id === POST_FORCADO) r.publicar = p; continue; }
    const quando = new Date(p.data_hora);
    if (quando > AGORA) r.futuros.push(p);
    else if (AGORA - quando > TOLERANCIA_MS) r.atrasados.push(p);
    else if (!r.publicar) r.publicar = p;
    // os demais vencidos dentro da tolerância esperam a próxima execução
  }
  return r;
}

// ---------- principal ----------
async function main() {
  if (!fs.existsSync(ARQ_POSTS)) falhar('export/posts.json não existe. Rode "npm run exportar".');
  const { posts } = JSON.parse(fs.readFileSync(ARQ_POSTS, 'utf8'));
  const estado = lerEstado();

  log(`Início${DRY_RUN ? ' (DRY-RUN: nada será publicado)' : ''}. Agora em ${FUSO}: ${hora(AGORA)}.`);
  log(`${posts.length} posts no posts.json, ${Object.keys(estado.publicados).length} já publicados.`);

  if (!DRY_RUN) {
    const faltando = [['IG_ACCESS_TOKEN', TOKEN], ['IG_USER_ID', IG_USER_ID], ['PUBLIC_BASE_URL', BASE_IMAGENS]].filter(([, v]) => !v).map(([k]) => k);
    if (faltando.length) falhar(`variáveis de ambiente ausentes: ${faltando.join(', ')}`);
    await resolverPendente(estado);
  } else if (estado.pendente) {
    log(`Há um post pendente de execução anterior (${estado.pendente.id}); a execução real vai conferi-lo primeiro.`);
  }

  if (POST_FORCADO && estado.publicados[POST_FORCADO]) { log(`${POST_FORCADO} já foi publicado em ${hora(new Date(estado.publicados[POST_FORCADO].publicado_em))}. Nada a fazer.`); return; }
  if (POST_FORCADO && !posts.some(p => p.id === POST_FORCADO)) falhar(`--post ${POST_FORCADO} não existe no posts.json`);

  const c = classificar(posts, estado);
  for (const { p, erros } of c.invalidos) log(`⚠ ${p.id} ignorado, inválido: ${erros.join('; ')}`);
  for (const p of c.atrasados) log(`⚠ ${p.id} passou da tolerância (era ${hora(new Date(p.data_hora))}). Não será publicado automaticamente. Reagende ou force com --post ${p.id}.`);
  if (c.futuros.length) log(`Próximo agendado: ${c.futuros[0].id} em ${hora(new Date(c.futuros[0].data_hora))} (${c.futuros.length} na fila).`);

  if (!c.publicar) { log('Nenhum post para publicar agora.'); return; }
  const post = c.publicar;
  log(`→ ${DRY_RUN ? 'Seria publicado' : 'Publicando'}: ${post.id} · ${post.tipo} · ${post.arquivos.length} arquivo(s) · agendado para ${hora(new Date(post.data_hora))}${POST_FORCADO ? ' (forçado com --post)' : ''}`);
  log(`  "${post.titulo || post.legenda.split('\n')[0]}"`);

  if (DRY_RUN) {
    if (BASE_IMAGENS) {
      for (const arq of post.arquivos) {
        const u = `${BASE_IMAGENS}/${arq}`;
        const r = await fetch(u, { method: 'HEAD' }).catch(e => ({ ok: false, status: e.message }));
        log(`  ${r.ok ? '✓' : '✗'} ${u} ${r.ok ? r.headers.get('content-type') : `(${r.status})`}`);
      }
    } else log('  (PUBLIC_BASE_URL não definido: não conferi as URLs das imagens)');
    if (TOKEN && IG_USER_ID) {
      try { const l = await limiteDePublicacao(); log(`  limite de publicação: ${l.usado} de ${l.total ?? '?'} nas últimas 24h`); }
      catch (err) { log(`  não consegui consultar o limite: ${err.message}`); }
    }
    return;
  }

  const lim = await limiteDePublicacao();
  log(`  limite de publicação: ${lim.usado} de ${lim.total ?? '?'} nas últimas 24h`);
  if (lim.total !== null && lim.usado >= lim.total) { log('  Limite diário atingido. Tento de novo na próxima execução.'); return; }

  try {
    const containerId = await criarContainer(post);
    const mediaId = await publicarContainer(post, containerId, estado);
    log(`✓ ${post.id} publicado (media_id ${mediaId}).`);
    await linkPermanente(estado, post.id);
  } catch (err) {
    estado.ultima_falha = { id: post.id, em: new Date().toISOString(), erro: err.message };
    // se o media_publish falhou com resposta da API, o post não saiu: libera o pendente
    if (estado.pendente?.id === post.id && err.erroApi) estado.pendente = null;
    gravarEstado(estado);
    throw err;
  }
}

main().catch(err => { console.error(`✗ ERRO: ${err.message}`); process.exit(1); });
