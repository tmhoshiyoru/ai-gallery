import fs from 'node:fs/promises';
import vm from 'node:vm';
const context = { window: {} };
vm.runInNewContext(await fs.readFile('data/catalog.js', 'utf8'), context);
const data = context.window.GALLERY_CATALOG;
const rows = JSON.parse(await fs.readFile('reports/高度檢查.json', 'utf8'));
const expected = data.categories.flatMap(category => category.classes.flatMap(group => group.works)).filter(work => work.thumbnailStatus !== 'skipped-conversation');
if (rows.length !== expected.length || new Set(rows.map(row => row.id)).size !== expected.length || expected.some(work => !rows.some(row => row.id === work.id))) throw new Error('Height audit coverage incomplete');
for (const row of rows) {
  const distortions = [], notes = [];
  for (const [screen, metric] of [['desktop', row.desktop], ['mobile', row.mobile]]) {
    for (const [index, canvas] of metric.canvases.entries()) {
      const ratio = (canvas.height / canvas.intrinsicHeight) / (canvas.width / canvas.intrinsicWidth);
      if (canvas.objectFit === 'contain') notes.push('畫布採等比顯示，空餘區域保留留白');
      else if (canvas.intrinsicHeight > 120 && (ratio < 0.6 || ratio > 1.6)) distortions.push(`${screen}:canvas-${index}:ratio-${ratio.toFixed(2)}`);
      else if (canvas.height < 120) notes.push(canvas.intrinsicHeight <= 120 ? '輔助畫布原始高度較小' : '手機等比縮小，建議橫向或使用電腦');
    }
  }
  row.review = { status: distortions.length ? 'needs-review' : 'pass', distortions, notes: [...new Set(notes)] };
}
await fs.writeFile('reports/高度檢查.json', JSON.stringify(rows, null, 2) + '\n');
const summary = {
  catalogFingerprint: data.ballot.fingerprint,
  exhibitions: data.categories.map(category => ({ exhibitionId: category.id, name: category.name, fingerprint: category.ballot.fingerprint })),
  classes: data.categories.flatMap(category => category.classes.map(group => ({ exhibitionId: category.id, className: group.name, works: group.works.length, thumbnails: group.works.filter(work => work.thumbnail).length, measured: rows.filter(row => (row.exhibitionId || 'first') === category.id && row.className === group.name).length }))),
  conversations: data.categories.flatMap(category => category.classes.flatMap(group => group.works.filter(work => work.thumbnailStatus === 'skipped-conversation').map(work => ({ exhibitionId: category.id, className: group.name, code: work.id.slice(0, 6), source: decodeURIComponent(work.source) })))),
  measured: rows.length,
  heightNeedsReview: rows.filter(row => row.review.status !== 'pass').map(row => ({ source: row.source, code: row.code, ...row.review })),
  scriptWarnings: rows.filter(row => row.scriptWarnings.length).map(row => ({ source: row.source, code: row.code, warnings: [...new Set(row.scriptWarnings)] })),
  scope: '桌面1100px／手機390px寬度的初始畫面、畫布比例與捲動高度檢查；不代表所有遊戲關卡與功能皆已測試。'
};
await fs.writeFile('reports/檢查結果.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
