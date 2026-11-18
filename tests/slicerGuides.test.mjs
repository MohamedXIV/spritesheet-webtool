import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SLICE_SETTINGS,
  computeSliceLayout,
  convertLayoutToCustomGuides,
  normalizeSliceSettings,
  updateSettingsFromGuideDrag,
} from '../src/lib/slicerGuides.ts';

test('computeSliceLayout applies offset, spacing, and innerPadding in grid mode', () => {
  const layout = computeSliceLayout(100, 100, {
    sliceType: 'grid',
    cols: 2,
    rows: 2,
    offsetX: 10,
    offsetY: 10,
    spacingX: 10,
    spacingY: 10,
    innerPadding: 4,
    sliceAsMasks: false,
  });

  // availW = 100 - 10 - 10 = 80 -> cellW = 40
  assert.equal(layout.cols, 2);
  assert.equal(layout.rows, 2);
  assert.equal(layout.effectiveCellWidth, 40);
  assert.equal(layout.effectiveCellHeight, 40);
  assert.equal(layout.rects.length, 4);

  const [r0, r1, r2, r3] = layout.rects;
  assert.deepEqual(r0, {
    index: 0, row: 0, col: 0,
    x: 10, y: 10, w: 40, h: 40,
    innerX: 4, innerY: 4, innerW: 32, innerH: 32,
  });
  assert.deepEqual(r1, {
    index: 1, row: 0, col: 1,
    x: 60, y: 10, w: 40, h: 40,
    innerX: 4, innerY: 4, innerW: 32, innerH: 32,
  });
  assert.deepEqual(r2, {
    index: 2, row: 1, col: 0,
    x: 10, y: 60, w: 40, h: 40,
    innerX: 4, innerY: 4, innerW: 32, innerH: 32,
  });
  assert.deepEqual(r3, {
    index: 3, row: 1, col: 1,
    x: 60, y: 60, w: 40, h: 40,
    innerX: 4, innerY: 4, innerW: 32, innerH: 32,
  });
});

test('computeSliceLayout calculates dimensions mode with offset and spacing', () => {
  const layout = computeSliceLayout(128, 64, {
    sliceType: 'dimensions',
    cellWidth: 32,
    cellHeight: 32,
    offsetX: 8,
    offsetY: 0,
    spacingX: 8,
    spacingY: 0,
    innerPadding: 2,
  });

  // x positions: 8..40, 48..80, 88..120 (next 128..160 overflows) -> 3 cols x 2 rows = 6
  assert.equal(layout.cols, 3);
  assert.equal(layout.rows, 2);
  assert.equal(layout.rects.length, 6);
  assert.equal(layout.rects[0].x, 8);
  assert.equal(layout.rects[1].x, 48);
  assert.equal(layout.rects[2].x, 88);
  assert.equal(layout.rects[0].innerW, 28);
});

test('two-way linked guide drag updates offset, cellWidth, spacing, and transitions cleanly to custom guides', () => {
  const base = normalizeSliceSettings({
    ...DEFAULT_SLICE_SETTINGS,
    sliceType: 'dimensions',
    cellWidth: 32,
    cellHeight: 32,
    offsetX: 4,
    offsetY: 4,
    spacingX: 4,
    spacingY: 4,
  }, 128, 128);

  const afterOffset = updateSettingsFromGuideDrag(base, 128, 128, { kind: 'offset-x' }, 12);
  assert.equal(afterOffset.offsetX, 12);

  const afterStep = updateSettingsFromGuideDrag(afterOffset, 128, 128, { kind: 'step-x' }, 60);
  assert.equal(afterStep.sliceType, 'dimensions');
  assert.equal(afterStep.cellWidth, 48); // 60 - 12

  const afterSpacing = updateSettingsFromGuideDrag(afterStep, 128, 128, { kind: 'spacing-x' }, 66);
  assert.equal(afterSpacing.spacingX, 6); // 66 - 60

  const customInit = convertLayoutToCustomGuides(128, 128, {
    ...DEFAULT_SLICE_SETTINGS,
    sliceType: 'grid',
    cols: 2,
    rows: 2,
  });
  assert.deepEqual(customInit.colGuides, [0, 64, 128]);
  assert.deepEqual(customInit.rowGuides, [0, 64, 128]);

  const afterCustomDrag = updateSettingsFromGuideDrag(base, 128, 128, { kind: 'custom-x', index: 1 }, 28);
  assert.equal(afterCustomDrag.sliceType, 'custom');
  assert.equal(afterCustomDrag.customColGuides?.[1], 28);
});
