import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sourceCropForCell, editSourceCrop, isSourceCrop, reframeFromOriginal,
} from '../src/lib/sourceCrop.ts';
import { appendSourceFrames } from '../src/lib/frameStore.ts';

const makeAsset = () => ({
  sourceId: 'sheet', folderId: 'folder-1', name: 'source.png',
  width: 96, height: 64,
  blob: new Blob(['original-unmodified-data'], { type: 'image/png' }),
  slice: { sliceType: 'grid', cols: 3, rows: 2, cellWidth: 32, cellHeight: 32 },
});

test('each frame has a stable crop in ORIGINAL sheet coordinates', () => {
  assert.deepEqual(sourceCropForCell('sheet', 0, 0, 32, 32),
    { sourceId:'sheet', x:0, y:0, width:32, height:32 });
  assert.deepEqual(sourceCropForCell('sheet', 2, 1, 32, 32),
    { sourceId:'sheet', x:64, y:32, width:32, height:32 });
  assert.throws(() => sourceCropForCell('sheet', -1, 0, 32, 32), RangeError);
});

test('lost pixels can be recovered by moving or expanding the source-space crop', () => {
  const oldCrop = sourceCropForCell('sheet', 1, 0, 32, 32);
  const corrected = editSourceCrop(oldCrop, { x: 29, y: 0, width: 40, height: 36 }, 96, 64);
  assert.deepEqual({x:corrected.x,y:corrected.y,width:corrected.width,height:corrected.height},
    {x:29,y:0,width:40,height:36});
  assert.deepEqual(oldCrop, { sourceId:'sheet', x:32,y:0,width:32,height:32 },
    'original crop and undo snapshot are not mutated');
  assert.throws(() => editSourceCrop(oldCrop, {x:96,y:0,width:32,height:32},96,64),RangeError);
  assert.throws(() => editSourceCrop(oldCrop, {x:32,y:0,width:0,height:32},96,64),RangeError);
});

test('edits to original source layer prohibit silent data loss', () => {
  const locked = { ...sourceCropForCell('sheet',0,0,32,32), baseModified:true };
  assert.throws(() => editSourceCrop(locked,{x:1,y:0,width:32,height:32},96,64), /edits on its source layer/);
});

test('crop renderer refuses canvas expansion when painted overlay bitmaps exist', async () => {
  const asset = makeAsset();
  const crop = sourceCropForCell('sheet',0,0,32,32);
  const frame = {
    id:'frame-1', bitmap: {width:32,height:32}, sourceId:'sheet',
    sourceColor:'#fff', index:0, timestamp:0,
    sourceCrop:crop,
    layerContents: {'layer-base':{width:32,height:32}, 'layer-paint':{width:32,height:32}},
  };
  await assert.rejects(reframeFromOriginal(frame,asset,{...crop,width:48},[]),/cel transforms/);
  assert.deepEqual(frame.sourceCrop,crop);
  assert.equal(frame.layerContents['layer-paint'].width,32);
  await assert.rejects(reframeFromOriginal(frame,{...asset,sourceId:'different'},crop,[]),/not linked/);
});

test('source-backed crop metadata and binary source survive structuredClone', async () => {
  const crop = sourceCropForCell('sheet',1,1,32,32);
  const {asset, frame} = structuredClone({
    asset:makeAsset(),
    frame:{id:'f', sourceId:'sheet', sourceCrop:crop},
  });
  assert.deepEqual(frame.sourceCrop,crop);
  assert.equal(await asset.blob.text(),'original-unmodified-data');
});

test('re-slice variant appends a NEW source rather than changing painted originals', () => {
  const oldFrame = {
    id:'old', sourceId:'sheet', sourceCrop:sourceCropForCell('sheet',0,0,32,32),
    layerContents:{'layer-paint':{unmodified:true}}, bitmap:{unchanged:true}
  };
  const previous = {
    frames:[oldFrame],
    folders:[{id:'old-folder',name:'Original',frameIds:['old'],visible:true,collapsed:false,color:'#fff'}],
    selectedIds:new Set(['old']),
  };
  const nextFrame = {id:'variant',sourceId:'sheet-copy',sourceCrop:sourceCropForCell('sheet-copy',0,0,40,40)};
  const variant = appendSourceFrames(previous,[nextFrame],{
    id:'variant-folder',name:'Corrected',frameIds:['variant'],visible:true,collapsed:false,color:'#eee'
  });
  assert.equal(variant.frames[0],oldFrame);
  assert.deepEqual(variant.frames.map(f=>f.id),['old','variant']);
  assert.deepEqual(previous.folders[0].frameIds,['old']);
  assert.equal(oldFrame.layerContents['layer-paint'].unmodified,true);
});
