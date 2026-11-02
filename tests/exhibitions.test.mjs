import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { catalog } from '../scripts/build-catalog.mjs';
import '../js/vote-codec.js';
import '../js/vote-store.js';

class Storage {
  map = new Map();
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, value); }
}
function exhibition(id, voteId, fingerprint = '0123456789abcdef') {
  return { id, name: id, classes: [{ name: '一儉', works: [] }], ballot: {
    exhibitionId: id, voteId, codeVersion: id === 'first' ? 1 : 2, fingerprint,
    entries: [{ id: 'SHARED', className: '一儉', source: '一儉01.html' }]
  } };
}
test('drafts and voter identities stay independent even when work IDs coincide', () => {
  const storage = new Storage(), store = GalleryVoteStore.create(storage);
  const first = exhibition('first', 1), second = exhibition('second', 2);
  store.save(first, { voterClass: '一儉', selected: ['SHARED'], enabled: true, activeClass: '一儉' });
  assert.equal(store.load(second).voterClass, '');
  assert.deepEqual(store.load(second).selected, []);
  store.save(second, { voterClass: '訪客', selected: ['SHARED'], enabled: true });
  assert.equal(store.load(first).voterClass, '一儉');
  assert.equal(store.load(second).voterClass, '訪客');
  const reopened = GalleryVoteStore.create(storage);
  assert.deepEqual(reopened.load(first).selected, ['SHARED']);
  assert.deepEqual(reopened.load(second).selected, ['SHARED']);
  assert.notEqual(reopened.storageKey(first), reopened.storageKey(second));
});
test('legacy draft migrates only to first, and unavailable storage keeps separate in-memory drafts', () => {
  const storage = new Storage();
  storage.setItem('gallery-votes-v1', JSON.stringify({ voterClass: '一儉', selected: ['SHARED', 'REMOVED'], enabled: true }));
  const first = exhibition('first', 1), second = exhibition('second', 2), store = GalleryVoteStore.create(storage);
  assert.equal(store.load(second).voterClass, '');
  assert.deepEqual(store.load(first).selected, ['SHARED']);
  assert(storage.getItem('gallery-votes-v2:first'));
  const memory = GalleryVoteStore.create(undefined);
  assert.equal(memory.save(first, { voterClass: '一儉', selected: ['SHARED'] }), false);
  assert.deepEqual(memory.load(first).selected, ['SHARED']);
  assert.deepEqual(memory.load(second).selected, []);
});
test('AV2 binds the exhibition explicitly and fits 1280 works within 256 characters', () => {
  const second = exhibition('second', 2).ballot;
  const third = exhibition('third', 3).ballot;
  const first = exhibition('first', 1).ballot;
  const code = VoteCodec.encode(second, '一儉', new Set(['SHARED']));
  assert(code.startsWith('AV2.'));
  assert.equal(VoteCodec.decode(code, second).exhibitionId, 'second');
  assert.throws(() => VoteCodec.decode(code, third));
  assert.throws(() => VoteCodec.decode(code, first));
  const old = VoteCodec.encode(first, '訪客', new Set(['SHARED']));
  assert(old.startsWith('AV1.'));
  assert.throws(() => VoteCodec.decode(old, second));
  const large = { ...second, entries: Array.from({ length: 1280 }, (_, i) => ({ id: String(i), className: '一儉' })) };
  const full = VoteCodec.encode(large, '一儉', new Set(large.entries.map(entry => entry.id)));
  assert.equal(full.length, 255);
  assert.equal(VoteCodec.decode(full, large).rows.length, 1280);
});
test('builder namespaces works, tags, assets and snapshots while keeping first IDs and legacy fingerprint', async () => {
  const qa = path.resolve('.qa'); await fs.mkdir(qa, { recursive: true });
  const base = await fs.mkdtemp(path.join(qa, 'exhibitions-test-'));
  try {
    const definitions = [{ id: 'first', voteId: 1, name: '第一個AI程式', directory: '第一個AI程式', visible: true }, { id: 'second', voteId: 2, name: '第二展測試', directory: '第二展測試', visible: false }];
    await fs.mkdir(path.join(base, 'config'));
    await fs.writeFile(path.join(base, 'config/exhibitions.json'), JSON.stringify({ exhibitions: definitions }));
    for (const definition of definitions) {
      const folder = path.join(base, '作品', definition.directory, '一儉'); await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(path.join(folder, '一儉01.html'), '<!doctype html><html><head><title>Retro Snake</title></head><body><img src="asset.svg"></body></html>');
      await fs.writeFile(path.join(folder, 'asset.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    }
    const result = await catalog(base), [first, second] = result.categories;
    const one = first.classes[0].works[0], two = second.classes[0].works[0];
    assert.equal(one.id, createHash('sha256').update('一儉/一儉01.html').digest('hex').slice(0, 10).toUpperCase());
    assert.notEqual(one.id, two.id);
    assert.notEqual(first.ballot.fingerprint, second.ballot.fingerprint);
    assert.equal(first.ballot.fingerprint, createHash('sha256').update(JSON.stringify(first.ballot.entries)).digest('hex').slice(0, 16));
    assert.equal(second.visible, false);
    assert(two.url.startsWith('data/previews/second/'));
    assert.equal(two.thumbnailDirectory, 'data/exhibitions/second/thumbnails');
    const preview = path.join(base, decodeURIComponent(two.url));
    const html = await fs.readFile(preview, 'utf8');
    const baseHref = html.match(/<base href="([^"]+)"/)[1];
    await fs.access(fileURLToPath(new URL(baseHref + 'asset.svg', pathToFileURL(preview))));
    for (const category of result.categories) {
      const scope = path.join(base, 'data/exhibitions', category.id);
      const tags = JSON.parse(await fs.readFile(path.join(scope, 'work-tags.json')));
      assert.equal(Object.keys(tags.works).length, 1);
      await fs.access(path.join(scope, 'ballots', category.ballot.fingerprint + '.json'));
      const mapping = JSON.parse(await fs.readFile(path.join(scope, 'work-map.json')));
      assert.equal(mapping[0].exhibitionId, category.id);
    }
    for (const [index, definition] of definitions.entries()) {
      for (let seat = 1; seat <= (index === 0 ? 5 : 4); seat++) await fs.writeFile(path.join(base, '作品', definition.directory, '一儉', `一儉${String(seat).padStart(2, '0')}.html`), '<title>Memory 翻牌配對</title>');
    }
    const classified = await catalog(base);
    assert(classified.categories[0].classes[0].works.every(work => work.tag === '翻牌配對'));
    assert(classified.categories[1].classes[0].works.every(work => work.tag === '其他'));
    const oldFingerprint = first.ballot.fingerprint;
    await fs.writeFile(path.join(base, '作品/第一個AI程式/一儉/一儉02.html'), '<title>Breakout</title>');
    await catalog(base);
    const index = JSON.parse(await fs.readFile(path.join(base, 'data/exhibition-index.json')));
    assert(index.some(entry => entry.exhibitionId === 'first' && entry.fingerprint === oldFingerprint));
    definitions[1].voteId = 1;
    await fs.writeFile(path.join(base, 'config/exhibitions.json'), JSON.stringify({ exhibitions: definitions }));
    await assert.rejects(() => catalog(base));
  } finally {
    assert(path.resolve(base).startsWith(qa + path.sep));
    await fs.rm(base, { recursive: true, force: true });
  }
});
