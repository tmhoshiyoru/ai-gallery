import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog } from './build-catalog.mjs';
import { inspectWork } from './work-inspection.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const directory = path.join(root, 'data', 'thumbnails');
await mkdir(directory, { recursive: true });
let manifest = { version: 1, viewport: { width: 1100, height: 900 }, entries: {} };
try { manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')); } catch {}
const data = await catalog();
for (const category of data.categories.filter(category => category.id !== 'first')) {
  try {
    const scoped = JSON.parse(await readFile(path.join(root, 'data', 'exhibitions', category.id, 'thumbnails', 'manifest.json'), 'utf8'));
    Object.assign(manifest.entries, scoped.entries);
  } catch {}
}
const only = process.argv.find(argument => argument.startsWith('--only='))?.slice(7)?.split(',');
const allWorks = data.categories.flatMap(category => category.classes.flatMap(group => group.works.map(work => ({ ...work, className: group.name, exhibitionId: category.id }))));
const works = allWorks.filter(work => !only || only.includes(work.id));
const thumbnailPath = work => path.join(root, work.thumbnailDirectory || 'data/thumbnails', work.id + '.jpg');
if (only && works.length !== new Set(only).size) throw new Error('--only 包含不存在的完整作品編碼');
const auditHeight = process.argv.includes('--audit-height');
let audit = [];
if (only && auditHeight) { try { audit = JSON.parse(await readFile(path.join(root, 'reports', '高度檢查.json'), 'utf8')).filter(row => !only.includes(row.id)); } catch {} }
const queue = [];
for (const work of works) {
  const inspection = inspectWork(await readFile(path.join(root, decodeURIComponent(work.source)), 'utf8'));
  if (inspection.isConversation) {
    manifest.entries[work.id] = { status: 'skipped-conversation', sourceHash: work.sourceHash, source: work.source, reason: 'Gemini conversation page', evidence: inspection };
    console.log(`SKIP ${decodeURIComponent(work.source)}`); continue;
  }
  if (!auditHeight && !process.argv.includes('--force') && manifest.entries[work.id]?.status === 'ready' && manifest.entries[work.id].sourceHash === work.sourceHash) {
    try { await access(thumbnailPath(work)); continue; } catch {}
  }
  queue.push(work);
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__audit') {
      const workURL = new URL(request.url, 'http://localhost').searchParams.get('work');
      if (!works.some(work => work.url === workURL)) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}iframe{display:block;border:0;width:100%;height:960px}</style><iframe src="/${workURL}" sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-pointer-lock"></iframe>`); return;
    }
    const target = pathname === '/' ? path.join(root, 'index.html') : path.resolve(root, '.' + pathname);
    if (!target.startsWith(root + path.sep) || !(target === path.join(root, 'index.html') || ['data', '作品', 'css', 'js'].some(folder => target.startsWith(path.join(root, folder) + path.sep)))) { response.writeHead(404).end(); return; }
    const body = await readFile(target); response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' }); response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const candidates = [process.env.THUMBNAIL_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
let executablePath;
for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
let browser;
const cache = new Map();
const allowedHosts = new Set(['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com']);
let completed = 0;
try {
  if (!executablePath) throw new Error('找不到 Chrome／Chromium。請使用 THUMBNAIL_BROWSER 指定執行檔。');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function worker() {
    while (queue.length) {
      const work = queue.shift();
      const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 0.5, locale: 'zh-TW', serviceWorkers: 'block' });
      const errors = [];
      try {
        await context.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
          if (request.method() !== 'GET' || !allowedHosts.has(url.hostname)) return route.abort();
          try {
            if (!cache.has(url.href)) cache.set(url.href, (async () => {
              const response = await route.fetch({ timeout: 20000 });
              return { status: response.status(), headers: response.headers(), body: await response.body() };
            })().catch(error => { cache.delete(url.href); throw error; }));
            return await route.fulfill(await cache.get(url.href));
          } catch { return route.abort(); }
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.dismiss());
        await page.goto(auditHeight ? origin + '/__audit?work=' + encodeURIComponent(work.url) : origin + '/' + work.url, { waitUntil: 'load', timeout: 45000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1500);
        // Capture before resizing: some student games retain their mobile canvas size.
        await mkdir(path.dirname(thumbnailPath(work)), { recursive: true });
        await page.screenshot({ path: thumbnailPath(work), type: 'jpeg', quality: 78, fullPage: false, timeout: 15000 });
        if (auditHeight) {
          const workFrame = page.frames().find(frame => frame.parentFrame() && frame.url().includes(work.id + '.html'));
          if (!workFrame) throw new Error('作品嵌入失敗');
          if (work.id === 'F4120FF64E') {
            await workFrame.locator('#startBtn').click();
          }
          const measure = async () => workFrame.evaluate(async () => {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const visible = [...document.querySelectorAll('canvas')].filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
            const canvases = visible.map(element => {
              const rect = element.getBoundingClientRect();
              return { width: Math.round(rect.width), height: Math.round(rect.height), intrinsicWidth: element.width, intrinsicHeight: element.height, parentHeight: element.parentElement.clientHeight, objectFit: getComputedStyle(element).objectFit };
            });
            const problems = [];
            for (const [index, canvas] of canvases.entries()) {
              if (canvas.height < 120 && canvas.width > 250) problems.push(`canvas-${index}:高度低於120px`);
              if (canvas.intrinsicHeight > 250 && canvas.intrinsicWidth > 0 && (canvas.height / canvas.intrinsicHeight) < (canvas.width / canvas.intrinsicWidth) * 0.6) problems.push(`canvas-${index}:垂直比例壓縮`);
            }
            const root = document.scrollingElement || document.documentElement || document.body;
            if (document.body.getBoundingClientRect().height < 240) problems.push('body高度異常');
            return { viewportWidth: innerWidth, viewportHeight: innerHeight, bodyHeight: Math.round(document.body.getBoundingClientRect().height), scrollHeight: root.scrollHeight, horizontalOverflow: root.scrollWidth > innerWidth + 16, canvases, problems };
          });
          const desktop = await measure();
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForTimeout(350);
          const mobile = await measure();
          audit.push({ exhibitionId: work.exhibitionId, className: work.className, code: work.id.slice(0, 6), id: work.id, source: decodeURIComponent(work.source), desktop, mobile, scriptWarnings: errors.slice(0, 5) });
          await page.setViewportSize({ width: 1100, height: 900 });
          await page.waitForTimeout(200);
        }
        manifest.entries[work.id] = { status: 'ready', sourceHash: work.sourceHash, source: work.source, capturedAt: new Date().toISOString(), warnings: errors.slice(0, 5) };
        completed++; console.log(`OK ${completed} ${work.className} ${decodeURIComponent(work.source).split('/').at(-1)}${errors.length ? ' (script warnings)' : ''}`);
      } catch (error) {
        manifest.entries[work.id] = { status: 'error', sourceHash: work.sourceHash, source: work.source, reason: error.message };
        console.log(`ERROR ${work.id}: ${error.message.split('\n')[0]}`);
      } finally { await context.close(); }
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker));
  if (process.argv.includes('--verify-exhibitions')) {
    if (data.categories.filter(category => category.visible !== false).length !== 1 || data.categories[0].id !== 'first') throw new Error('Production must still show only the first exhibition');
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    context.setDefaultTimeout(20000);
    const first = data.categories.find(category => category.id === 'first');
    const own = first.classes.find(group => group.name === '一儉').works.slice(0, 10);
    await context.addInitScript(({ fingerprint, id }) => {
      if (localStorage.getItem('exhibition-test-seeded')) return;
      localStorage.setItem('gallery-votes-v1', JSON.stringify({ fingerprint, voterClass: '一儉', selected: [id], enabled: true }));
      localStorage.setItem('exhibition-test-seeded', '1');
    }, { fingerprint: first.ballot.fingerprint, id: own[0].id });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'load', timeout: 45000 });
    if (await page.locator('#category option').count() !== 1) throw new Error('Unexpected public exhibition');
    await page.waitForFunction(() => document.getElementById('vote-mode').checked, null, { timeout: 20000 });
    if (!await page.locator('.work-card-shell').filter({ hasText: own[0].title }).locator('input').isChecked()) throw new Error('Legacy vote migration failed in browser');
    for (const work of own.slice(1)) await page.locator('.work-card-shell').filter({ hasText: work.title }).locator('input').check();
    await page.locator('.generate-vote').click();
    const firstCode = await page.locator('#vote-code').inputValue();
    if (!firstCode.startsWith('AV1.')) throw new Error('First exhibition code format changed');
    await page.locator('#close-code').click();
    // A second exhibition exists only in this isolated browser response, never in project configuration.
    const future = structuredClone(first);
    future.id = 'future-test'; future.name = '第二展覽隔離測試'; future.visible = false;
    future.ballot = { ...future.ballot, exhibitionId: future.id, exhibitionName: future.name, voteId: 2, codeVersion: 2, fingerprint: '1123456789abcdef' };
    for (const group of future.classes) for (const work of group.works) work.exhibitionId = future.id;
    const fixture = { ...data, categories: [first, future] };
    await page.route('**/data/catalog.js*', route => route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: 'window.GALLERY_CATALOG = ' + JSON.stringify(fixture) + ';' }));
    await page.reload({ waitUntil: 'load', timeout: 45000 });
    if (await page.locator('#category option').count() !== 1) throw new Error('Hidden exhibition appeared in menu');
    future.visible = true;
    await page.reload({ waitUntil: 'load', timeout: 45000 });
    await page.locator('#category').selectOption('future-test');
    if (await page.locator('#vote-mode').isChecked()) throw new Error('Voting identity leaked to new exhibition');
    await page.locator('#vote-mode').check();
    await page.locator('#voter-dialog').getByRole('button', { name: '訪客', exact: true }).click();
    await page.locator('#classes').getByRole('button', { name: '一儉', exact: true }).click();
    if (await page.locator('#cards input:checked').count()) throw new Error('Selections leaked across identical work IDs');
    await page.locator('.work-card-shell').filter({ hasText: own[0].title }).locator('input').check();
    await page.locator('.generate-vote').click();
    const futureCode = await page.locator('#vote-code').inputValue();
    if (!futureCode.startsWith('AV2.')) throw new Error('Future exhibition did not use AV2');
    await page.locator('#close-code').click();
    await page.locator('#category').selectOption('first');
    if (!(await page.locator('#voter-label').textContent()).startsWith('一儉') || !(await page.locator('#vote-summary').textContent()).includes('已勾選 10 件')) throw new Error('First exhibition state not restored');
    await page.locator('.generate-vote').click();
    if (await page.locator('#vote-code').inputValue() !== firstCode) throw new Error('Other exhibition invalidated first receipt');
    await page.locator('#close-code').click();
    await page.locator('#category').selectOption('future-test');
    if (!(await page.locator('#voter-label').textContent()).startsWith('訪客') || !(await page.locator('#vote-summary').textContent()).includes('已勾選 1 件')) throw new Error('Future exhibition state not restored');
    await page.reload({ waitUntil: 'load', timeout: 45000 });
    await page.locator('#category').selectOption('future-test');
    await page.locator('.generate-vote').click();
    if (await page.locator('#vote-code').inputValue() !== futureCode) throw new Error('Future receipt did not survive reload');
    await context.close();
    console.log('PASS exhibitions: production first-only, legacy migration, hidden menu, separate voter identities/selections/receipts, AV1+AV2, reload isolation');
  }
  if (process.argv.includes('--verify-persistence')) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    context.setDefaultTimeout(20000);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'load', timeout: 45000 });
    await page.locator('#classes button').first().waitFor();
    async function readOrders() {
      const orders = {};
      for (const group of data.categories[0].classes) {
        await page.locator('#classes').getByRole('button', { name: group.name, exact: true }).click();
        orders[group.name] = await page.locator('#cards .card-text b').allTextContents();
        const expected = group.works.map(work => work.title).sort();
        if (JSON.stringify([...orders[group.name]].sort()) !== JSON.stringify(expected)) throw new Error('Shuffle lost or duplicated works');
      }
      return orders;
    }
    const before = await readOrders();
    const snapshot = await page.evaluate(() => JSON.stringify(window.GALLERY_CATALOG.ballot));
    await page.locator('#vote-mode').check();
    await page.locator('#voter-dialog').getByRole('button', { name: '一讓', exact: true }).click();
    const ownWorks = data.categories[0].classes.find(group => group.name === '一讓').works.filter(work => /一讓35-/.test(decodeURIComponent(work.source)));
    for (const work of ownWorks) await page.locator('.work-card-shell').filter({ hasText: work.title }).locator('input').check();
    await page.locator('#classes').getByRole('button', { name: '一儉', exact: true }).click();
    const otherWork = data.categories[0].classes.find(group => group.name === '一儉').works[0];
    await page.locator('.work-card-shell').filter({ hasText: otherWork.title }).locator('input').check();
    const stable = await readOrders();
    if (JSON.stringify(stable) !== JSON.stringify(before)) throw new Error('Order changed during browsing/voting');
    await page.reload({ waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction(() => document.getElementById('vote-mode').checked, null, { timeout: 20000 });
    if (!(await page.locator('#voter-label').textContent()).startsWith('一讓')) throw new Error('Voter class not restored');
    await page.locator('#classes').getByRole('button', { name: '一讓', exact: true }).click();
    for (const work of ownWorks) if (!await page.locator('.work-card-shell').filter({ hasText: work.title }).locator('input').isChecked()) throw new Error('Own-class vote not restored');
    if (!(await page.locator('#vote-summary').textContent()).includes('已勾選 3 件')) throw new Error('Vote total not restored');
    const after = await readOrders();
    for (const group of data.categories[0].classes) if (JSON.stringify(before[group.name]) === JSON.stringify(after[group.name])) throw new Error('Class order did not shuffle on reload');
    if (await page.evaluate(() => JSON.stringify(window.GALLERY_CATALOG.ballot)) !== snapshot) throw new Error('Display shuffle changed ballot mapping');
    await page.locator('#classes').getByRole('button', { name: '一儉', exact: true }).click();
    if (!await page.locator('.work-card-shell').filter({ hasText: otherWork.title }).locator('input').isChecked()) throw new Error('Cross-class vote not restored');
    await context.close();
    console.log('PASS persistence: class, active voting mode, same-student versions and cross-class votes survive reload; all five classes reshuffle without changing ballot mapping; stable while browsing');
  }
  if (process.argv.includes('--verify-filters')) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    context.setDefaultTimeout(20000);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'load', timeout: 45000 });
    const group = data.categories[0].classes.find(group => group.name === '一儉');
    const tags = [...new Set(group.works.map(work => work.tag))].slice(0, 2);
    const filter = tag => page.locator('#tag-filters button').filter({ hasText: tag });
    await page.locator('#classes').getByRole('button', { name: group.name, exact: true }).click();
    await filter(tags[0]).click();
    const firstWorks = group.works.filter(work => work.tag === tags[0]);
    if (await page.locator('#cards .work-card').count() !== firstWorks.length) throw new Error('Single tag filter failed');
    await page.locator('#cards .work-card').first().click();
    if ((await page.locator('#work-position').textContent()) !== `1 / ${firstWorks.length}`) throw new Error('Viewer navigation ignored filter');
    await page.locator('#next-work').click();
    if (!(await page.locator('#viewer-class').textContent()).includes(tags[0])) throw new Error('Next work escaped filter');
    await page.locator('#close').click();
    await filter(tags[1]).click();
    const union = group.works.filter(work => tags.includes(work.tag));
    if (await page.locator('#cards .work-card').count() !== union.length) throw new Error('Multi-tag OR filter failed');
    await filter(tags[0]).click();
    if (await page.locator('#cards .work-card').count() !== group.works.filter(work => work.tag === tags[1]).length) throw new Error('Tag deselection failed');
    await page.locator('#tag-filters button[data-tag=""]').click();
    await page.locator('#vote-mode').check();
    await page.locator('#voter-dialog').getByRole('button', { name: '一儉', exact: true }).click();
    const votedWork = group.works[0];
    await page.locator('.work-card-shell').filter({ hasText: votedWork.title }).locator('input').check();
    await filter(tags[1]).click();
    await page.locator('#classes').getByRole('button', { name: '一讓', exact: true }).click();
    const otherGroup = data.categories[0].classes.find(group => group.name === '一讓');
    if (await page.locator('#cards .work-card').count() !== otherGroup.works.length || await page.locator('#tag-filters button[data-tag=""]').getAttribute('aria-pressed') !== 'true') throw new Error('Class switch did not clear filters');
    await page.locator('#classes').getByRole('button', { name: '一儉', exact: true }).click();
    if (await page.locator('#cards .work-card').count() !== group.works.length || !await page.locator('.work-card-shell').filter({ hasText: votedWork.title }).locator('input').isChecked()) throw new Error('Vote selection lost after filtering/class switch');
    await filter(tags[0]).click(); await filter(tags[1]).click();
    await page.locator('#gallery').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, '.qa', 'tag-filters.jpg'), type: 'jpeg', quality: 85 });
    await context.close();
    console.log('PASS filters: single, multi-select OR, deselect, filtered navigation, class reset, votes preserved');
  }
  if (process.argv.includes('--verify-featured-vote')) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    context.setDefaultTimeout(20000);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction(() => document.getElementById('featured-frame').dataset.workId, null, { timeout: 20000 });
    await page.locator('#featured-vote').click();
    await page.locator('#voter-dialog').waitFor({ state: 'visible' });
    await page.locator('#cancel-voter').click();
    if (await page.locator('#viewer').evaluate(element => element.open)) throw new Error('Cancel opened voting viewer');
    await page.locator('#featured-next').click();
    const first = await page.locator('#featured-frame').getAttribute('data-work-id');
    await page.locator('#featured-vote').click();
    await page.locator('#voter-dialog').getByRole('button', { name: '一御', exact: true }).click();
    await page.locator('#viewer').waitFor({ state: 'visible' });
    if (!(await page.locator('#viewer-title').textContent()).includes(first.slice(0, 6))) throw new Error('Class choice lost requested work');
    if (await page.locator('#viewer-vote-bar input').isChecked()) throw new Error('Entry button voted automatically');
    await page.locator('#close').click();
    await page.locator('#featured-next').click();
    const second = await page.locator('#featured-frame').getAttribute('data-work-id');
    await page.locator('#featured-vote').click();
    await page.locator('#viewer').waitFor({ state: 'visible' });
    if (await page.locator('#voter-dialog').evaluate(element => element.open)) throw new Error('Known voter prompted again');
    if (!(await page.locator('#viewer-title').textContent()).includes(second.slice(0, 6))) throw new Error('Direct vote entry opened wrong work');
    await page.locator('#close').click();
    for (const group of data.categories[0].classes) {
      await page.locator('#classes').getByRole('button', { name: group.name, exact: true }).click();
      const tags = await page.locator('#cards .work-tag').allTextContents();
      if (JSON.stringify([...tags].sort()) !== JSON.stringify(group.works.map(work => work.tag).sort())) throw new Error('Card tags do not match database');
    }
    await page.locator('#classes').getByRole('button', { name: '一儉', exact: true }).click();
    await page.locator('#gallery').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, '.qa', 'tagged-gallery.jpg'), type: 'jpeg', quality: 85 });
    await context.close();
    console.log('PASS featured vote: cancel, class prompt retains work, known voter direct entry; all five class tags match');
  }
  if (process.argv.includes('--verify-home')) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    context.setDefaultTimeout(20000);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction(() => document.getElementById('featured-frame').dataset.workId, null, { timeout: 20000 });
    if (await page.locator('.edition,.hero,.strip').count()) throw new Error('Removed content still present');
    if (await page.locator('.featured input[type=checkbox],.featured .vote-choice').count()) throw new Error('Featured work has voting controls');
    const previous = await page.locator('#featured-frame').getAttribute('data-work-id');
    await page.locator('#featured-next').click();
    const next = await page.locator('#featured-frame').getAttribute('data-work-id');
    if (next === previous) throw new Error('Random work repeated immediately');
    await page.waitForFunction(() => document.getElementById('featured-frame').dataset.measured, null, { timeout: 20000 });
    const beforeHeight = await page.locator('#featured-viewport').evaluate(element => element.clientHeight);
    await page.frameLocator('#featured-frame').locator('body').evaluate(body => { const marker = document.createElement('div'); marker.style.cssText = 'height:2400px;min-height:2400px;flex:none;position:relative'; body.append(marker); });
    await page.evaluate(() => FeaturedGallery.refreshSize());
    await page.waitForFunction(height => document.getElementById('featured-viewport').clientHeight > height + 100, beforeHeight, { timeout: 20000 });
    const fit = await page.locator('#featured-frame').evaluate(frame => ({ width: frame.getBoundingClientRect().width, parent: document.getElementById('featured-viewport').clientWidth }));
    if (fit.width > fit.parent + 2 || fit.width < fit.parent - 10) throw new Error('Featured width does not fit layout');
    await page.locator('#featured-next').click();
    console.log('PASS featured height and width');
    await page.locator('#vote-mode').check();
    await page.locator('#voter-dialog').getByRole('button', { name: '一御', exact: true }).click();
    const group = data.categories[0].classes.find(group => group.name === '一御');
    const seat = work => decodeURIComponent(work.source).match(/一御(\d{2})/)[1];
    const duplicates = group.works.filter(work => seat(work) === '25');
    const others = group.works.filter(work => seat(work) !== '25').slice(0, 9);
    for (const work of [...duplicates, ...others.slice(0, 7)]) await page.locator('.work-card-shell').filter({ hasText: work.title }).locator('input').check();
    let warning = '';
    page.once('dialog', async dialog => { warning = dialog.message(); await dialog.dismiss(); });
    await page.locator('.generate-vote').click();
    if (!warning.includes('9 件') || await page.locator('#code-dialog').evaluate(dialog => dialog.open)) throw new Error('Nine-work rule did not block');
    await page.locator('.work-card-shell').filter({ hasText: others[7].title }).locator('input').check();
    await page.locator('.generate-vote').click();
    await page.locator('#code-dialog').waitFor({ state: 'visible' });
    if (!(await page.locator('#vote-code').inputValue()).startsWith('AV1.')) throw new Error('Ten-work code generation failed');
    await page.locator('#close-code').click();
    for (const work of [...duplicates, ...others.slice(0, 8)]) {
      const input = page.locator('.work-card-shell').filter({ hasText: work.title }).locator('input');
      await input.evaluate(element => element.scrollIntoView({ block: 'center' }));
      await input.uncheck();
    }
    await page.getByRole('button', { name: '一儉', exact: true }).click();
    await page.locator('.cards input').first().check();
    page.once('dialog', async dialog => { warning = dialog.message(); await dialog.dismiss(); });
    await page.locator('.generate-vote').click();
    if (!warning.includes('0 件') || await page.locator('#code-dialog').evaluate(dialog => dialog.open)) throw new Error('Other-class votes bypassed own-class requirement');
    await page.locator('#change-voter').click();
    await page.locator('#voter-dialog').getByRole('button', { name: '訪客', exact: true }).click();
    await page.locator('.generate-vote').click();
    await page.locator('#code-dialog').waitFor({ state: 'visible' });
    if (!(await page.locator('#code-summary').textContent()).includes('訪客')) throw new Error('Visitor exemption failed');
    await page.locator('#close-code').click();
    await page.locator('#vote-mode').uncheck();
    await page.waitForFunction(() => document.getElementById('featured-frame').dataset.measured, null, { timeout: 20000 });
    await page.frameLocator('#featured-frame').locator('body').evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    await mkdir(path.join(root, '.qa'), { recursive: true });
    await page.screenshot({ path: path.join(root, '.qa', 'random-home.jpg'), type: 'jpeg', quality: 85 });
    await context.close();
    console.log('PASS home: content-driven height, full layout width, nine works blocked, ten works accepted including duplicate author, other-only blocked, visitor exempt');
  }
  if (process.argv.includes('--verify-ships')) {
    for (const width of [1200, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: 'load', timeout: 45000 });
      await page.getByRole('button', { name: '一禮', exact: true }).click();
      for (const seat of ['35', '24', '36']) {
        const work = data.categories[0].classes.find(group => group.name === '一禮').works.find(work => decodeURIComponent(work.source).endsWith(`/一禮${seat}.html`));
        await page.locator('.work-card').filter({ hasText: work.title }).click();
        await page.waitForFunction(() => document.getElementById('work-frame').dataset.measured);
        const child = page.frameLocator('#work-frame');
        await child.locator('body').evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
        await page.waitForTimeout(250);
        const clickInWork = async locator => {
          const local = await locator.evaluate(element => { const rect = element.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; });
          const embedding = await page.locator('#work-frame').evaluate(frame => { const rect = frame.getBoundingClientRect(); return { x: rect.x, y: rect.y, scale: rect.width / frame.clientWidth }; });
          await page.mouse.click(embedding.x + local.x * embedding.scale, embedding.y + local.y * embedding.scale);
        };
        if (seat === '35') {
          const height = await child.locator('#game-container').evaluate(element => element.clientHeight);
          if (height < 500) throw new Error('Game container collapsed');
          for (let index = 0; index < 3; index++) {
            const card = child.locator('#shipCard' + index);
            const visible = await card.evaluate(element => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight; });
            if (!visible) throw new Error('Ship card clipped');
            await clickInWork(card);
            if (!await card.evaluate(element => element.classList.contains('active'))) throw new Error('Ship selection failed');
          }
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(root, '.qa', `ships-${width}.jpg`), type: 'jpeg', quality: 85 });
          await clickInWork(child.locator('#main-menu button'));
          if (!await child.locator('#main-menu').evaluate(element => element.classList.contains('hidden-layer'))) throw new Error('Game did not start');
        } else {
          const height = await child.locator('canvas').first().evaluate(element => element.getBoundingClientRect().height);
          if (height < 180) throw new Error('Related game canvas collapsed');
        }
        await page.locator('#close').click();
        console.log('PASS ship layout', seat, width);
      }
      await context.close();
    }
  }
  if (process.argv.includes('--verify-fit')) {
    const mobileFit = process.argv.includes('--fit-mobile');
    const context = await browser.newContext({ viewport: mobileFit ? { width: 390, height: 844 } : { width: 1200, height: 900 } });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'load', timeout: 45000 });
    const samples = mobileFit ? [['一儉', '22'], ['一讓', '24']] : [['一儉', '22'], ['一讓', '24'], ['一儉', '31'], ['一讓', '14'], ['一禮', '13'], ['一書', '24']];
    for (const [className, seat] of samples) {
      await page.getByRole('button', { name: className, exact: true }).click();
      const work = data.categories[0].classes.find(group => group.name === className).works.find(work => decodeURIComponent(work.source).endsWith(`/${className}${seat}.html`));
      await page.locator('.work-card').filter({ hasText: work.title }).click();
      await page.frameLocator('#work-frame').locator('body').waitFor();
      await page.waitForFunction(() => document.getElementById('work-frame').dataset.measured);
      await page.frameLocator('#work-frame').locator('html').evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.waitForTimeout(250);
      const metric = await page.evaluate(() => {
        const frame = document.getElementById('work-frame'), area = document.querySelector('.work-scroll');
        return { width: frame.getBoundingClientRect().width, height: frame.getBoundingClientRect().height, areaHeight: area.clientHeight, scale: Number(frame.style.transform.match(/scale\(([^)]+)\)/)[1]) };
      });
      if (metric.height > metric.areaHeight + 6 && metric.scale > 0.401) throw new Error('Auto fit overflow: ' + JSON.stringify(metric));
      if (seat === '22' || (className === '一讓' && seat === '24')) {
        const height = await page.frameLocator('#work-frame').locator('#gameCanvas').evaluate(canvas => canvas.getBoundingClientRect().height);
        if (height < 400) throw new Error('Game canvas still collapsed');
        if (className === '一儉') {
          const panels = await page.frameLocator('#work-frame').locator('body > div.relative.flex > div.hidden').evaluateAll(elements => elements.map(element => ({ display: getComputedStyle(element).display, width: element.getBoundingClientRect().width })));
          if (panels.length !== 2 || panels.some(panel => panel.display === 'none' || panel.width < 200)) throw new Error('Three-column side panels missing: ' + JSON.stringify(panels));
          console.log('PASS both side panels visible');
        }
        await mkdir(path.join(root, '.qa'), { recursive: true });
        await page.screenshot({ path: path.join(root, '.qa', `fit-${className}${seat}${mobileFit ? '-mobile' : ''}.jpg`), type: 'jpeg', quality: 85 });
      }
      await page.locator('#fit-work').click();
      if (await page.locator('#work-frame').evaluate(frame => frame.style.transform) !== 'scale(1)') throw new Error('Original size toggle failed');
      await page.locator('#fit-work').click();
      await page.locator('#close').click();
      console.log('PASS fit', className + seat, JSON.stringify(metric));
    }
    await context.close();
  }
  if (process.argv.includes('--verify-height')) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'load', timeout: 45000 });
    await page.getByRole('button', { name: '一讓', exact: true }).click();
    const work = data.categories[0].classes.find(group => group.name === '一讓').works.find(work => decodeURIComponent(work.source).endsWith('/一讓14.html'));
    await page.locator('.work-card').filter({ hasText: work.title }).click();
    const canvas = page.frameLocator('#work-frame').locator('#gameCanvas');
    await canvas.waitFor({ state: 'visible', timeout: 45000 });
    const dimensions = await canvas.evaluate(element => ({ canvasHeight: element.height, displayHeight: element.getBoundingClientRect().height, containerHeight: element.parentElement.clientHeight, viewportHeight: innerHeight }));
    if (dimensions.displayHeight < 800 || dimensions.canvasHeight < 800) throw new Error('Game height still collapsed: ' + JSON.stringify(dimensions));
    await mkdir(path.join(root, '.qa'), { recursive: true });
    await page.screenshot({ path: path.join(root, '.qa', 'game-height.jpg'), type: 'jpeg', quality: 85 });
    await page.frameLocator('#work-frame').locator('#start-btn').click();
    console.log('PASS full-height game:', JSON.stringify(dimensions));
    await context.close();
  }
  if (process.argv.includes('--verify-image')) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'load', timeout: 45000 });
    await page.getByRole('button', { name: '一讓', exact: true }).click();
    const work = data.categories[0].classes.find(group => group.name === '一讓').works.find(work => decodeURIComponent(work.source).endsWith('/一讓11.html'));
    await page.locator('.work-card').filter({ hasText: work.title }).click();
    const preview = page.frameLocator('#work-frame').locator('#modalTeacherPreview');
    await preview.waitFor({ state: 'visible', timeout: 45000 });
    await preview.evaluate(image => image.decode());
    if (!await preview.evaluate(image => image.naturalWidth > 0 && image.src.endsWith('/IMG_9668.jpeg'))) throw new Error('預設圖片未成功載入');
    await page.frameLocator('#work-frame').locator('button[onclick="startGame()"]').click();
    await page.frameLocator('#work-frame').locator('#startModal').waitFor({ state: 'hidden' });
    console.log('PASS default JPEG loaded inside sandboxed gallery and game started');
    await context.close();
  }
  if (process.argv.includes('--verify-gallery')) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'load', timeout: 45000 });
    for (const group of data.categories[0].classes) {
      await page.getByRole('button', { name: group.name, exact: true }).click();
      const expectedImages = group.works.filter(work => work.thumbnail).length;
      const expectedSkipped = group.works.filter(work => work.thumbnailStatus === 'skipped-conversation').length;
      if (await page.locator('.card-art img').count() !== expectedImages || await page.locator('.preview-unavailable').count() !== expectedSkipped) throw new Error(group.name + '縮圖數量不符');
      if (expectedImages) await page.waitForFunction(() => document.querySelector('.card-art img')?.naturalWidth > 0);
    }
    await page.locator('#gallery').scrollIntoViewIfNeeded();
    await mkdir(path.join(root, '.qa'), { recursive: true });
    await page.screenshot({ path: path.join(root, '.qa', 'gallery-thumbnails.jpg'), type: 'jpeg', quality: 85 });
    await context.close();
    console.log('PASS gallery: five classes have expected thumbnails and skipped states');
  }
} finally {
  if (browser) await browser.close();
  server.close();
  for (const category of data.categories) {
    const target = category.id === 'first' ? directory : path.join(root, 'data', 'exhibitions', category.id, 'thumbnails');
    const ids = new Set(allWorks.filter(work => work.exhibitionId === category.id).map(work => work.id));
    const scoped = { ...manifest, entries: Object.fromEntries(Object.entries(manifest.entries).filter(([id]) => ids.has(id))) };
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'manifest.json'), JSON.stringify(scoped, null, 2) + '\n');
  }
  if (auditHeight) {
    await mkdir(path.join(root, 'reports'), { recursive: true });
    await writeFile(path.join(root, 'reports', '高度檢查.json'), JSON.stringify(audit, null, 2) + '\n');
  }
}
const current = works.map(work => manifest.entries[work.id]);
console.log(JSON.stringify({ ready: current.filter(entry => entry?.status === 'ready').length, skipped: current.filter(entry => entry?.status === 'skipped-conversation').length, errors: current.filter(entry => entry?.status === 'error').length }));
if (current.some(entry => entry?.status === 'error')) process.exitCode = 1;
