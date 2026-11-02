import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/vote-rules.js';
const entries = Array.from({ length: 12 }, (_, index) => ({ id: `own-${index + 1}`, className: '一讓', source: `作品/第一個AI程式/一讓/一讓${String(index + 1).padStart(2, '0')}.html` }));
entries.push({ id: 'duplicate', className: '一讓', source: '作品/第一個AI程式/一讓/一讓01-02.html' });
entries.push({ id: 'other', className: '一儉', source: '作品/第一個AI程式/一儉/一儉01.html' });
const catalog = { entries };
test('own-class votes require ten works; two versions by one student count as two', () => {
  const selected = new Set(entries.slice(0, 9).map(entry => entry.id));
  assert.equal(VoteRules.evaluate(catalog, '一讓', selected).valid, false);
  selected.add('other');
  assert.deepEqual(VoteRules.evaluate(catalog, '一讓', selected), { valid: false, ownCount: 9, minimum: 10 });
  selected.add('duplicate');
  assert.deepEqual(VoteRules.evaluate(catalog, '一讓', selected), { valid: true, ownCount: 10, minimum: 10 });
});
test('only visitors are exempt; other-class votes cannot replace ten own-class works', () => {
  assert.equal(VoteRules.evaluate(catalog, '訪客', new Set(['own-1'])).valid, true);
  assert.equal(VoteRules.evaluate(catalog, '一讓', new Set(['other'])).valid, false);
  assert.equal(VoteRules.evaluate(catalog, '一讓', new Set()).valid, false);
  assert.equal(VoteRules.evaluate(catalog, '一讓', new Set(entries.slice(0, 10).map(entry => entry.id))).valid, true);
});
