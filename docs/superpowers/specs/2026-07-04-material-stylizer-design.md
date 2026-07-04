# Material Stylizer — Design Spec

**Date:** 2026-07-04
**Tool route:** `src/app/tools/stylizer`
**Status:** Approved design, pending implementation plan

## Summary

A new self-contained browser tool that converts realistic textures and PBR
materials into stylized, hand-painted looks. The user loads a material (albedo
plus optional normal/roughness/metallic/AO/height maps), picks a stylized look
(painterly, cel, watercolor, or sketch), tunes it with live preview, and exports
the resulting map set. Fully client-side and deterministic (algorithmic core),
with an optional AI img2img pass via the existing `generate-texture` API route.

The tool mirrors the existing per-tool architecture in this repo (each tool is an
isolated workspace under `src/app/tools/<name>/` with its own page, dock layout,
and context). It reuses the pure-engine pattern of `src/lib/pixelator.ts` and the
`ThreePainter` engine for the optional 3D preview.

## Goals

- Turn a realistic albedo/texture into a stylized one across four looks.
- Treat a full PBR material set, not just a single image.
- Bake AO + a soft shading pass into the stylized albedo (baked-lighting look
  typical of stylized game textures).
- Regenerate normal and height maps from the stylized albedo so surface detail
  matches the new brushwork.
- Live 2D before/after preview, with an optional 3D material preview on a mesh.
- Export the chosen maps as a zip (or individually).
- Persist projects to IndexedDB like the other tools.

## Non-Goals (YAGNI)

- No server-side processing beyond the existing optional `generate-texture` route.
- No seam-fixing / re-tiling engine (tiled preview only shows seams; does not fix
  them).
- No material authoring from scratch — the tool transforms loaded maps only.
- No animation / frame timeline (this is a still-material tool).
- Roughness/metallic get pass-through by default with an optional simple
  "flatten" (posterize/reduce) — no advanced roughness synthesis.

## Architecture

Chosen approach: **new self-contained tool** (`tools/stylizer`), mirroring
`trimsheet` and `pixelator`. Rationale: the repo's convention is one isolated
workspace per tool folder; the stylizer's map-slot state does not fit the
frame-based `EditorContext`, so it gets its own context. Existing tools are
untouched, minimizing regression risk. The `ThreePainter` engine is reused
read-only for the optional 3D preview.

### New files

| File | Purpose |
|---|---|
| `src/app/tools/stylizer/page.tsx` | Tool page: owns all state, assembles context value, renders menubar + dock layout. |
| `src/app/tools/stylizer/page.module.css` | Page-level layout styles (mirrors other tools). |
| `src/lib/stylizer.ts` | Pure stylization engine + map-regeneration helpers. No React. |
| `src/contexts/StylizerContext.tsx` | Context + provider + `useStylizerContext()` hook. |
| `src/components/StylizerDockLayout.tsx` (+ `.module.css`) | flexlayout dock, `PANEL_INFO` + factory, imperative ref. |
| `src/components/StylizerMenuBar.tsx` (+ `.module.css`) | File / View / Help menubar. |
| `src/components/StylizerMaterialLoaderPanel.tsx` (+ `.module.css`) | Per-slot map drop zones, filename auto-detect, new/reset. |
| `src/components/StylizerStylePanel.tsx` (+ `.module.css`) | Style selector + per-style knobs + shared pre/post knobs. |
| `src/components/StylizerMapOutputPanel.tsx` (+ `.module.css`) | Bake / regenerate / flatten toggles + result thumbnails. |
| `src/components/StylizerPreviewPanel.tsx` (+ `.module.css`) | 2D before/after wipe slider + 2x2 tile toggle. |
| `src/components/StylizerPreview3DPanel.tsx` (+ `.module.css`) | Optional 3D material preview using `ThreePainter`. |
| `src/components/StylizerExportPanel.tsx` (+ `.module.css`) | Map selection, format, naming, zip download. |

### Modified files

| File | Change |
|---|---|
| `src/lib/projectDatabase.ts` | Add `'stylizer'` to the two project-type unions. |
| `src/lib/frameStore.ts` | Extend `serializeProject` (or add a sibling serializer) to store map-slot blobs + `StylizerOptions`. |
| `src/data/changelog.ts` | Add `'stylizer'` to `toolScope` union + a new `ChangelogVersion` entry. |
| `CHANGELOG.md` | Matching Keep-a-Changelog entry (lockstep). |
| `src/app/page.tsx` | Launcher: nav link, tool card, changelog filter option, project badge + deep-link. |

## The engine (`src/lib/stylizer.ts`)

Pure and framework-free, mirroring `pixelator.ts`:

```ts
export interface StylizerOptions {
  style: 'painterly' | 'cel' | 'watercolor' | 'sketch';

  // Shared pre-stage
  smoothRadius: number;      // Kuwahara / generalized-mean radius (main "brush size")
  bilateralPreSmooth: boolean;
  contrast: number;          // -100..100
  saturation: number;        // -100..100
  brightness: number;        // -100..100

  // Painterly
  brushStrength: number;     // directional smear strength
  detailPreserve: number;

  // Cel
  levels: number;            // posterize bands
  celSmoothing: number;
  paletteSnap: boolean;

  // Watercolor
  bleed: number;
  granulation: number;
  washStrength: number;

  // Sketch
  lineStrength: number;
  lineThreshold: number;
  hatching: boolean;

  // Shared post-stage
  outlineEnabled: boolean;
  outlineColor: string;
  outlineThickness: number;

  // AO + shading bake
  bakeAO: boolean;
  bakeShading: boolean;      // soft top-down light pass from height/normal
  bakeStrength: number;

  // Map regeneration
  regenerateNormal: boolean;
  normalStrength: number;
  regenerateHeight: boolean;
  flattenRoughness: boolean;
  flattenMetallic: boolean;
}

export const DEFAULT_STYLIZER_OPTIONS: StylizerOptions = { /* ... */ };

// Core: stylize the albedo only.
export function stylize(albedo: ImageBitmap, opts: StylizerOptions): Promise<ImageBitmap>;

// Bake AO + optional soft shading into an already-stylized albedo.
export function bakeLighting(
  stylizedAlbedo: ImageBitmap,
  ao: ImageBitmap | undefined,
  height: ImageBitmap | undefined,
  opts: StylizerOptions,
): Promise<ImageBitmap>;

// Derive maps from the stylized albedo.
export function regenerateNormal(albedo: ImageBitmap, strength: number): Promise<ImageBitmap>;
export function regenerateHeight(albedo: ImageBitmap): Promise<ImageBitmap>;

// Optional simplification of pass-through maps.
export function flattenMap(map: ImageBitmap, levels: number): Promise<ImageBitmap>;
```

### Pipeline stages

1. **Pre-stage (shared):** Kuwahara / generalized-mean edge-preserving smooth
   (radius = `smoothRadius`), optional bilateral pre-smooth, then
   contrast/saturation/brightness (same trio the pixelator exposes).
2. **Style stage (one of):**
   - `painterly` — higher-radius Kuwahara + directional smear along the structure
     tensor → brush-stroke look.
   - `cel` — posterize luminance into `levels` bands + optional palette snap →
     flat color zones.
   - `watercolor` — bilateral wash + desaturated pigment + paper-grain multiply +
     edge darkening (pigment pooling).
   - `sketch` — Sobel/DoG edge extraction → ink lines over a flattened/posterized
     tone, optional cross-hatch overlay.
3. **Post-stage (shared):** outline/ink pass (edge-detect → dark line, reusing the
   `outlineGenerator.ts` approach), then AO + shading bake via `bakeLighting`.
4. **Map regeneration (separate helpers):** `regenerateNormal` (Sobel on stylized
   luminance → tangent-space normal), `regenerateHeight` (luminance → blurred
   grayscale). Roughness/metallic/source-normal pass through unless flattened.

### Performance

- All work on `OffscreenCanvas` / `ImageBitmap` with typed arrays.
- Preview runs at a capped resolution (e.g. ≤1024 on the long edge); export runs
  at full source resolution.
- The Kuwahara pass is the perf-sensitive step; radius is bounded and the preview
  cap keeps it real-time. Stylization runs in a debounced effect.

## Material model & state

Held in `StylizerContext` (not the frame store — these are named slots, not
ordered frames):

```ts
type MapSlot = 'albedo' | 'normal' | 'roughness' | 'metallic' | 'ao' | 'height';

interface StylizerMaterial {
  maps: Partial<Record<MapSlot, ImageBitmap>>;   // source maps as loaded
  resolution: { width: number; height: number }; // from albedo
}
```

- Only `albedo` is required. AO drives the bake; normal/height feed the shading
  pass and are the regen targets.
- Derived results (stylized albedo, regenerated normal/height) are cached
  `ImageBitmap`s recomputed by a debounced effect when sources or options change.
- `ImageBitmap`s are explicitly disposed on replace/reset/unmount (repo rule:
  bitmaps must be closed to avoid GPU leaks).

## Panels (registered in `StylizerDockLayout`)

| Panel id | Purpose |
|---|---|
| `material-loader` | Per-slot drop zones. Auto-detect slot from filename suffix (`_albedo`, `_basecolor`, `_normal`, `_nrm`, `_roughness`, `_rough`, `_metallic`, `_metal`, `_ao`, `_occlusion`, `_height`, `_disp`), else drag onto a slot. New / reset material. |
| `style` | `style` selector + that style's knobs + shared pre/post knobs (smooth radius, contrast trio, outline, AO-bake strength). Debounced live updates. |
| `map-output` | Toggles + strength for bake AO+shading, regenerate normal, regenerate height, flatten roughness/metallic. Thumbnails of each resulting map. |
| `preview-2d` | Primary canvas: before/after wipe slider of the albedo; 2x2 tile toggle to inspect seams. |
| `preview-3d` | Optional: `ThreePainter` read-only rendering the full stylized material on a rotatable sphere/cube under a light. Opened from the View menu. |
| `export` | Choose maps to export, PNG format, naming convention, download zip (or individual). |
| `ai-stylize` (optional, phase 2) | Optional AI img2img via existing `generate-texture` route; dev-only, non-deterministic. |

## Data flow

Load maps → `StylizerContext` holds sources → Style / Map-Output panels write
`StylizerOptions` → debounced effect runs `stylize()` + `bakeLighting()` + regen
helpers at capped preview resolution → previews read cached results → Export
re-runs the same pipeline at full resolution and zips the selected maps.

## Menu bar (`StylizerMenuBar`)

- **File:** New, Save (Ctrl+S), Save As, Load, Export.
- **View:** toggle each panel + reset layout (imperative dock ref, matching other
  tools).
- **Help:** open Changelog filtered to `stylizer`.

Keyboard: Ctrl+S save (matches other tools). Undo/redo is out of scope for v1
(options are cheap to re-tune; no destructive frame history). `beforeunload`
warning when a project is dirty.

## Persistence

- New project type `'stylizer'`.
- Save serializes **source maps** (as blobs, per slot) + `StylizerOptions` +
  project name/id. Derived maps are NOT stored; they are recomputed on load
  (mirrors how the trimsheet re-hydrates its derived data).
- `frameStore.ts` serialization extended to handle map-slot blobs, or a sibling
  serializer added for the stylizer's non-frame shape.
- Deep-link restore via `?project=<id>` like the other tools.

## Launcher wiring (`src/app/page.tsx`)

- Nav link: `🎨 Material Stylizer`.
- Tool card with description + "Launch Material Stylizer" + changelog button
  filtered to `stylizer`.
- `changelogFilter` union extended with `'stylizer'`.
- Recent-projects list: badge + `?project=` deep-link for `type === 'stylizer'`.

## AI pass (optional, algorithmic-first)

The algorithmic engine is the core and always available offline. An optional "AI
Stylize" action reuses the existing `src/app/api/generate-texture` route for
img2img (feed the current albedo as the source snapshot, prompt describes the
target style). This is a local-dev convenience, slow and non-deterministic, and
gated behind its own panel so it never blocks the deterministic path. This can be
deferred to a phase-2 follow-up.

## Testing / verification

No test runner in this repo — verification is a clean `npm run build` plus manual
smoke test:

1. Load an albedo only → each of the four styles previews live.
2. Load a full PBR set → bake AO+shading visibly darkens crevices; regenerate
   normal/height produce plausible maps (thumbnails update).
3. 2D wipe slider and 2x2 tile toggle work; 3D preview renders the material.
4. Export produces a zip with the selected maps at full resolution.
5. Save → reload via `?project=` restores sources + options and recomputes
   derived maps.
6. `npm run build` passes; lockstep changelog entries aligned.

## Build sequence (for the implementation plan)

1. `stylizer.ts` engine + defaults (pure, verifiable in isolation).
2. `StylizerContext` + `page.tsx` skeleton with material loading + one style.
3. `StylizerDockLayout` + menubar + material loader panel.
4. Style panel wired to all four styles with live 2D preview.
5. Map-output panel: bake + regenerate + flatten + thumbnails.
6. 2D preview (wipe + tile) and 3D preview.
7. Export (zip) + persistence (save/load/deep-link) + project type.
8. Launcher wiring + lockstep changelog + `npm run build`.
9. (Phase 2, optional) AI stylize panel.
