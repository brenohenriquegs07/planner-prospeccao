// Gera as artes (JPEG 1080x1350) e o export/posts.json a partir do planner.
// Uso: npm run exportar
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(RAIZ, 'mockup-perfil-instagram.html');
const EXPORT = path.join(RAIZ, 'export');
const MIDIA = path.join(EXPORT, 'media');
const FUSO = 'America/Sao_Paulo';
const LARGURA = 1080, ALTURA = 1350, QUALIDADE = 90;

// ---------- lê os dados do planner ----------
const html = fs.readFileSync(HTML, 'utf8');
const lerConst = nome => {
  const m = html.match(new RegExp(`const ${nome} = (.*?);\\n`, 's'));
  if (!m) throw new Error(`${nome} não encontrado no HTML`);
  return JSON.parse(m[1]);
};
const DADOS = lerConst('DADOS_PLANILHA');
const CRIATIVOS = lerConst('CRIATIVOS');

// "23/10/2026" + "19h" -> "2026-10-23T19:00:00-03:00", com o deslocamento do fuso naquela data
function dataHora(data, horario) {
  const [dd, mm, yyyy] = data.split('/').map(Number);
  const [hh, mi = 0] = String(horario).replace(/h$/i, '').split(/[:h]/).map(Number);
  const pad = n => String(n).padStart(2, '0');
  const local = `${yyyy}-${pad(mm)}-${pad(dd)}T${pad(hh)}:${pad(mi)}:00`;
  // descobre o offset de São Paulo naquele instante (aprox. pelo meio-dia UTC do dia)
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, timeZoneName: 'longOffset' })
    .formatToParts(new Date(Date.UTC(yyyy, mm - 1, dd, 12))).find(p => p.type === 'timeZoneName').value;
  const offset = nome === 'GMT' ? '+00:00' : nome.replace('GMT', '');
  return local + offset;
}

const legendaFinal = p => [p.legenda.trim(), p.hashtags.trim()].filter(Boolean).join('\n\n');

// ---------- separa o que entra na automação ----------
const publicaveis = [], fora = [], semLegenda = [];
for (const p of DADOS) {
  const status = p.status || 'aprovado';
  if (p.formato === 'Reels') { fora.push(`${p.nn} (Reels)`); continue; }
  if (status === 'rascunho') { fora.push(`${p.nn} (rascunho)`); continue; }
  if (status === 'publicado') { fora.push(`${p.nn} (já publicado)`); continue; }
  if (!p.legenda.trim()) { semLegenda.push(`${p.nn} · ${p.titulo}`); continue; }
  publicaveis.push(p);
}

// ---------- renderiza cada slide ----------
fs.rmSync(MIDIA, { recursive: true, force: true });
fs.mkdirSync(MIDIA, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 1 });
const posts = [];

for (const p of publicaveis) {
  const arquivos = String(p.arquivos).split('\n').filter(Boolean);
  const carrossel = p.formato === 'Carrossel';
  if (carrossel && (arquivos.length < 2 || arquivos.length > 20)) throw new Error(`Post ${p.nn}: carrossel precisa de 2 a 20 slides (tem ${arquivos.length})`);
  const saidas = [];
  for (const [i, arq] of arquivos.entries()) {
    const fonte = CRIATIVOS[arq];
    if (!fonte) throw new Error(`Post ${p.nn}: arte "${arq}" não encontrada em CRIATIVOS`);
    const nome = carrossel ? `post-${p.nn}-${i + 1}.jpg` : `post-${p.nn}.jpg`;
    const src = pathToFileURL(path.join(RAIZ, fonte)).href;
    await page.goto(pathToFileURL(path.join(RAIZ, 'tools', 'slide.html')).href + '?src=' + encodeURIComponent(src));
    const ok = await page.evaluate(() => { const i = document.getElementById('arte'); return i.decode().then(() => i.naturalWidth > 0, () => false); });
    if (!ok) throw new Error(`Post ${p.nn}: não consegui carregar ${fonte}`);
    await page.screenshot({ path: path.join(MIDIA, nome), type: 'jpeg', quality: QUALIDADE });
    saidas.push(`media/${nome}`);
  }
  posts.push({
    id: `post-${p.nn}`,
    titulo: p.titulo,
    data_hora: dataHora(p.data, p.horario),
    tipo: carrossel ? 'carrossel' : 'imagem',
    arquivos: saidas,
    legenda: legendaFinal(p),
  });
  console.log(`✓ post-${p.nn}  ${posts.at(-1).data_hora}  ${posts.at(-1).tipo.padEnd(9)} ${saidas.length} arquivo(s)  ${p.titulo}`);
}
await browser.close();

posts.sort((a, b) => a.data_hora.localeCompare(b.data_hora));
fs.writeFileSync(path.join(EXPORT, 'posts.json'), JSON.stringify({ fuso: FUSO, posts }, null, 2) + '\n');

console.log(`\n${posts.length} posts exportados, ${posts.reduce((n, p) => n + p.arquivos.length, 0)} JPEGs em export/media.`);
console.log(`Fora da automação: ${fora.join(', ') || 'nenhum'}`);
if (semLegenda.length) {
  console.log(`\nATENÇÃO, posts sem legenda (não exportados):\n  ${semLegenda.join('\n  ')}`);
  process.exitCode = 1;
}
