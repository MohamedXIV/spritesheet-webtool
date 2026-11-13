import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteFolder, deleteSelectedFrames } from '../src/lib/frameStore.ts';

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
