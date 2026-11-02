import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { classifyWorks, coreTags } from '../scripts/classify-works.mjs';
function record(id, title) { return { id, source: `作品/第一個AI程式/一儉/test-${id}.html`, sourceHash: id, className: '一儉', html: `<title>${title}</title>` }; }
test('core genres remain labels, and space-themed breakout stays breakout', () => {
  const records = [record('a', 'Space Breakout 太空打磚塊'), record('b', 'Retro Snake'), record('c', 'Space Shooter'), record('d', 'Chrome Dino Runner')];
  const db = classifyWorks(records);
  assert.deepEqual(records.map(record => db.works[record.id].tag), coreTags);
});
test('new categories need at least five works; four memory games remain other', () => {
  const four = Array.from({ length: 4 }, (_, index) => record('m' + index, 'Memory 翻牌配對'));
  assert(four.every(record => classifyWorks(four).works[record.id].tag === '其他'));
  const five = [...four, record('m4', 'Memory 翻牌配對')];
  assert(five.every(record => classifyWorks(five).works[record.id].tag === '翻牌配對'));
});
test('every local work has a persistent tag and new labels meet threshold', async () => {
  const db = JSON.parse(await fs.readFile(new URL('../data/work-tags.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(db.works).length, Object.values(db.counts).reduce((sum, count) => sum + count, 0));
  for (const [tag, count] of Object.entries(db.counts)) if (tag !== '其他' && !coreTags.includes(tag)) assert(count >= 5);
  assert.equal(db.works.CD1C8B8766.tag, '打磚塊');
  assert.equal(db.works.C426CE2A9D.tag, '太空射擊');
});
