import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { encodeProjectBackup, decodeProjectBackup } from '../src/lib/portableProject.ts';

const bytes = async blob => Array.from(new Uint8Array(await blob.arrayBuffer()));
const png = (contents) => new Blob([new Uint8Array(contents)], { type: 'image/png' });

function makeProject(type = 'spritesheet') {
  return {
    id: 'project-123',
    name: 'Pixel character — حركات',
    type,
    createdAt: 1234,
    updatedAt: 5678,
    metadata: {
      fps: 12,
      loopMode: 'normal',
      selectedIds: ['one'],
      folders: [{ id: 'folder-main', name: 'Idle', frameIds: ['one'], visible: true, collapsed: false, color: '#123456' }],
      globalLayers: [{ id: 'layer-base', name: 'Base', visible: true, opacity: 1, blendMode: 'normal' }],
      pixelatorOptions: { enabled: true, palette: 'gameboy', pixelSize: 8 },
      sourceSheets: [{
        sourceId: 'sheet-source', folderId: 'folder-main', name: 'original.png',
        width: 4, height: 4, blob: png([137,80,78,71,0,4,0,3]),
        slice: { sliceType: 'grid', cols: 2, rows: 2, cellWidth: 2, cellHeight: 2 },
      }],
      trimsheetOptions: {
        resolution: 512,
        regions: [],
        materials: [{ id: 'material', uploadBlobs: [
          { channel: 'albedo', blob: png([1,2,3,4,5]) },
          { channel: 'normal', blob: png([5,4,3,2,1]) },
        ] }],
      },
    },
    frames: [
      { id: 'one', index: 0, timestamp: 0, durationMs: 250,
        sourceId: 'sheet-source', sourceColor: '#123456',
        blob: png([1,3,5,7]),
        layers: [
          { layerId: 'layer-base', blob: png([10,20,30]) },
          { layerId: 'layer-ink', blob: null },
        ],
      },
      { id: 'two', index: 1, timestamp: 0.25, sourceId: 'sheet-source',
        sourceColor: '#123456', blob: png([0,2,4,6]), layers: [] },
    ],
  };
}

test('portable project backup preserves frame PNGs, painted layers, timings, and original sheets', async () => {
  const original = makeProject();
  const encoded = await encodeProjectBackup(original);
  assert.equal(encoded[0], 0x50);
  assert.equal(encoded[1], 0x4b);
  const restored = await decodeProjectBackup(encoded);
  assert.equal(restored.id, original.id);
  assert.equal(restored.name, original.name);
  assert.equal(restored.type, original.type);
  assert.equal(restored.frames[0].durationMs, 250);
  assert.deepEqual(await bytes(restored.frames[0].blob), [1,3,5,7]);
  assert.deepEqual(await bytes(restored.frames[0].layers[0].blob), [10,20,30]);
  assert.equal(restored.frames[0].layers[1].blob, null);
  assert.deepEqual(await bytes(restored.metadata.sourceSheets[0].blob), [137,80,78,71,0,4,0,3]);
  assert.deepEqual(restored.metadata.sourceSheets[0].slice, original.metadata.sourceSheets[0].slice);
  assert.equal(restored.metadata.sourceSheets[0].blob.type, 'image/png');
  assert.deepEqual(await bytes(restored.metadata.trimsheetOptions.materials[1-1].uploadBlobs[1].blob), [5,4,3,2,1]);
  assert.deepEqual(restored.metadata.selectedIds, ['one']);
  assert.equal(restored.metadata.globalLayers[0].opacity, 1);
});

test('supports all persisted Spritecraft project types without losing binary attachments', async () => {
  for (const type of ['spritesheet','pixelator','3d-painter','trimsheet','stylizer']) {
    const project = makeProject(type);
    const result = await decodeProjectBackup(await encodeProjectBackup(project));
    assert.equal(result.type, type);
    assert.deepEqual(await bytes(result.frames[0].blob), [1,3,5,7]);
    assert.equal(result.metadata.pixelatorOptions.palette, 'gameboy');
  }
});

test('refuses archive files with missing Blob payloads and invalid checksums', async () => {
  const zipped = await encodeProjectBackup(makeProject());
  const contents = unzipSync(zipped);
  const keys = Object.keys(contents).filter(path=>path.startsWith('blobs/'));
  assert.ok(keys.length >= 4);

  const missing = { ...contents };
  delete missing[keys[0]];
  await assert.rejects(decodeProjectBackup(zipSync(missing)), /missing or corrupted/);

  const corrupted = { ...contents };
  corrupted[keys[0]] = strToU8('different-content');
  await assert.rejects(decodeProjectBackup(zipSync(corrupted)), /missing or corrupted/);
});

test('rejects unsupported versions, malformed data and malicious metadata keys', async () => {
  const zipped = await encodeProjectBackup(makeProject());
  const contents = unzipSync(zipped);
  const originalManifest = JSON.parse(strFromU8(contents['manifest.json']));
  const altered = { ...contents, 'manifest.json': strToU8(JSON.stringify({
    ...originalManifest, version: 999,
  })) };
  await assert.rejects(decodeProjectBackup(zipSync(altered)), /Unsupported/);

  const prototypePayload = JSON.parse(strFromU8(contents['manifest.json']));
  Object.defineProperty(prototypePayload.project.metadata, '__proto__', {
    value: { compromised: true }, enumerable: true, configurable: true,
  });
  const risky = { ...contents, 'manifest.json': strToU8(JSON.stringify(prototypePayload)) };
  await assert.rejects(decodeProjectBackup(zipSync(risky)), /unsafe data property/);
  assert.equal({}.compromised, undefined);

  await assert.rejects(decodeProjectBackup(new Uint8Array([1,2,3])), /valid .spritecraft/);
});

test('no extra, unreferenced archive files are accepted', async () => {
  const contents = unzipSync(await encodeProjectBackup(makeProject()));
  const unexpected = { ...contents, 'blobs/999999.bin': strToU8('extra') };
  await assert.rejects(decodeProjectBackup(zipSync(unexpected)), /unexpected or unreferenced/);
});

test('Blob checksum, MIME type, and typed raw bytes survive archive ZIP encryption-free roundtrip', async () => {
  const source = makeProject('pixelator');
  source.frames[0].blob = new Blob([new Uint8Array([0,255,34,128,42])], { type: 'application/octet-stream' });
  const imported = await decodeProjectBackup(await encodeProjectBackup(source));
  assert.equal(imported.frames[0].blob.type,'application/octet-stream');
  assert.deepEqual(await bytes(imported.frames[0].blob),[0,255,34,128,42]);
});

test('rejects duplicate ZIP member names before unpacking or importing', async () => {
  const encoded = await encodeProjectBackup(makeProject());
  // A ZIP filename appears in both local headers and the central directory.
  // Rename the second attachment to the first (equal-length ASCII paths).
  const manipulated = new Uint8Array(encoded);
  const oldName = new TextEncoder().encode('blobs/000002.bin');
  const duplicate = new TextEncoder().encode('blobs/000001.bin');
  let substitutions = 0;
  for (let offset = 0; offset <= manipulated.length - oldName.length; offset++) {
    if (oldName.every((byte, index) => manipulated[offset + index] === byte)) {
      manipulated.set(duplicate, offset);
      substitutions += 1;
      offset += oldName.length - 1;
    }
  }
  assert.ok(substitutions >= 2, 'archive should have matching local and central directory names');
  await assert.rejects(decodeProjectBackup(manipulated), /unsafe or oversized entries/);
});
