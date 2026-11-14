import test from 'node:test';
import assert from 'node:assert/strict';
import {
  updateFrameDurations,
  sequenceDurationMs,
  MIN_FRAME_DURATION_MS,
  MAX_FRAME_DURATION_MS,
} from '../src/lib/timelineFrameTiming.ts';
import { resolveFrameDurationMs, gifCentisecondDelay } from '../src/lib/gifTiming.ts';

function makeState() {
  const bitmap = { width: 8, height: 8, close() { throw new Error('timing must not dispose bitmaps'); } };
  const frames = [
    { id: 'a', index: 0, timestamp: 0, bitmap, durationMs: 80, sourceId: 'gif', sourceColor: '#fff' },
    { id: 'b', index: 1, timestamp: 0.08, bitmap, durationMs: 250, sourceId: 'gif', sourceColor: '#fff' },
    { id: 'c', index: 2, timestamp: 0.33, bitmap, sourceId: 'video', sourceColor: '#fff' },
  ];
  return {
    frames,
    folders: [{ id: 'f', name: 'Frames', frameIds: ['a', 'b', 'c'], visible: true, collapsed: false, color: '#fff' }],
    selectedIds: new Set(['a', 'b']),
  };
}

test('editing a frame duration is an immutable document operation that preserves bitmaps for Undo', () => {
  const previous = makeState();
  const changed = updateFrameDurations(previous, new Set(['a']), 450);

  assert.notEqual(changed, previous);
  assert.notEqual(changed.frames[0], previous.frames[0]);
  assert.equal(changed.frames[0].durationMs, 450);
  assert.equal(previous.frames[0].durationMs, 80);
  assert.equal(changed.frames[0].bitmap, previous.frames[0].bitmap);
  assert.equal(changed.frames[1], previous.frames[1], 'unaffected frames preserve identity');
  assert.equal(changed.folders, previous.folders);
  assert.equal(changed.selectedIds, previous.selectedIds);
});

test('multi-selection timing update changes only selected frames and supports clearing overrides', () => {
  const original = makeState();
  const ids = original.selectedIds;
  const updated = updateFrameDurations(original, ids, 120);
  assert.deepEqual(updated.frames.map(frame => frame.durationMs), [120,120,undefined]);
  const revertedToFps = updateFrameDurations(updated, ids, null);
  assert.deepEqual(revertedToFps.frames.map(frame => frame.durationMs), [undefined,undefined,undefined]);
  assert.equal(resolveFrameDurationMs(revertedToFps.frames[0], 20), 50);
  assert.equal(original.frames[0].durationMs,80,'old Undo snapshot is unchanged');
});

test('no-op timing edits keep exact document identity (no extra Undo snapshot)', () => {
  const state=makeState();
  assert.equal(updateFrameDurations(state,new Set(['a']),80),state);
  assert.equal(updateFrameDurations(state,new Set(['missing']),120),state);
  assert.equal(updateFrameDurations(state,new Set(),120),state);
});

test('invalid or out-of-range frame durations never enter the saved document', () => {
  const state=makeState();
  for (const bad of [NaN,Infinity,1,9,60001,1.5,-1]) {
    assert.throws(()=>updateFrameDurations(state,new Set(['a']),bad),RangeError);
  }
  assert.equal(MIN_FRAME_DURATION_MS,10);
  assert.equal(MAX_FRAME_DURATION_MS,60000);
});

test('timeline sequence duration sums individual holds and FPS-based frames', () => {
  const state=makeState();
  assert.equal(sequenceDurationMs(state.frames,20),80+250+50);
  assert.equal(sequenceDurationMs(state.frames.slice(0,2),60),330);
  assert.equal(sequenceDurationMs([],12),0);
  const updated=updateFrameDurations(state,new Set(['a']),75);
  assert.equal(sequenceDurationMs(updated.frames,20),75+250+50);
  assert.equal(gifCentisecondDelay(updated.frames[0].durationMs),80,
    'GIF export quantizes ms only when encoded');
});
