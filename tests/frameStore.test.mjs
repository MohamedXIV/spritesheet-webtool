import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSourceFrames, deleteFolder, deleteSelectedFrames, disposeFrames } from '../src/lib/frameStore.ts';

function makeState() {
  const bitmap = { closeCalled: 0, close() { this.closeCalled++; } };
  const frame = { id: 'one', index: 0, bitmap, sourceId: 'test', sourceColor: '#ffffff', timestamp: 0 };
  return {
    frame,
    bitmap,
    state: {
      frames: [frame],
      folders: [{ id: 'folder-main', name: 'Frames', frameIds: ['one'], visible: true, collapsed: false, color: '#ffffff' }],
      selectedIds: new Set(['one']),
    },
  };
}

test('deleting frames does not invalidate bitmaps retained by undo history', () => {
  const { state, bitmap, frame } = makeState();
  const next = deleteSelectedFrames(state);
  assert.equal(next.frames.length, 0);
  assert.equal(bitmap.closeCalled, 0);
  assert.equal(state.frames[0], frame);
});

test('deleting a folder does not invalidate historical frame data', () => {
  const { state, bitmap } = makeState();
  const next = deleteFolder(state, 'folder-main');
  assert.equal(next.frames.length, 0);
  assert.equal(bitmap.closeCalled, 0);
  assert.equal(state.frames.length, 1);
});

test('a sliced spritesheet batch joins an existing document without replacing earlier frames', () => {
  const { state, frame } = makeState();
  const image = { id: 'sheet-1', index: 0, timestamp: 0, bitmap: { close() {} },
    sourceId: 'sheet', sourceColor: '#ffffff' };
  const folder = { id: 'sheet-folder', name: 'Walk Cycle', frameIds: ['sheet-1'],
    visible: true, collapsed: false, color: '#ffffff' };
  const next = appendSourceFrames(state, [image], folder);

  assert.deepEqual(next.frames.map(item => item.id), ['one', 'sheet-1']);
  assert.deepEqual(next.folders.map(item => item.id), ['folder-main', 'sheet-folder']);
  assert.deepEqual([...next.selectedIds], ['sheet-1']);
  assert.equal(state.frames[0], frame, 'the historical document retains its bitmap');
  assert.equal(state.frames.length, 1, 'the older snapshot stays unchanged for Undo');
  assert.deepEqual([...state.selectedIds], ['one'], 'old selections are immutable');
});

test('sliced spritesheets can create the first document', () => {
  const frame = { id: 'first', index: 0, timestamp: 0, bitmap: { close() {} },
    sourceId: 'sheet', sourceColor: '#ffffff' };
  const folder = { id: 'sheet-1', name: 'Sheet', frameIds: ['first'],
    visible: true, collapsed: false, color: '#ffffff' };
  const next = appendSourceFrames(null, [frame], folder);
  assert.equal(next.frames.length, 1);
  assert.deepEqual([...next.selectedIds], ['first']);
  assert.equal(next.folders[0], folder);
});

test('disposeFrames closes shared layer bitmaps once and projectLayers survives mutations', () => {
  const sharedSheetBmp = { closeCalled: 0, close() { this.closeCalled++; } };
  const maskA = { closeCalled: 0, close() { this.closeCalled++; } };
  const maskB = { closeCalled: 0, close() { this.closeCalled++; } };
  const f1 = {
    id: 'f1', index: 0, timestamp: 0,
    bitmap: { close() {} },
    layers: { 'layer-base': { bitmap: sharedSheetBmp, maskBitmap: maskA, offsetX: 0, offsetY: 0 } },
    sourceId: 's', sourceColor: '#fff',
  };
  const f2 = {
    id: 'f2', index: 1, timestamp: 1,
    bitmap: { close() {} },
    layers: { 'layer-base': { bitmap: sharedSheetBmp, maskBitmap: maskB, offsetX: -16, offsetY: 0 } },
    sourceId: 's', sourceColor: '#fff',
  };
  const layersMeta = [{ id: 'layer-base', name: 'Base Frame', visible: true, opacity: 1, blendMode: 'normal' }];
  const state = {
    frames: [f1, f2],
    folders: [{ id: 'fld', name: 'F', frameIds: ['f1', 'f2'], visible: true, collapsed: false, color: '#fff' }],
    selectedIds: new Set(['f1']),
    projectLayers: layersMeta,
  };

  const afterDel = deleteSelectedFrames(state);
  assert.equal(afterDel.projectLayers, layersMeta);

  disposeFrames(state);
  assert.equal(sharedSheetBmp.closeCalled, 1);
  assert.equal(maskA.closeCalled, 1);
  assert.equal(maskB.closeCalled, 1);
});
