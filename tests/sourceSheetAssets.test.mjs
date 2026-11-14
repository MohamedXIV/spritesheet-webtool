import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceSourceSheetFrames, restoreSourceSheetAssets } from '../src/lib/sourceSheetAssets.ts';

const frame = (id, sourceId) => ({id, sourceId, bitmap:{closed:false,close(){this.closed=true;}}, timestamp:0, index:0, sourceColor:'#eee'});
const folder = (id, ids) => ({id, name:id, frameIds:ids, visible:true, collapsed:false, color:'#eee'});

test('re-slicing a saved spritesheet replaces only its frames without invalidating Undo', () => {
  const oldA=frame('old-1','sheet'), oldB=frame('old-2','sheet'), unrelated=frame('other','video');
  const state={frames:[oldA,unrelated,oldB],folders:[folder('original',['old-1','other','old-2']),folder('second',[])],selectedIds:new Set(['old-1'])};
  const next=replaceSourceSheetFrames(state,'sheet',folder('original',[]),[frame('new-1','sheet'),frame('new-2','sheet')]);
  assert.deepEqual(next.frames.map(f=>f.id),['new-1','new-2','other']);
  assert.deepEqual(next.folders[0].frameIds,['new-1','new-2','other']);
  assert.equal(next.folders[1].frameIds.length,0);
  assert.deepEqual([...next.selectedIds],['new-1','new-2']);
  assert.deepEqual(state.folders[0].frameIds,['old-1','other','old-2']);
  assert.equal(state.frames[0],oldA);
  assert.equal(state.frames[2],oldB);
  assert.equal(oldA.bitmap.closed,false);
  assert.equal(oldB.bitmap.closed,false);
});

test('re-slice preserves other folders and recreates removed source folder', () => {
  const other=frame('image1','image');
  const state={frames:[other],folders:[folder('images',['image1'])],selectedIds:new Set(['image1'])};
  const next=replaceSourceSheetFrames(state,'saved-sheet',folder('imported',[]),[frame('sheet1','saved-sheet')]);
  assert.deepEqual(next.folders.map(f=>f.id),['images','imported']);
  assert.deepEqual(next.folders[0].frameIds,['image1']);
  assert.equal(next.folders[1].frameIds[0],'sheet1');
});

test('invalid re-slice refuses frames from another source', () => {
  const state={frames:[],folders:[],selectedIds:new Set()};
  assert.throws(()=>replaceSourceSheetFrames(state,'a',folder('f',[]),[frame('bad','b')]),/selected spritesheet/);
  assert.throws(()=>replaceSourceSheetFrames(state,'a',folder('f',[]),[]),/selected spritesheet/);
});

test('restore original Blob attachments for multiple sheets without cloning or losing bytes', async () => {
  const blobA=new Blob(['original-png-binary'],{type:'image/png'});
  const blobB=new Blob(['webp-binary'],{type:'image/webp'});
  const slice={sliceType:'grid',cols:2,rows:2,cellWidth:8,cellHeight:8};
  const values=[
    {sourceId:'a',folderId:'folder-a',name:'a.png',blob:blobA,width:16,height:16,slice},
    {sourceId:'b',folderId:'folder-b',name:'b.webp',blob:blobB,width:16,height:16,slice}
  ];
  const restored=restoreSourceSheetAssets(values);
  assert.equal(restored.length,2);
  assert.equal(restored[0].blob,blobA);
  assert.equal(await restored[1].blob.text(),'webp-binary');
  const idbLikeClone = structuredClone({ sourceSheets: restored });
  assert.equal(idbLikeClone.sourceSheets[0].blob instanceof Blob, true);
  assert.equal(await idbLikeClone.sourceSheets[0].blob.text(), 'original-png-binary');
  assert.equal(idbLikeClone.sourceSheets[1].sourceId, 'b');
  assert.equal(restoreSourceSheetAssets(undefined).length,0);
  assert.equal(restoreSourceSheetAssets([...values,values[0]]).length,2);
  assert.equal(restoreSourceSheetAssets([{...values[0],blob:null}]).length,0);
});
