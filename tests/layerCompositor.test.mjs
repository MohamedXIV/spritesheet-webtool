import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ADJUSTMENT_CONFIG,
  applyAdjustmentToRgba,
  blendModeToCompositeOp,
  buildAdjustmentLut,
  buildRenderUnits,
  createBaseProjectLayer,
} from '../src/lib/layerCompositor.ts';

function makeLayer(id, overrides = {}) {
  return {
    ...createBaseProjectLayer(),
    id,
    name: id,
    ...overrides,
  };
}

test('buildRenderUnits groups consecutive clipped layers onto their base sibling', () => {
  const layers = [
    makeLayer('bg'),
    makeLayer('shade', { clipped: true }),
    makeLayer('rim', { clipped: true }),
    makeLayer('grp', { type: 'group' }),
    makeLayer('orphan-clip', { clipped: true }),
  ];

  const units = buildRenderUnits(layers, null);
  assert.equal(units.length, 3);
  assert.equal(units[0].base.id, 'bg');
  assert.deepEqual(units[0].clippedChain.map(l => l.id), ['shade', 'rim']);
  assert.equal(units[1].base.id, 'grp');
  assert.equal(units[1].clippedChain.length, 0);
  // Clipped layer right after a group starts its own unit rather than clipping onto a folder
  assert.equal(units[2].base.id, 'orphan-clip');
});

test('buildRenderUnits respects parentId hierarchy for nested group children', () => {
  const layers = [
    makeLayer('grp', { type: 'group' }),
    makeLayer('child-a', { parentId: 'grp' }),
    makeLayer('child-b', { parentId: 'grp', clipped: true }),
    makeLayer('top'),
  ];

  const rootUnits = buildRenderUnits(layers, null);
  assert.deepEqual(rootUnits.map(u => u.base.id), ['grp', 'top']);

  const grpUnits = buildRenderUnits(layers, 'grp');
  assert.equal(grpUnits.length, 1);
  assert.equal(grpUnits[0].base.id, 'child-a');
  assert.deepEqual(grpUnits[0].clippedChain.map(l => l.id), ['child-b']);
});

test('adjustment LUT and RGBA transform handle invert, posterize, brightness, and transparent alpha preservation', () => {
  const lutInvert = buildAdjustmentLut({ ...DEFAULT_ADJUSTMENT_CONFIG, invert: true });
  assert.equal(lutInvert[0], 255);
  assert.equal(lutInvert[255], 0);

  const rgba = new Uint8ClampedArray([
    10, 20, 30, 255,
    10, 20, 30, 0, // transparent pixel should not be modified
  ]);
  applyAdjustmentToRgba(rgba, { ...DEFAULT_ADJUSTMENT_CONFIG, invert: true });
  assert.equal(rgba[0], 245);
  assert.equal(rgba[1], 235);
  assert.equal(rgba[2], 225);
  assert.equal(rgba[3], 255);
  assert.equal(rgba[4], 10);
  assert.equal(rgba[7], 0);
});

test('blendModeToCompositeOp maps normal to source-over and preserves other blend modes', () => {
  assert.equal(blendModeToCompositeOp('normal'), 'source-over');
  assert.equal(blendModeToCompositeOp('multiply'), 'multiply');
  assert.equal(blendModeToCompositeOp('luminosity'), 'luminosity');
});
