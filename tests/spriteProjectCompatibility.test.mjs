import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareSpriteProjectRestore,
  projectToolHref,
  restoreSpriteSources,
} from '../src/lib/spriteProjectCompatibility.ts';

function makeProject(overrides = {}) {
  return {
    id: 'pixelator-legacy-1',
    name: 'Run cycle',
    type: 'pixelator',
    createdAt: 100,
    updatedAt: 200,
    metadata: {
      fps: 12, loopMode: 'normal',
      selectedIds: ['frame-a'],
      folders: [{
        id: 'original-folder',
        name: 'Sprite Sheet',
        frameIds: ['frame-a'],
        visible: false,
        collapsed: true,
        color: '#abcdef',
      }],
      pixelatorOptions: { enabled: true, pixelSize: 4, palette: 'gameboy' },
      slicerOptions: { sliceType: 'grid', cols: 4, rows: 2, cellWidth: 16, cellHeight: 16 },
    },
    frames: [{
      id: 'frame-a', index: 0, timestamp: 0,
      sourceId: 'sheet-a', sourceColor: '#abcdef', blob: new Blob(['png-bytes']),
    }],
    ...overrides,
  };
}

test('old video and pixelator projects both route to canonical sprite editor', () => {
  assert.equal(projectToolHref(makeProject()), '/tools/sprite-editor?project=pixelator-legacy-1');
  assert.equal(projectToolHref(makeProject({ type: 'spritesheet', id: 'a&b' })), '/tools/sprite-editor?project=a%26b');
  assert.equal(projectToolHref(makeProject({ type: 'trimsheet' })), '/tools/trimsheet?project=pixelator-legacy-1');
  assert.equal(projectToolHref(makeProject({ type: '3d-painter' })), '/tools/3d-pixelator?project=pixelator-legacy-1');
});

test('opening legacy Pixelator never mutates its database record', () => {
  const project = makeProject();
  const originalMetadata = JSON.stringify(project.metadata);
  const plan = prepareSpriteProjectRestore(project);

  assert.equal(plan.type, 'pixelator', 'preserve type for subsequent saves');
  assert.equal(plan.frames[0], project.frames[0], 'do not re-encode or modify saved blobs');
  assert.equal(plan.folders[0].visible, false);
  assert.equal(plan.folders[0].collapsed, true);
  assert.deepEqual([...plan.selectedIds], ['frame-a']);
  assert.deepEqual(plan.globalLayers.map(layer => layer.id), ['layer-base']);
  assert.equal(JSON.stringify(project.metadata), originalMetadata);
});

test('missing/invalid folder references are recovered without deleting frames', () => {
  const project = makeProject({
    frames: [
      ...makeProject().frames,
      { id: 'frame-b', index: 1, timestamp: 1, sourceId: 'sheet-b', sourceColor: '#123456',
        blob: new Blob(['b']) },
    ],
    metadata: {
      ...makeProject().metadata,
      folders: [
        { id: 'old', name: 'Old', frameIds: ['frame-a','stale','frame-a'],
          visible: true, collapsed: false, color: '#fff' },
      ],
      selectedIds: ['frame-a','stale'],
    },
  });
  const plan = prepareSpriteProjectRestore(project);
  assert.deepEqual(plan.folders.map(folder => folder.frameIds), [['frame-a'],['frame-b']]);
  assert.deepEqual([...plan.selectedIds], ['frame-a']);
  assert.equal(project.metadata.folders[0].frameIds.length, 3, 'do not rewrite stored folders');
});

test('missing folder metadata and missing saved selections restore usefully', () => {
  const project = makeProject({
    metadata: { ...makeProject().metadata, folders: undefined, selectedIds: undefined },
  });
  const plan = prepareSpriteProjectRestore(project);
  assert.deepEqual(plan.folders[0].frameIds, ['frame-a']);
  assert.deepEqual([...plan.selectedIds], ['frame-a']);
});

test('custom paint layers survive and base layer is installed for old records', () => {
  const layers = [{ id: 'overlay-1', name: 'Ink', visible: false, opacity: .4, blendMode:'multiply' }];
  const project = makeProject({
    metadata: { ...makeProject().metadata, globalLayers: layers },
  });
  const plan = prepareSpriteProjectRestore(project);
  assert.deepEqual(plan.globalLayers.map(layer => layer.id), ['layer-base','overlay-1']);
  assert.equal(plan.globalLayers[1].visible, false);
  assert.equal(project.metadata.globalLayers.length, 1);
});

test('non-2D projects cannot be loaded into sprite editor and rewritten', () => {
  assert.throws(() => prepareSpriteProjectRestore(makeProject({type:'3d-painter'})), /different Spritecraft tool/);
});

test('media source list recovers for older Pixelator records and preserves new GIF source type', () => {
  const legacy = makeProject();
  const plan = prepareSpriteProjectRestore(legacy);
  assert.deepEqual(restoreSpriteSources(legacy, plan.folders), [
    { id:'sheet-a', name:'Sprite Sheet', frameCount:1, type:'image', color:'#abcdef' },
  ]);

  const withSources = makeProject({ metadata: {
    ...legacy.metadata,
    sources: [{ id:'sheet-a', name:'Animation.gif', frameCount:999, type:'gif', color:'#abcdef' }],
  }});
  const restored = restoreSpriteSources(withSources, plan.folders);
  assert.equal(restored[0].name, 'Animation.gif');
  assert.equal(restored[0].type, 'gif');
  assert.equal(restored[0].frameCount, 1, 'source count should reflect actual stored frames');
});
