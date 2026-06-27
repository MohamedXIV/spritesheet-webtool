# Trimsheet Builder — Design Spec

**Date:** 2026-06-28
**Status:** Approved design, pending implementation plan
**Tool route:** `src/app/tools/trimsheet`

## Summary

A new client-side tool: a **2D Trimsheet Builder**. The user lays out named
rectangular regions on a square trimsheet canvas, drags PBR materials
(Polyhaven or user-uploaded) onto regions, and the tool tiles each material into
its region across five synchronized PBR channels. Output is the five baked PNG
maps plus a region-metadata JSON, bundled as a `.zip`.

The region JSON is deliberately resolution-independent and engine-agnostic so it
can serve as the input contract for a **future, separate UV-mapping tool** (3D
model → trim regions). That UV tool is explicitly **out of scope** here.

This tool uses **no Three.js** — it is pure 2D canvas compositing.

## Scope decisions (from brainstorming)

- **2D authoring first.** UV control / mapping a 3D model onto the trimsheet is a
  separate future tool that consumes this tool's exported JSON.
- **Region model: grid + free hybrid.** Start from a grid/strip preset for speed;
  any region can then be freely moved, resized, split, or merged.
- **Output maps: full PBR set** — Albedo, Normal, Roughness, Metalness, AO (5
  synchronized channels), with fallbacks where a source lacks a channel.
- **Material fit: tiling with per-region controls** — scale, offset (x/y), and
  rotation (0/90/180/270). Tiling preserves texel density on long trim strips.
- **Material sources: Polyhaven + user upload** (both fully client-side). Flat
  color is an optional minor extra. Local procedural materials are dropped
  (albedo-only, too weak for a full-PBR tool).
- **Export: maps + region JSON + packed `.zip`.**
- **Resolution: square power-of-two presets** — 512, 1024, 2048.
- **Preview: 2D canvas only** (WYSIWYG). No 3D preview in v1.
- **Bake strategy: Approach A — eager dirty-rect compositing** into five resident
  buffers. Preview and export are the same pixels (no preview/export drift).

## Architecture

Follows the existing three-tool pattern exactly: a self-contained workspace page
owns all state and pushes it through a dedicated React context to
flexlayout-react dock panels. The heavy pixel logic lives in a pure, React-free
engine in `src/lib/`, mirroring `pixelator.ts` / `atlasPacker.ts`.

### New files

```
src/app/tools/trimsheet/
  page.tsx                      # workspace: owns state, assembles context, autosave
  page.module.css

src/contexts/
  TrimsheetContext.tsx          # context value (regions, materials, selection, baker ref)

src/lib/
  trimsheetBaker.ts             # PURE engine: 5 canvas buffers, dirty-rect compositing, PNG/zip export
  trimsheetTypes.ts             # Region, TrimMaterial, TrimsheetProject types
  trimsheetMaterials.ts         # Polyhaven fetch->5-map resolve + user-upload->material, with fallbacks

src/components/
  TrimsheetDockLayout.tsx       # PANEL_INFO + factory, localStorage layout, imperative ref
  TrimsheetMenuBar.tsx          # File/View menus (EditorMenuBar pattern)
  TrimsheetCanvas.tsx           # 2D viewport: draw regions, grid, selection, transform handles
  TrimsheetCanvas.module.css
  RegionPanel.tsx               # region list, grid generator, split/merge, resolution preset
  RegionPanel.module.css
  TrimMaterialPanel.tsx         # Polyhaven browser + user upload (adapted from MaterialLibraryPanel)
  TrimMaterialPanel.module.css
  RegionInspectorPanel.tsx      # per-region: material, tiling scale/offset/rotation, flat-color
  RegionInspectorPanel.module.css
  TrimsheetExportPanel.tsx      # resolution, per-map toggles, export .zip
  TrimsheetExportPanel.module.css
```

### Reused, not rebuilt

- Polyhaven fetch/blob pipeline — lifted from `MaterialLibraryPanel.tsx` into
  `trimsheetMaterials.ts`.
- `projectDatabase.ts` IndexedDB layer + `useProjectSave` hook (with a new
  `'trimsheet'` project type).
- Dock layout / menubar / context conventions from the existing tools.
- Launcher card on `src/app/page.tsx`; changelog drawer gains a `'trimsheet'`
  scope.

### Key boundary

`trimsheetBaker.ts` is a pure, React-free class. It knows nothing about panels.
The context holds a ref to one baker instance; panels call methods on it. This
keeps the heavy pixel logic independently testable and is the single mutation
sink for pixels.

## New dependency

`fflate` (~8KB, client-side zip) — no zip library currently exists in the repo.
Used only by the export path to bundle PNGs + JSON into one `.zip`.

## Data model (`trimsheetTypes.ts`)

```ts
// A texture map set — five channels, each an in-memory bitmap (or null if absent)
interface TrimMaterial {
  id: string;
  name: string;
  source: 'polyhaven' | 'upload' | 'flat';
  maps: {
    albedo:    ImageBitmap | null;
    normal:    ImageBitmap | null;
    roughness: ImageBitmap | null;
    metalness: ImageBitmap | null;
    ao:        ImageBitmap | null;
  };
  flatColor?: string;        // for source==='flat'; also fallback tint
  thumbnailUrl: string;
}

// A rectangular region on the trimsheet
interface Region {
  id: string;
  name: string;
  rect: { x: number; y: number; w: number; h: number };  // NORMALIZED 0..1
  materialId: string | null;
  tiling: {
    scale: number;          // repeats across the rect (1 = fill once)
    offsetX: number;        // 0..1
    offsetY: number;
    rotation: 0 | 90 | 180 | 270;
  };
}

// The whole project (what autosaves + what exports as JSON)
interface TrimsheetProject {
  resolution: 512 | 1024 | 2048;
  regions: Region[];
  // materials stored separately; project references them by id
}
```

### Deliberate choices

1. **Normalized rects (0..1), not pixels.** A region laid out at 1024 stays
   correct when switching to 2048; exported JSON is resolution-independent —
   exactly what a downstream UV tool wants. The baker multiplies by current
   resolution at composite time.
2. **Materials hold live `ImageBitmap`s** (following the `FrameData` convention).
   They must be explicitly disposed when a material is removed, same discipline
   as `disposeFrames`.
3. **Fallbacks live in the baker, not the data.** A source lacking metal/AO
   stores `null`, never a fabricated map — so fake data is never persisted and
   the fallback rule lives in exactly one place.

### Channel fallbacks (applied by the baker when a map is `null`)

- albedo → `flatColor` (or mid-grey if unset)
- normal → flat blue `#8080ff`
- roughness → mid-grey
- metalness → black
- ao → white

## The baker engine (`trimsheetBaker.ts`)

Owns five `OffscreenCanvas` buffers at the current resolution: albedo, normal,
roughness, metalness, AO. One instance per project, held by ref in the context.

### Public interface

```ts
class TrimsheetBaker {
  constructor(resolution: number);
  setResolution(res: number): void;          // reallocates buffers, re-composites all
  compositeRegion(region: Region, material: TrimMaterial | null): void;  // dirty-rect bake
  clearRegion(rect: NormRect): void;         // erase a rect across all 5 buffers
  getPreviewCanvas(): OffscreenCanvas;       // albedo buffer, for screen
  getChannel(ch: MapChannel): OffscreenCanvas;
  async export(opts): Promise<Blob>;         // PNGs + JSON -> zip
  dispose(): void;
}
```

### `compositeRegion` algorithm (run per-region on any change)

1. Convert the region's normalized rect → pixel rect at current resolution.
2. For each of the 5 channels: `save()` → `clip()` to the pixel rect → clear it.
3. Resolve the material's map for this channel; if `null`, use the channel
   fallback.
4. Draw the map **tiled** into the rect: a `CanvasPattern`
   (`createPattern(map, 'repeat')`) with a transform matrix built from
   `tiling.scale`, `offsetX/Y`, and `rotation`. Fill the clipped rect with the
   pattern.
5. `restore()`.

Clipping to the region's rect (step 2) means editing one region never touches
another's pixels — the "dirty-rect" efficiency. A full re-composite (on
resolution change or load) is just this loop over every region.

### Subtleties / known limitations

- **Tiling rotation rotates the material pattern *inside* the rect**, not the
  rect itself. Rects stay axis-aligned. This keeps the math to a pattern-matrix
  rotation — no rotated-rectangle compositing.
- **Normal-map tiling is honest but not seam-corrected.** Tiled normals are
  composited as raw RGB; normals are not re-oriented at tile boundaries. Standard
  and acceptable for modular trim (the target use case). Documented, not a
  surprise.

### Export

Encode each enabled channel buffer via `canvas.convertToBlob({type:'image/png'})`,
build the region JSON (names, normalized rects, material ids, tiling), and zip
all of it with `fflate`. Returns one `.zip` blob the panel triggers as a
download.

## Interaction & panels

### `TrimsheetCanvas.tsx` (viewport)

- Draws the albedo preview buffer, then overlays region outlines, names, grid,
  and selection handles on a transparent `<canvas>` on top.
- **Grid+free hybrid editing:** 8 handles (corners + edges) resize a region; the
  body drags to move. New regions via drag-to-draw, or "Apply grid" generates
  N×M regions. **Split** a selected region (H/V line → two regions); **merge**
  two adjacent selected regions into their bounding rect.
- **Snapping:** handles snap to a configurable grid (1/8, 1/16) and to neighboring
  region edges so strips stay flush; a modifier disables snap.
- All edits write normalized rects back to context state; changed region(s)
  re-composite via `baker.compositeRegion`.

### `RegionPanel.tsx`

Resolution preset dropdown (512/1024/2048), grid generator (rows × cols), region
list (select, rename, reorder, delete, visibility), split/merge buttons.

### `TrimMaterialPanel.tsx`

Adapted from `MaterialLibraryPanel`: Polyhaven search/browse grid + an upload
dropzone (drop albedo + optional normal/rough/metal/AO with a small map-slot
assigner). Each material shows a thumbnail and an "N/5 maps" badge. **Assign =
select a region, click/drag a material onto it** → fetches the full 5-map set
(with fallbacks) and composites.

### `RegionInspectorPanel.tsx`

For the selected region: assigned material (clear/replace), tiling
scale / offsetX / offsetY / rotation controls, and a flat-color picker (the
optional `'flat'` source). Live — every change re-composites that region.

### `TrimsheetExportPanel.tsx`

Per-channel export toggles (default all 5 on), resolution confirm, "Export .zip"
button with an async progress indicator (PNG-encode 5 buffers + zip).

### Error / edge handling (matches existing tool conventions)

- Polyhaven offline → inline message; upload still works (mirrors current
  `MaterialLibraryPanel` fallback).
- Material missing a channel → silent fallback, with an "N/5 maps" badge.
- Resolution downscale with existing regions → re-composite (normalized rects are
  safe); warn that re-export is needed.
- Region with no material → rendered as empty/checkerboard in preview, skipped in
  bake.

## Data flow (one full cycle)

```
User drags Polyhaven asset onto selected region
  -> trimsheetMaterials.ts fetches 5 map URLs, downloads blobs, createImageBitmap x5 (null where absent)
  -> new TrimMaterial added to context state; region.materialId set
  -> baker.compositeRegion(region, material) clips+tiles into 5 buffers
  -> TrimsheetCanvas redraws from baker.getPreviewCanvas()
  -> useProjectSave autosaves trimsheetOptions to IndexedDB
```

State lives in `page.tsx`, flows down through `TrimsheetContext`; the baker is
the single mutation sink for pixels. Panels never touch buffers directly — they
call baker methods via the context ref. Same "page owns state → context →
panels" shape as the other three tools.

## Persistence

- New project type `'trimsheet'`; `useProjectSave` gets `type: 'trimsheet'` + a
  `trimsheetOptions` blob (resolution, regions array, material descriptors).
- Material descriptors serialize by source: Polyhaven = asset id + resolved URLs
  (re-fetchable); upload = map blobs stored via the existing bitmap-serialization
  path in `projectDatabase.ts`; flat = color string.
- On load: rebuild materials (re-fetch Polyhaven / restore blobs), reconstruct
  the baker, full re-composite.
- Launcher card added to `src/app/page.tsx`; changelog drawer filter gains a
  `'trimsheet'` scope.

## Testing

No test runner in the repo; verification = `npm run build` + manual (per
CLAUDE.md).

- The pure baker is the part worth careful manual verification: composite a known
  material into a known rect, read back pixels, confirm tiling/rotation/fallbacks.
  React-free, so trivially unit-testable if a runner is ever added — a reason to
  keep it pure.
- Manual checklist: draw/resize/split/merge regions; assign Polyhaven + upload;
  tiling sliders update live; resolution switch preserves layout; export `.zip`
  opens with 5 PNGs + valid JSON; save→reload round-trips.

## Changelog discipline

Per `.cursorrules`, the feature lands with lockstep entries in `CHANGELOG.md` +
`src/data/changelog.ts` (new `'trimsheet'` toolScope), version bumped via SemVer.

## Out of scope for v1 (YAGNI / future UV tool)

3D viewport, model loading, UV editing/projection, normal-seam correction,
4096/non-square resolutions, local procedural materials.
