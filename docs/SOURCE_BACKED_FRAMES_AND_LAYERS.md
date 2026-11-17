# Sprite Editor: source-backed frames & Layers 2.0

This design note records the staged migration from rasterized frame slices to
non-destructive editing **inside the existing Sprite Editor**. It is NOT a
request to create another Sprite Studio sub-tool.

## The data-loss mechanism

The historical slicer rendered grid cells to independent ImageBitmaps. The
resulting frame had no coordinates pointing back to the original sheet, even
though `ProjectMetadata.sourceSheets` now persists the uploaded Blob.
Re-slicing then replaced all frames belonging to a source, including painted
layers. This made accidental clipping difficult to repair safely.

The current Frame Editor also stores a composited `frame.bitmap` plus
per-frame rasterized `layerContents`. Layer visibility and reordering can
recompose every frame asynchronously, and full-frame bitmap history is heavy
for 120 frames x 10 layers.

## Increment 1 (PR #46): recover source crops without losing old frames

- Newly generated sheet frames store `sourceCrop: {sourceId,x,y,width,height}`.
- A new **Adjust Source Crop** section in Frame Editor renders from the saved
  original Blob, not from a previously clipped frame.
- X/Y and Width/Height can change independently for a pristine source-backed
  frame. The original stays untouched and Undo stores the previous frame.
- A painted/processed source base is flagged as modified. In-place correction
  refuses to discard it. Raster overlays also block in-place moving/resizing:
  their coordinates aren't yet source-relative.
- Re-slicing the saved sheet creates a **new variant** instead of replacing
  the existing animation and its layers.
- Save/Restore preserve crop metadata. Older projects without this metadata
  load unchanged and can create a new variant from their stored original sheet.

This is a safety foundation, **not yet fully non-destructive painting**.
The current crop renderer produces new cached frame bitmaps at Apply; the
source Blob and previous Undo snapshot remain intact. Raster paintings still
depend on the older frame-local canvas model.

## Increment 2: sparse animation cels (next)

```ts
type LayerKind = 'source' | 'raster' | 'mask' | 'adjustment';
interface SourceAsset {
  id: string;
  blob: Blob;
  width: number;
  height: number;
}
interface Cel {
  id: string;
  layerTrackId: string;
  frameId: string;
  kind: LayerKind;
  assetId?: string;
  sourceRect?: { x:number; y:number; width:number; height:number };
  transform: { x:number; y:number; scaleX:number; scaleY:number; rotation:number };
  opacity: number;
  visible: boolean;
}
```

Proposed semantics:

1. Immutable Source Assets and their exact bytes live outside editor history.
2. Frames reference Cels; a Layer Track can be sparse, empty, or linked.
3. Source Cels retain crop geometry and optional padding/overscan. Changing a
   crop never rewrites the original source.
4. Raster paint lives in separately owned Cels with explicit transforms,
   offsets and masks (not baked into the source layer).
5. Preview compositing is cached; export is a deliberate bake. Onion Skin,
   reference frames and guides never pollute baked output.
6. Command-based Undo tracks semantic edits, not entire full-size bitmaps.
7. Async composition jobs carry document/frame revision IDs to reject stale
   results, and own their ImageBitmap resources explicitly.

### Crop/canvas rules

- **Source crop**: chooses what pixels are read from the saved original.
- **Canvas/Frame bounds**: chooses how much space the rendered frame occupies.
- **Cel transform**: controls where each source/paint/mask element appears.
- **Pivot**: alignment marker (e.g., foot contact) independent of canvas bounds.

These are separate controls, never a single destructive "Crop and replace"
operation. Increasing canvas size must reveal more of the original image without
clipping pre-existing paint cels.

### Backwards compatibility

- Keep `DbProjectFrame.blob` / `layers` readers for existing saves.
- Treat older flattened frames as imported raster cels; do not fabricate
  unrecoverable missing pixels.
- Migrate on explicit "Save as v2" or through tested reversible adapters, not
  silent IndexedDB rewrites. Keep portable backup compatibility.
- Preserve standalone 3D Painter/Trimsheet/Stylizer project records.

## Increment 3: precise Frame Editor

- Drag handles for crop position/size on the original-sheet preview.
- Pixel-perfect guides, ruler, grid, pivot and snapping.
- Layer Transform X/Y controls and keyboard nudging.
- Per-frame and selected-frame operations; optional shared offsets by animation.
- Editable selection/mask tools (including eraser-as-mask).
- Onion Skin aligned in document coordinates, not only copied bitmaps.

## Verification checklist

- Correct a foot/hair that crosses a grid cell boundary: reveal the missing
  original pixels and export them at full quality.
- Save, refresh, reopen, Undo/Redo and export the corrected frame.
- Make a second slicing variant: the first animation and its painted layers
  must not change.
- Change crop on one of many frames: unrelated frame IDs, timings, selected
  frames and original blobs must remain unchanged.
- Paint on an overlay, move/expand the source, and verify the overlay is not
  clipped or moved incorrectly (requires Increment 2).
- Verify 120 frames x 10 sparse layers do not decode all possible cels.
- Test repeated quick layer visibility changes for stale async rendering and
  verify history never closes an ImageBitmap still referenced by active state.
