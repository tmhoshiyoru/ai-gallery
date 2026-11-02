import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import '../js/vote-codec.js';

function fixture(count) {
  return { fingerprint: '0123456789abcdef', entries: Array.from({ length: count }, (_, i) => ({
    id: `work-${i}`, className: VoteCodec.classNames[i % 5], source: `作品/test-${i}.html`
  })) };
}
test('all six voter classes round-trip with correct same-class bonus at byte boundaries', () => {
  for (const count of [1, 7, 8, 9, 37, 1280]) {
    const catalog = fixture(count);
    for (const voter of VoteCodec.classNames) {
      const chosen = new Set(catalog.entries.filter((_, i) => i % 2 === 0).map(entry => entry.id));
      const code = VoteCodec.encode(catalog, voter, chosen);
      assert(code.length <= 256);
      const result = VoteCodec.decode(code, catalog);
      assert.equal(result.voterClass, voter);
      assert.deepEqual(result.rows.map(row => row.id), [...chosen]);
      for (const row of result.rows) assert.equal(row.points, voter !== '訪客' && voter === row.className ? 2 : 1);
    }
  }
});
test('all 1280 works fit within 250 ASCII characters', () => {
  const catalog = fixture(1280);
  const code = VoteCodec.encode(catalog, '一御', new Set(catalog.entries.map(entry => entry.id)));
  assert.equal(code.length, 250);
  assert.equal(VoteCodec.decode(code, catalog).rows.length, 1280);
  assert.throws(() => VoteCodec.encode(fixture(1281), '訪客', new Set(['work-0'])));
});
test('reject empty selections, unknown works, wrong snapshot, truncation and corruption', () => {
  const catalog = fixture(37);
  assert.throws(() => VoteCodec.encode(catalog, '訪客', new Set()));
  assert.throws(() => VoteCodec.encode(catalog, '訪客', new Set(['unknown'])));
  const code = VoteCodec.encode(catalog, '訪客', new Set(['work-3']));
  assert.throws(() => VoteCodec.decode(code, { ...catalog, fingerprint: 'fedcba9876543210' }));
  assert.throws(() => VoteCodec.decode(code.slice(0, -3), catalog));
  const bytes = Buffer.from(code.slice(4), 'base64url'); bytes[20] ^= 1;
  assert.throws(() => VoteCodec.decode('AV1.' + bytes.toString('base64url'), catalog));
});
test('current gallery code restores original filenames and preserves archived catalog', async () => {
  const context = { window: {} };
  vm.runInNewContext(await fs.readFile(new URL('../data/catalog.js', import.meta.url), 'utf8'), context);
  const catalog = context.window.GALLERY_CATALOG.ballot;
  const archive = JSON.parse(await fs.readFile(new URL(`../data/ballots/${catalog.fingerprint}.json`, import.meta.url), 'utf8'));
  const selected = new Set(catalog.entries.map(entry => entry.id));
  const code = VoteCodec.encode(catalog, '一御', selected);
  const result = VoteCodec.decode(code, archive);
  assert.equal(result.rows.length, selected.size);
  for (const row of result.rows) {
    assert(row.source.endsWith('.html'));
    await fs.access(new URL('../' + row.source, import.meta.url));
    assert.equal(row.points, row.className === '一御' ? 2 : 1);
  }
});
