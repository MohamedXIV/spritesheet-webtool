import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'src/data/lpcManifest.json'), 'utf8'));
const credits = JSON.parse(readFileSync(resolve(root, 'src/data/lpcCredits.json'), 'utf8'));

test('LPC starter pack includes both bases, compatible clothes, expressions, and attributed overlays', () => {
  const ids = manifest.assets.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length, 'asset IDs must be unique');
  for (const id of ['body-male', 'body-female', 'head-male', 'head-female', 'hair-bob', 'eyes-sad', 'top-tee-male', 'top-tee-female']) {
    assert.ok(ids.includes(id), `${id} should be importable`);
  }
  assert.ok(manifest.sourceRevision.match(/^[0-9a-f]{40}$/));
});

test('Every LPC overlay has matching action dimensions and attribution', () => {
  const expectedFrames = { idle: 2, walk: 9, run: 8, slash: 6 };
  assert.deepEqual(manifest.actions, Object.keys(expectedFrames));
  for (const asset of manifest.assets) {
    for (const action of manifest.actions) {
      const png = resolve(root, 'public/lpc', asset.id, `${action}.png`);
      assert.ok(existsSync(png), `${asset.id}/${action} PNG is missing`);
      const buffer = readFileSync(png);
      assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
      assert.equal(buffer.readUInt32BE(16), expectedFrames[action] * 64, `${png} has wrong frame count`);
      assert.equal(buffer.readUInt32BE(20), 4 * 64, `${png} has wrong direction count`);
      const credit = credits[`${asset.id}/${action}`];
      assert.ok(credit?.filename && credit?.authors && credit?.licenses && credit?.urls,
        `${asset.id}/${action} is missing attribution`);
    }
  }
});
