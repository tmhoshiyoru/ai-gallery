import { readdir, mkdir, writeFile, readFile, copyFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectWork } from './work-inspection.mjs';
import { classifyWorks } from './classify-works.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const storageShim = `<script>
window.__galleryStorage = (() => {
  try { const storage = window.localStorage; storage.getItem('__gallery_probe'); return storage; } catch {}
  const values = new Map();
  return { getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => { values.set(String(key), String(value)); },
    removeItem: key => { values.delete(String(key)); }, clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
})();
</script>`;
export async function catalog(base = root) {
  let excludedSources = [];
  try { excludedSources = JSON.parse(await readFile(path.join(base, 'config', 'publication.json'), 'utf8')).excludedSources; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(excludedSources) || excludedSources.some(source => typeof source !== 'string' || !source.startsWith('作品/') || source.split('/').includes('..'))) throw new Error('發布排除清單格式不正確');
  const excluded = new Set(excludedSources);
  const definitions = JSON.parse(await readFile(path.join(base, 'config', 'exhibitions.json'), 'utf8')).exhibitions;
  if (!Array.isArray(definitions) || !definitions.length) throw new Error('至少需要一個展覽設定');
  const ids = new Set(), voteIds = new Set(), directories = new Set();
  for (const exhibition of definitions) {
    if (typeof exhibition.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(exhibition.id) || !Number.isInteger(exhibition.voteId) || exhibition.voteId < 1 || exhibition.voteId > 0xffffffff || typeof exhibition.name !== 'string' || !exhibition.name.trim() || typeof exhibition.directory !== 'string' || !exhibition.directory.trim() || /[\\/<>:"|?*\x00-\x1f]/.test(exhibition.directory) || /[. ]$/.test(exhibition.directory) || ['.', '..'].includes(exhibition.directory)) throw new Error('展覽設定格式不正確');
    if (ids.has(exhibition.id) || voteIds.has(exhibition.voteId) || directories.has(exhibition.directory)) throw new Error('展覽代號、投票代號與資料夾不可重複');
    if ((exhibition.id === 'first') !== (exhibition.voteId === 1)) throw new Error('投票代號1保留給既有第一個展覽');
    ids.add(exhibition.id); voteIds.add(exhibition.voteId); directories.add(exhibition.directory);
  }
  if (!definitions.some(exhibition => exhibition.visible !== false)) throw new Error('至少需要一個可顯示的展覽');
  const categories = [];
  const archiveIndex = [];
  try { archiveIndex.push(...JSON.parse(await readFile(path.join(base, 'data', 'exhibition-index.json'), 'utf8'))); } catch {}
  for (const exhibition of definitions) {
  const legacy = exhibition.id === 'first';
  const scope = path.join(base, 'data', 'exhibitions', exhibition.id);
  const thumbnailDirectory = legacy ? 'data/thumbnails' : `data/exhibitions/${exhibition.id}/thumbnails`;
  let thumbnails = { entries: {} };
  try { thumbnails = JSON.parse(await readFile(path.join(base, thumbnailDirectory, 'manifest.json'), 'utf8')); } catch {}
  const classes = [];
  const classificationInputs = [];
  for (const name of ['一儉', '一讓', '一禮', '一御', '一書']) {
    const folder = path.join(base, '作品', exhibition.directory, name);
    await mkdir(folder, { recursive: true });
    const files = await readdir(folder, { withFileTypes: true });
    const works = await Promise.all(files.filter(file => file.isFile() && /\.html?$/i.test(file.name) && !excluded.has(['作品', exhibition.directory, name, file.name].join('/'))).map(async file => {
      const id = createHash('sha256').update(`${legacy ? '' : exhibition.id + '/'}${name}/${file.name}`).digest('hex').slice(0, 10).toUpperCase();
      const source = ['作品', exhibition.directory, name, file.name].map(encodeURIComponent).join('/');
      const previewParts = legacy ? ['data', 'previews', name] : ['data', 'previews', exhibition.id, name];
      const output = path.join(base, ...previewParts);
      await mkdir(output, { recursive: true });
      const original = await readFile(path.join(folder, file.name), 'utf8');
      const sourceHash = createHash('sha256').update(original).digest('hex');
      classificationInputs.push({ id, source, sourceHash, className: name, html: original, exhibitionId: exhibition.id });
      const inspection = inspectWork(original);
      const thumbnail = thumbnails.entries[id];
      let thumbnailURL = null;
      if (!inspection.isConversation && thumbnail?.status === 'ready' && thumbnail.sourceHash === sourceHash) {
        try { await readFile(path.join(base, thumbnailDirectory, id + '.jpg')); thumbnailURL = `${thumbnailDirectory}/${id}.jpg?v=${sourceHash.slice(0, 12)}`; } catch {}
      }
      let html = original.replace(/\blocalStorage\b/g, 'window.__galleryStorage');
      const baseHref = '../'.repeat(previewParts.length) + ['作品', exhibition.directory, name].map(encodeURIComponent).join('/') + '/';
      const support = `<base href="${baseHref}">${storageShim}`;
      html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, match => match + support) : support + html;
      const layoutSupport = `<style id="gallery-layout-support">
html { overflow-y: auto !important; }
body { height: auto !important; min-height: 100vh !important; overflow-y: auto !important; }
/* Full-height games need a definite containing height for percentage-sized canvases. */
body.h-full, body.h-screen { height: 100vh !important; }
${inspection.requiresViewportHeight ? 'body { height: 100vh !important; }' : ''}
body > header, body > main, body > footer, body > canvas { flex-shrink: 0; }
${['8C4CE87990', 'EFFDCB5E52'].includes(id) ? '#gameCanvas { object-fit: contain; background: #020617; }' : ''}
</style>`;
      html = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, layoutSupport + '</head>') : html + layoutSupport;
      const sizingBridge = `<script>
addEventListener('message', async event => {
  if (event.source !== parent || event.data?.type !== 'gallery-measure') return;
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const root = document.scrollingElement || document.documentElement;
  const bodyStyle = getComputedStyle(document.body);
  const bodyPadding = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
  const flowHeight = Math.max(0, ...[...document.body.children].filter(element => ['static', 'relative'].includes(getComputedStyle(element).position)).map(element => element.getBoundingClientRect().height + bodyPadding));
  let overflow = 0;
  for (const element of [...document.querySelectorAll('body *')].slice(0, 3000)) {
    const rect = element.getBoundingClientRect();
    if (rect.height < 200 || rect.width < 150) continue;
    const style = getComputedStyle(element);
    if (!['absolute', 'fixed'].includes(style.position) && style.overflowY !== 'hidden') continue;
    const childHeight = Math.max(0, ...[...element.children].map(child => child.getBoundingClientRect().height));
    overflow = Math.max(overflow, element.scrollHeight - element.clientHeight, childHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) - element.clientHeight);
  }
  parent.postMessage({ type: 'gallery-size', request: event.data.request, height: Math.max(root.scrollHeight, document.body.scrollHeight, innerHeight, flowHeight) + Math.max(0, overflow) }, '*');
});
</script>`;
      html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, sizingBridge + '</body>') : html + sizingBridge;
      await writeFile(path.join(output, id + '.html'), html);
      return { id, title: `作品 ${id.slice(0, 6)}`, source, sourceHash, exhibitionId: exhibition.id, thumbnailDirectory, displayMinWidth: legacy && name === '一儉' && file.name === '一儉22.html' ? 1100 : id === 'C426CE2A9D' ? 600 : null, thumbnail: thumbnailURL, thumbnailStatus: inspection.isConversation ? 'skipped-conversation' : thumbnailURL ? 'ready' : 'pending', url: [...previewParts, id + '.html'].map(encodeURIComponent).join('/') };
    }));
    works.sort((a, b) => a.id.localeCompare(b.id));
    classes.push({ name, works });
  }
  const tags = classifyWorks(classificationInputs);
  for (const group of classes) for (const work of group.works) work.tag = tags.works[work.id].tag;
  await mkdir(path.join(base, 'data'), { recursive: true });
  await mkdir(scope, { recursive: true });
  await writeFile(path.join(scope, 'work-tags.json'), JSON.stringify(tags, null, 2) + '\n');
  if (legacy) await writeFile(path.join(base, 'data', 'work-tags.json'), JSON.stringify(tags, null, 2) + '\n');
  const entries = classes.flatMap(group => group.works.map(work => ({ id: work.id, className: group.name, source: work.source, title: work.title })));
  const fingerprint = createHash('sha256').update(JSON.stringify(legacy ? entries : { exhibitionId: exhibition.id, voteId: exhibition.voteId, entries })).digest('hex').slice(0, 16);
  const ballot = { fingerprint, entries, version: 1, exhibitionId: exhibition.id, exhibitionName: exhibition.name, voteId: exhibition.voteId, codeVersion: legacy ? 1 : 2, rule: { sameClass: 2, otherClass: 1, minOwnWorks: 10 }, maxWorks: 1280 };
  await mkdir(path.join(scope, 'ballots'), { recursive: true });
  await writeFile(path.join(scope, 'ballots', fingerprint + '.json'), JSON.stringify(ballot, null, 2) + '\n');
  if (legacy) {
    await mkdir(path.join(base, 'data', 'ballots'), { recursive: true });
    await writeFile(path.join(base, 'data', 'ballots', fingerprint + '.json'), JSON.stringify(ballot, null, 2) + '\n');
  }
  const workMap = classes.flatMap(group => group.works.map(work => {
    const filename = decodeURIComponent(work.source).split('/').at(-1);
    const match = filename.match(/(\d{2})(?:-(\d+))?\.html?$/i);
    return { exhibitionId: exhibition.id, exhibitionName: exhibition.name, id: work.id, code: work.id.slice(0, 6), className: group.name, seat: match?.[1] || null, submission: match?.[2] || null, filename, tag: work.tag };
  }));
  await writeFile(path.join(scope, 'work-map.json'), JSON.stringify(workMap, null, 2) + '\n');
  archiveIndex.push({ exhibitionId: exhibition.id, voteId: exhibition.voteId, fingerprint, codeVersion: ballot.codeVersion, path: `data/exhibitions/${exhibition.id}/ballots/${fingerprint}.json` });
  categories.push({ id: exhibition.id, name: exhibition.name, visible: exhibition.visible !== false, classes, ballot });
  }
  try {
    for (const file of await readdir(path.join(base, 'data', 'ballots'))) {
      if (!/^[a-f0-9]{16}\.json$/.test(file)) continue;
      archiveIndex.push({ exhibitionId: 'first', voteId: 1, fingerprint: file.slice(0, -5), codeVersion: 1, path: `data/ballots/${file}` });
    }
  } catch {}
  const uniqueArchives = new Map(archiveIndex.map(entry => [entry.exhibitionId + '/' + entry.fingerprint, entry]));
  await writeFile(path.join(base, 'data', 'exhibition-index.json'), JSON.stringify([...uniqueArchives.values()], null, 2) + '\n');
  return { categories, ballot: (categories.find(category => category.id === 'first') || categories[0]).ballot };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = await catalog();
  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'data/catalog.js'), `window.GALLERY_CATALOG = ${JSON.stringify(data, null, 2)};\n`);
  if (process.argv.includes('--dist')) {
    const dist = path.join(root, 'dist');
    await mkdir(dist, { recursive: true });
    await copyFile(path.join(root, 'index.html'), path.join(dist, 'index.html'));
    for (const folder of ['css', 'js', 'data', '作品']) await cp(path.join(root, folder), path.join(dist, folder), { recursive: true });
    await writeFile(path.join(dist, '.nojekyll'), '');
  }
  console.log(`Catalog updated: ${data.categories.length} exhibition(s), ${data.categories.flatMap(category => category.classes).reduce((sum, group) => sum + group.works.length, 0)} works`);
}
