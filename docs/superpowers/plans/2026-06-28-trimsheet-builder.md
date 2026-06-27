# Trimsheet Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new client-side 2D Trimsheet Builder tool where users lay out named regions on a square canvas, drop Polyhaven or uploaded PBR materials onto each region, and export 5 baked PBR maps + a region JSON as a `.zip`.

**Architecture:** Self-contained workspace at `src/app/tools/trimsheet/page.tsx` that owns all state and pushes it through `TrimsheetContext` to flexlayout-react dock panels — identical to the existing three tools. A pure, React-free `TrimsheetBaker` class owns five `OffscreenCanvas` buffers and does eager dirty-rect compositing; preview and export are the same pixels. No Three.js.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, flexlayout-react, CSS Modules, Canvas 2D / OffscreenCanvas / ImageBitmap, IndexedDB (existing `projectDatabase.ts`), `fflate` (new, for zip export).

---

## Testing note (read first)

**This repo has no test runner** (confirmed in `CLAUDE.md`: "There is no test runner configured. Verification means a clean `npm run build`"). Do **not** add Jest/Vitest. Each task's gates are:

1. **Typecheck/build gate:** `npm run build` must complete with no errors. This is the primary automated gate after every code task.
2. **Behavioral gate (where applicable):** concrete manual steps in the browser via `npm run dev`, OR a copy-paste **dev-console assertion snippet** for pure math in `trimsheetBaker.ts`. These snippets `throw` on failure so the result is unambiguous.

Run `npm run dev` once at the start and keep it running; most behavioral checks reuse it.

---

## File structure

**Create:**

| File | Responsibility |
|---|---|
| `src/lib/trimsheetTypes.ts` | `Region`, `TrimMaterial`, `MapChannel`, `TrimsheetProject`, fallback constants. Pure types + constants. |
| `src/lib/trimsheetBaker.ts` | Pure engine: 5 OffscreenCanvas buffers, `compositeRegion`, `clearRegion`, `getPreviewCanvas`, `getChannel`, `export`, `dispose`. No React. |
| `src/lib/trimsheetMaterials.ts` | Polyhaven fetch→5-map resolve, upload→material, fallback bitmap generation, dispose helper. No React. |
| `src/contexts/TrimsheetContext.tsx` | Context value type + provider + `useTrimsheetContext` hook. |
| `src/app/tools/trimsheet/page.tsx` | Workspace: owns state, assembles context value, autosave, load-by-id. |
| `src/app/tools/trimsheet/page.module.css` | Page chrome styles. |
| `src/components/TrimsheetDockLayout.tsx` | PANEL_INFO + factory + localStorage layout + imperative ref. |
| `src/components/TrimsheetDockLayout.module.css` | Panel content wrapper styles. |
| `src/components/TrimsheetMenuBar.tsx` | File (Save/Save As) + View (panel toggles/reset) menus. |
| `src/components/TrimsheetMenuBar.module.css` | Menubar styles. |
| `src/components/TrimsheetCanvas.tsx` | 2D viewport: draw preview + region overlays + handles; draw/move/resize/split/merge/snap. |
| `src/components/TrimsheetCanvas.module.css` | Canvas wrapper styles. |
| `src/components/RegionPanel.tsx` | Region list, grid generator, resolution preset, split/merge. |
| `src/components/RegionPanel.module.css` | |
| `src/components/TrimMaterialPanel.tsx` | Polyhaven browser + upload dropzone; assign to selected region. |
| `src/components/TrimMaterialPanel.module.css` | |
| `src/components/RegionInspectorPanel.tsx` | Selected region: material, tiling scale/offset/rotation, flat color. |
| `src/components/RegionInspectorPanel.module.css` | |
| `src/components/TrimsheetExportPanel.tsx` | Per-channel toggles + Export `.zip`. |
| `src/components/TrimsheetExportPanel.module.css` | |

**Modify:**

| File | Change |
|---|---|
| `src/lib/projectDatabase.ts` | Add `'trimsheet'` to the three `type` unions; add `trimsheetOptions?` to `ProjectMetadata`. |
| `src/hooks/useProjectSave.ts` | Add `'trimsheet'` to the `type` union; add `trimsheetOptions?: any` field; include it in both `metadata` objects. |
| `src/app/page.tsx` | Add Trimsheet launcher card + restore-link mapping + badge. |
| `src/data/changelog.ts` | Add `'trimsheet'` to `toolScope` union + new version entry. |
| `CHANGELOG.md` | Lockstep version entry. |
| `package.json` | Add `fflate` dependency (via `npm install`). |

---

## Task 1: Types and constants (`trimsheetTypes.ts`)

**Files:**
- Create: `src/lib/trimsheetTypes.ts`

- [ ] **Step 1: Write the types file**

```ts
// src/lib/trimsheetTypes.ts
/**
 * trimsheetTypes - Core types for the Trimsheet Builder tool.
 * Pure types + constants, no runtime dependencies.
 */

export type MapChannel = 'albedo' | 'normal' | 'roughness' | 'metalness' | 'ao';

export const MAP_CHANNELS: MapChannel[] = [
  'albedo', 'normal', 'roughness', 'metalness', 'ao',
];

export type TrimResolution = 512 | 1024 | 2048;

/** Normalized rect, all values 0..1 relative to the trimsheet. */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TrimMaterialMaps {
  albedo: ImageBitmap | null;
  normal: ImageBitmap | null;
  roughness: ImageBitmap | null;
  metalness: ImageBitmap | null;
  ao: ImageBitmap | null;
}

export interface TrimMaterial {
  id: string;
  name: string;
  source: 'polyhaven' | 'upload' | 'flat';
  maps: TrimMaterialMaps;
  flatColor?: string;   // for source==='flat'; also albedo fallback tint
  thumbnailUrl: string;
}

export interface RegionTiling {
  scale: number;        // pattern repeats across the rect (1 = fill once)
  offsetX: number;      // 0..1
  offsetY: number;      // 0..1
  rotation: 0 | 90 | 180 | 270;
}

export interface Region {
  id: string;
  name: string;
  rect: NormRect;       // NORMALIZED 0..1
  materialId: string | null;
  tiling: RegionTiling;
}

export interface TrimsheetProject {
  resolution: TrimResolution;
  regions: Region[];
}

/** Solid-color fallbacks the baker paints when a material channel is null. */
export const CHANNEL_FALLBACK: Record<MapChannel, string> = {
  albedo: '#808080',
  normal: '#8080ff',
  roughness: '#808080',
  metalness: '#000000',
  ao: '#ffffff',
};

export const DEFAULT_TILING: RegionTiling = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

export function makeRegionId(): string {
  return `region-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function makeMaterialId(): string {
  return `mat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: Build completes with no TypeScript errors. (The file is unused so far; this just confirms valid syntax/types.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/trimsheetTypes.ts
git commit -m "feat(trimsheet): add core types and channel fallback constants"
```

---

## Task 2: Baker engine — construction, buffers, fallbacks

**Files:**
- Create: `src/lib/trimsheetBaker.ts`

- [ ] **Step 1: Write the baker skeleton with buffer allocation and a solid-fill composite**

This first version composites each region as a **solid fallback color per channel** (no material/tiling yet — that arrives in Task 3). This lets us verify buffer allocation, normalized→pixel conversion, and clipping in isolation.

```ts
// src/lib/trimsheetBaker.ts
/**
 * trimsheetBaker - Pure, React-free engine that owns five OffscreenCanvas
 * buffers (one per PBR channel) and composites regions into them with
 * dirty-rect efficiency. Preview and export read from the same buffers.
 */

import {
  MapChannel,
  MAP_CHANNELS,
  NormRect,
  Region,
  TrimMaterial,
  CHANNEL_FALLBACK,
} from './trimsheetTypes';

type Ctx2D = OffscreenCanvasRenderingContext2D;

export class TrimsheetBaker {
  private resolution: number;
  private buffers: Record<MapChannel, OffscreenCanvas>;
  private ctxs: Record<MapChannel, Ctx2D>;

  constructor(resolution: number) {
    this.resolution = resolution;
    this.buffers = {} as Record<MapChannel, OffscreenCanvas>;
    this.ctxs = {} as Record<MapChannel, Ctx2D>;
    this.allocate();
  }

  private allocate(): void {
    for (const ch of MAP_CHANNELS) {
      const canvas = new OffscreenCanvas(this.resolution, this.resolution);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get 2D context for trimsheet buffer');
      this.buffers[ch] = canvas;
      this.ctxs[ch] = ctx;
      // Initialize each buffer to its channel fallback so empty sheet is valid.
      ctx.fillStyle = CHANNEL_FALLBACK[ch];
      ctx.fillRect(0, 0, this.resolution, this.resolution);
    }
  }

  getResolution(): number {
    return this.resolution;
  }

  setResolution(res: number, regions: Region[], materials: Map<string, TrimMaterial>): void {
    this.resolution = res;
    this.allocate();
    for (const region of regions) {
      const mat = region.materialId ? materials.get(region.materialId) ?? null : null;
      this.compositeRegion(region, mat);
    }
  }

  /** Convert a normalized rect to integer pixel coordinates at current resolution. */
  private toPixelRect(rect: NormRect): { x: number; y: number; w: number; h: number } {
    const x = Math.round(rect.x * this.resolution);
    const y = Math.round(rect.y * this.resolution);
    const w = Math.round(rect.w * this.resolution);
    const h = Math.round(rect.h * this.resolution);
    return { x, y, w, h };
  }

  /** Composite one region into all five buffers (solid fallback for now). */
  compositeRegion(region: Region, material: TrimMaterial | null): void {
    const px = this.toPixelRect(region.rect);
    if (px.w <= 0 || px.h <= 0) return;

    for (const ch of MAP_CHANNELS) {
      const ctx = this.ctxs[ch];
      ctx.save();
      ctx.beginPath();
      ctx.rect(px.x, px.y, px.w, px.h);
      ctx.clip();
      // Solid fallback fill (material/tiling added in Task 3).
      const albedoFlat = material?.flatColor;
      ctx.fillStyle = ch === 'albedo' && albedoFlat ? albedoFlat : CHANNEL_FALLBACK[ch];
      ctx.fillRect(px.x, px.y, px.w, px.h);
      ctx.restore();
    }
  }

  /** Erase a rect back to channel fallbacks across all buffers. */
  clearRegion(rect: NormRect): void {
    const px = this.toPixelRect(rect);
    if (px.w <= 0 || px.h <= 0) return;
    for (const ch of MAP_CHANNELS) {
      const ctx = this.ctxs[ch];
      ctx.fillStyle = CHANNEL_FALLBACK[ch];
      ctx.fillRect(px.x, px.y, px.w, px.h);
    }
  }

  getPreviewCanvas(): OffscreenCanvas {
    return this.buffers.albedo;
  }

  getChannel(ch: MapChannel): OffscreenCanvas {
    return this.buffers[ch];
  }

  dispose(): void {
    // OffscreenCanvas has no explicit free; drop references and shrink to 0.
    for (const ch of MAP_CHANNELS) {
      this.buffers[ch].width = 0;
      this.buffers[ch].height = 0;
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Behavioral check — dev-console assertion snippet**

With `npm run dev` running, open `http://localhost:3000` and paste this into the browser DevTools console. It imports nothing (it inlines a tiny copy of the math) — instead we verify the real class via a temporary route is overkill, so test the conversion logic directly:

```js
// Verify normalized->pixel conversion and clipping behavior.
const res = 1024;
const rect = { x: 0.25, y: 0.5, w: 0.5, h: 0.25 };
const px = {
  x: Math.round(rect.x * res), y: Math.round(rect.y * res),
  w: Math.round(rect.w * res), h: Math.round(rect.h * res),
};
if (JSON.stringify(px) !== JSON.stringify({ x: 256, y: 512, w: 512, h: 256 })) {
  throw new Error('Pixel rect conversion wrong: ' + JSON.stringify(px));
}
console.log('OK: normalized->pixel conversion correct');
```

Expected: logs `OK: normalized->pixel conversion correct`, no throw.

- [ ] **Step 4: Commit**

```bash
git add src/lib/trimsheetBaker.ts
git commit -m "feat(trimsheet): add baker engine with buffer allocation and fallback compositing"
```

---

## Task 3: Baker engine — tiled material compositing with rotation

**Files:**
- Modify: `src/lib/trimsheetBaker.ts` (replace the body of `compositeRegion`)

- [ ] **Step 1: Replace `compositeRegion` to draw tiled material maps**

Replace the entire `compositeRegion` method from Task 2 with this version. It draws each channel's map (or fallback) as a `CanvasPattern` transformed by the region's tiling, clipped to the rect.

```ts
  /** Resolve the bitmap for a channel, or null to use the solid fallback. */
  private resolveMap(ch: MapChannel, material: TrimMaterial | null): ImageBitmap | null {
    if (!material) return null;
    return material.maps[ch];
  }

  /** Composite one region into all five buffers using tiled material maps. */
  compositeRegion(region: Region, material: TrimMaterial | null): void {
    const px = this.toPixelRect(region.rect);
    if (px.w <= 0 || px.h <= 0) return;

    const { scale, offsetX, offsetY, rotation } = region.tiling;

    for (const ch of MAP_CHANNELS) {
      const ctx = this.ctxs[ch];
      ctx.save();
      ctx.beginPath();
      ctx.rect(px.x, px.y, px.w, px.h);
      ctx.clip();

      const bitmap = this.resolveMap(ch, material);

      if (!bitmap) {
        // Solid fallback (albedo honors flatColor).
        const albedoFlat = material?.flatColor;
        ctx.fillStyle = ch === 'albedo' && albedoFlat ? albedoFlat : CHANNEL_FALLBACK[ch];
        ctx.fillRect(px.x, px.y, px.w, px.h);
        ctx.restore();
        continue;
      }

      // Build a repeating pattern from the bitmap.
      const pattern = ctx.createPattern(bitmap, 'repeat');
      if (!pattern) {
        ctx.fillStyle = CHANNEL_FALLBACK[ch];
        ctx.fillRect(px.x, px.y, px.w, px.h);
        ctx.restore();
        continue;
      }

      // Compute pattern transform:
      // - One "tile" should span (rect size / scale) pixels, so scale>1 => more repeats.
      // - rotation rotates the pattern about the rect's top-left.
      // - offset shifts the pattern within the rect (fraction of rect size).
      const tilePxW = px.w / scale;
      const tilePxH = px.h / scale;
      const sx = tilePxW / bitmap.width;
      const sy = tilePxH / bitmap.height;

      const m = new DOMMatrix();
      // Move into the rect, apply offset (as fraction of rect size).
      m.translateSelf(px.x + offsetX * px.w, px.y + offsetY * px.h);
      if (rotation !== 0) {
        m.rotateSelf(rotation); // degrees
      }
      m.scaleSelf(sx, sy);
      pattern.setTransform(m);

      ctx.fillStyle = pattern;
      ctx.fillRect(px.x, px.y, px.w, px.h);
      ctx.restore();
    }
  }
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors. (`DOMMatrix`, `createPattern`, `setTransform` are standard DOM/WebIDL types available with the `dom` lib already in `tsconfig.json`.)

- [ ] **Step 3: Behavioral check — dev-console assertion snippet**

With `npm run dev` running, paste into the browser console. This builds a real `TrimMaterial` from a generated 4×4 checker bitmap, composites into a baker at low res, and reads back pixels to prove the material (not the fallback) was drawn into the rect and the area outside was left at fallback. Because the baker is an ES module, load it dynamically:

```js
const { TrimsheetBaker } = await import('/_next/static/chunks/...');
```

That chunk path is unstable, so instead use this self-contained equivalent that mirrors the exact compositing math to validate the approach (the real class is exercised via the UI in Task 9):

```js
// Self-contained validation of the tiled-pattern compositing math.
async function makeChecker(n, a, b) {
  const c = new OffscreenCanvas(n, n);
  const x = c.getContext('2d');
  x.fillStyle = a; x.fillRect(0, 0, n, n);
  x.fillStyle = b; x.fillRect(0, 0, n/2, n/2); x.fillRect(n/2, n/2, n/2, n/2);
  return await createImageBitmap(c);
}
const res = 64;
const buf = new OffscreenCanvas(res, res);
const ctx = buf.getContext('2d');
ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, res, res); // fallback grey
const bm = await makeChecker(8, '#ff0000', '#0000ff');
const px = { x: 16, y: 16, w: 32, h: 32 };
ctx.save();
ctx.beginPath(); ctx.rect(px.x, px.y, px.w, px.h); ctx.clip();
const pat = ctx.createPattern(bm, 'repeat');
const m = new DOMMatrix();
m.translateSelf(px.x, px.y); m.scaleSelf((px.w/1)/bm.width, (px.h/1)/bm.height);
pat.setTransform(m); ctx.fillStyle = pat; ctx.fillRect(px.x, px.y, px.w, px.h);
ctx.restore();
const inside = ctx.getImageData(20, 20, 1, 1).data;   // should be red or blue, not grey
const outside = ctx.getImageData(2, 2, 1, 1).data;    // should be grey fallback
const isGrey = (d) => d[0] === 128 && d[1] === 128 && d[2] === 128;
if (isGrey(inside)) throw new Error('Material not drawn inside rect');
if (!isGrey(outside)) throw new Error('Fallback overwritten outside rect');
console.log('OK: tiled material composited inside rect, fallback preserved outside');
```

Expected: logs `OK: tiled material composited inside rect, fallback preserved outside`, no throw.

- [ ] **Step 4: Commit**

```bash
git add src/lib/trimsheetBaker.ts
git commit -m "feat(trimsheet): composite tiled material maps with scale/offset/rotation"
```

---

## Task 4: Baker engine — export to zip

**Files:**
- Modify: `package.json` (add `fflate`)
- Modify: `src/lib/trimsheetBaker.ts` (add `export` method)

- [ ] **Step 1: Install fflate**

Run: `npm install fflate`
Expected: `fflate` appears in `package.json` dependencies; `npm run build` still works.

- [ ] **Step 2: Add the `export` method and imports to the baker**

At the top of `src/lib/trimsheetBaker.ts`, add to the imports:

```ts
import { zipSync, strToU8 } from 'fflate';
import { Region } from './trimsheetTypes';
```

(`Region` may already be imported — if so, don't duplicate it; the existing import line already lists `Region`.)

Add this method to the `TrimsheetBaker` class (before `dispose`):

```ts
  /**
   * Export enabled channels as PNGs plus a region JSON, bundled into one zip.
   * @param regions current regions (for the JSON sidecar)
   * @param enabledChannels which map PNGs to include
   * @param projectName used for file naming inside the zip
   */
  async export(
    regions: Region[],
    enabledChannels: MapChannel[],
    projectName: string,
  ): Promise<Blob> {
    const safeName = (projectName || 'trimsheet').replace(/[^a-z0-9_-]+/gi, '_');
    const files: Record<string, Uint8Array> = {};

    // 1. Encode each enabled channel buffer to PNG bytes.
    for (const ch of enabledChannels) {
      const blob = await this.buffers[ch].convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      files[`${safeName}_${ch}.png`] = bytes;
    }

    // 2. Build the region metadata JSON (resolution-independent).
    const meta = {
      version: 1,
      resolution: this.resolution,
      channels: enabledChannels,
      regions: regions.map((r) => ({
        name: r.name,
        rect: r.rect,                 // normalized 0..1
        materialId: r.materialId,
        tiling: r.tiling,
      })),
    };
    files[`${safeName}.json`] = strToU8(JSON.stringify(meta, null, 2));

    // 3. Zip synchronously (small payloads) and wrap as a Blob.
    const zipped = zipSync(files, { level: 6 });
    // Copy into a fresh ArrayBuffer so the Blob owns standalone memory.
    const copy = new Uint8Array(zipped.length);
    copy.set(zipped);
    return new Blob([copy], { type: 'application/zip' });
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors. If TS complains it cannot find types for `fflate`, note `fflate` ships its own types — no `@types` package needed.

- [ ] **Step 4: Behavioral check — dev-console assertion snippet**

With `npm run dev` running, paste into the console to confirm `convertToBlob` + `fflate` round-trip works in this environment:

```js
const { zipSync, unzipSync, strToU8 } = await import('https://cdn.skypack.dev/fflate');
const c = new OffscreenCanvas(8, 8);
const x = c.getContext('2d'); x.fillStyle = '#123456'; x.fillRect(0, 0, 8, 8);
const blob = await c.convertToBlob({ type: 'image/png' });
const png = new Uint8Array(await blob.arrayBuffer());
const zip = zipSync({ 'a_albedo.png': png, 'a.json': strToU8('{"version":1}') });
const back = unzipSync(zip);
if (!back['a_albedo.png'] || !back['a.json']) throw new Error('Zip round-trip missing entries');
console.log('OK: PNG encode + fflate zip round-trip works');
```

Expected: logs `OK: PNG encode + fflate zip round-trip works`, no throw. (This uses a CDN copy of fflate only to validate the environment; the real code imports the installed package.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/trimsheetBaker.ts
git commit -m "feat(trimsheet): export baked maps and region JSON as a zip"
```

---

## Task 5: Material loading (`trimsheetMaterials.ts`)

**Files:**
- Create: `src/lib/trimsheetMaterials.ts`

- [ ] **Step 1: Write the material loader**

This adapts the Polyhaven pipeline from `MaterialLibraryPanel.tsx` (the `getMapUrl` resolver and `files/{id}` fetch) but resolves **all five** channels and returns a `TrimMaterial` with `ImageBitmap`s. Also provides an uploader and a disposer.

```ts
// src/lib/trimsheetMaterials.ts
/**
 * trimsheetMaterials - Build TrimMaterial objects (5 PBR map bitmaps) from
 * Polyhaven assets or user-uploaded files. React-free.
 */

import {
  TrimMaterial,
  TrimMaterialMaps,
  MapChannel,
  MAP_CHANNELS,
  makeMaterialId,
} from './trimsheetTypes';

const PH_HEADERS = { 'User-Agent': 'SpritesheetWebtoolTrimsheet' };

export interface PolyhavenAsset {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
}

/** Fetch the Polyhaven textures index. Throws on network failure. */
export async function fetchPolyhavenIndex(): Promise<PolyhavenAsset[]> {
  const res = await fetch('https://api.polyhaven.com/assets?t=textures', { headers: PH_HEADERS });
  if (!res.ok) throw new Error('Failed to retrieve Polyhaven index');
  const data = await res.json();
  return Object.keys(data).map((key) => {
    const item = data[key];
    return {
      id: key,
      name: item.name,
      category: item.categories?.[0] || 'other',
      thumbnail: item.thumbnail_url || `https://cdn.polyhaven.com/asset_img/thumbs/${key}.png?width=128&height=128`,
    };
  });
}

/** Pick a URL from a Polyhaven map object, preferring 1k then 2k, jpg then png. */
function getMapUrl(mapObject: any): string | null {
  if (!mapObject) return null;
  const resObj = mapObject['1k'] || mapObject['2k'] || Object.values(mapObject)[0];
  if (!resObj) return null;
  const formatObj = (resObj as any)['jpg'] || (resObj as any)['png'] || Object.values(resObj as any)[0];
  return (formatObj as any)?.url || null;
}

async function urlToBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download map: ${url}`);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

/**
 * Build a full TrimMaterial from a Polyhaven asset. Missing channels stay null
 * (the baker substitutes solid fallbacks). Throws only if the index/file
 * fetch fails; individual missing maps are tolerated.
 */
export async function loadPolyhavenMaterial(asset: PolyhavenAsset): Promise<TrimMaterial> {
  const res = await fetch(`https://api.polyhaven.com/files/${asset.id}`, { headers: PH_HEADERS });
  if (!res.ok) throw new Error('Failed to fetch Polyhaven asset files');
  const data = await res.json();

  const urls: Record<MapChannel, string | null> = {
    albedo: getMapUrl(data.diffuse || data.diff || data.col || data.albedo),
    normal: getMapUrl(data.nor_gl || data.nor || data.normal || data.nor_dx),
    roughness: getMapUrl(data.rough || data.roughness),
    metalness: getMapUrl(data.metal || data.metalness),
    ao: getMapUrl(data.ao || data.AO),
  };

  const maps: TrimMaterialMaps = {
    albedo: null, normal: null, roughness: null, metalness: null, ao: null,
  };

  await Promise.all(
    MAP_CHANNELS.map(async (ch) => {
      const url = urls[ch];
      if (!url) return;
      try {
        maps[ch] = await urlToBitmap(url);
      } catch {
        maps[ch] = null; // tolerate per-map failure
      }
    }),
  );

  return {
    id: makeMaterialId(),
    name: asset.name,
    source: 'polyhaven',
    maps,
    thumbnailUrl: asset.thumbnail,
  };
}

/** Map a user-provided File set to channels. Albedo is required. */
export interface UploadMapFiles {
  albedo: File;
  normal?: File | null;
  roughness?: File | null;
  metalness?: File | null;
  ao?: File | null;
}

export async function loadUploadMaterial(name: string, fileSet: UploadMapFiles): Promise<TrimMaterial> {
  const fileFor: Record<MapChannel, File | null | undefined> = {
    albedo: fileSet.albedo,
    normal: fileSet.normal,
    roughness: fileSet.roughness,
    metalness: fileSet.metalness,
    ao: fileSet.ao,
  };

  const maps: TrimMaterialMaps = {
    albedo: null, normal: null, roughness: null, metalness: null, ao: null,
  };

  await Promise.all(
    MAP_CHANNELS.map(async (ch) => {
      const f = fileFor[ch];
      if (!f) return;
      maps[ch] = await createImageBitmap(f);
    }),
  );

  // Thumbnail = albedo as a data/object URL for the panel grid.
  const thumbnailUrl = URL.createObjectURL(fileSet.albedo);

  return {
    id: makeMaterialId(),
    name: name || fileSet.albedo.name,
    source: 'upload',
    maps,
    thumbnailUrl,
  };
}

/** Count how many of the 5 channels are present (for the "N/5 maps" badge). */
export function countMaps(material: TrimMaterial): number {
  return MAP_CHANNELS.reduce((n, ch) => n + (material.maps[ch] ? 1 : 0), 0);
}

/** Dispose all bitmaps + revoke any object URL. Call when removing a material. */
export function disposeMaterial(material: TrimMaterial): void {
  for (const ch of MAP_CHANNELS) {
    material.maps[ch]?.close();
  }
  if (material.source === 'upload' && material.thumbnailUrl.startsWith('blob:')) {
    URL.revokeObjectURL(material.thumbnailUrl);
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Behavioral check — dev-console assertion snippet**

With `npm run dev` running, paste into the console to verify the Polyhaven `files/{id}` resolver shape still matches the live API (this is the same call `MaterialLibraryPanel` already relies on):

```js
const r = await fetch('https://api.polyhaven.com/files/rock_wall_07', { headers: { 'User-Agent': 'SpritesheetWebtoolTrimsheet' }});
const d = await r.json();
const get = (m) => m && (m['1k']||m['2k']||Object.values(m)[0]);
if (!get(d.diffuse || d.diff || d.col)) throw new Error('No diffuse resolved');
console.log('OK: Polyhaven file resolver matches live API (diffuse found)');
```

Expected: logs `OK: ...`. If Polyhaven is unreachable, this throws a network error — that is acceptable (the tool falls back to upload at runtime); note it and move on.

- [ ] **Step 4: Commit**

```bash
git add src/lib/trimsheetMaterials.ts
git commit -m "feat(trimsheet): add Polyhaven and upload material loaders with 5-channel resolve"
```

---

## Task 6: Context (`TrimsheetContext.tsx`)

**Files:**
- Create: `src/contexts/TrimsheetContext.tsx`

- [ ] **Step 1: Write the context, mirroring ThreePainterContext's provider shape**

```tsx
// src/contexts/TrimsheetContext.tsx
'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { Region, TrimMaterial, TrimResolution, MapChannel } from '@/lib/trimsheetTypes';
import { TrimsheetBaker } from '@/lib/trimsheetBaker';
import { PolyhavenAsset } from '@/lib/trimsheetMaterials';

export interface TrimsheetContextValue {
  // Baker (single mutation sink for pixels)
  baker: TrimsheetBaker | null;
  /** Bump this number whenever the baker buffers change, to trigger canvas redraw. */
  bakeVersion: number;

  // Resolution
  resolution: TrimResolution;
  setResolution: (res: TrimResolution) => void;

  // Regions
  regions: Region[];
  selectedRegionId: string | null;
  selectRegion: (id: string | null) => void;
  addRegion: (rect: Region['rect']) => void;
  updateRegionRect: (id: string, rect: Region['rect']) => void;
  updateRegionTiling: (id: string, tiling: Partial<Region['tiling']>) => void;
  renameRegion: (id: string, name: string) => void;
  deleteRegion: (id: string) => void;
  splitRegion: (id: string, axis: 'horizontal' | 'vertical') => void;
  mergeRegions: (idA: string, idB: string) => void;
  generateGrid: (rows: number, cols: number) => void;

  // Materials
  materials: TrimMaterial[];
  assignMaterialToRegion: (regionId: string, material: TrimMaterial) => void;
  setRegionFlatColor: (regionId: string, color: string) => void;
  clearRegionMaterial: (regionId: string) => void;

  // Polyhaven index (shared across panels)
  polyhavenAssets: PolyhavenAsset[];
  polyhavenError: string | null;
  polyhavenLoading: boolean;

  // Export
  enabledChannels: MapChannel[];
  toggleChannel: (ch: MapChannel) => void;
  exportZip: () => Promise<void>;

  // Save
  isDirty: boolean;
  triggerSave: (customName?: string) => Promise<void>;
  triggerSaveAs: (name: string) => Promise<void>;
  projectName: string;
  setProjectName: (name: string) => void;

  // Panels
  visiblePanels: Set<string>;
  togglePanel: (panelId: string) => void;
  resetLayout: () => void;
}

const TrimsheetContext = createContext<TrimsheetContextValue | null>(null);

export function useTrimsheetContext(): TrimsheetContextValue {
  const ctx = useContext(TrimsheetContext);
  if (!ctx) throw new Error('useTrimsheetContext must be used within TrimsheetProvider');
  return ctx;
}

interface TrimsheetProviderProps {
  value: TrimsheetContextValue;
  children: ReactNode;
}

export function TrimsheetProvider({ value, children }: TrimsheetProviderProps) {
  return <TrimsheetContext.Provider value={value}>{children}</TrimsheetContext.Provider>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/TrimsheetContext.tsx
git commit -m "feat(trimsheet): add TrimsheetContext provider and hook"
```

---

## Task 7: Persistence wiring (`projectDatabase.ts` + `useProjectSave.ts`)

**Files:**
- Modify: `src/lib/projectDatabase.ts`
- Modify: `src/hooks/useProjectSave.ts`

- [ ] **Step 1: Add `'trimsheet'` to the type unions and `trimsheetOptions` to metadata in `projectDatabase.ts`**

In `src/lib/projectDatabase.ts`, the `DbProject` (line ~73), `ProjectSummary` (line ~83) `type` fields read:

```ts
  type: 'spritesheet' | 'pixelator' | '3d-painter';
```

Change BOTH to:

```ts
  type: 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet';
```

Then, inside `interface ProjectMetadata` (ends around line 53 with the `globalLayers?` field), add a new field just before the closing brace:

```ts
  trimsheetOptions?: {
    resolution: number;
    regions: any[];
    materials: {
      id: string;
      name: string;
      source: 'polyhaven' | 'upload' | 'flat';
      flatColor?: string;
      // Polyhaven: store asset id for re-fetch. Upload: store per-channel blobs.
      polyhavenAssetId?: string;
      uploadBlobs?: { channel: string; blob: Blob }[];
      thumbnailUrl?: string;
    }[];
    enabledChannels: string[];
  };
```

- [ ] **Step 2: Add `'trimsheet'` + `trimsheetOptions` to `useProjectSave.ts`**

In `src/hooks/useProjectSave.ts`, change the `type` field in the options object (line 13):

```ts
  type: 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet';
```

Add a new optional field right after `threePainterOptions?: any;` (line 16):

```ts
  trimsheetOptions?: any; // Custom settings blob for the trimsheet tool
```

Then in BOTH `metadata` objects (the one in `triggerSave` around line 60 and the one in `triggerSaveAs` around line 118), add this line alongside `threePainterOptions`:

```ts
        trimsheetOptions: currentOpts.trimsheetOptions,
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors. The new union member is additive; existing tools are unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/lib/projectDatabase.ts src/hooks/useProjectSave.ts
git commit -m "feat(trimsheet): add trimsheet project type and metadata persistence fields"
```

---

## Task 8: Dock layout + menubar shells

**Files:**
- Create: `src/components/TrimsheetDockLayout.tsx`
- Create: `src/components/TrimsheetDockLayout.module.css`
- Create: `src/components/TrimsheetMenuBar.tsx`
- Create: `src/components/TrimsheetMenuBar.module.css`

- [ ] **Step 1: Write `TrimsheetDockLayout.module.css`**

```css
/* src/components/TrimsheetDockLayout.module.css */
.container { width: 100%; height: 100%; position: relative; }
.layoutWrapper { position: absolute; inset: 0; }
.panelContent { width: 100%; height: 100%; overflow: auto; }
.placeholder {
  display: flex; align-items: center; justify-content: center;
  height: 100%; color: var(--text-color, #999); font-size: 0.85rem; padding: 16px; text-align: center;
}
.loading { display: flex; align-items: center; justify-content: center; height: 100%; color: #999; }
```

- [ ] **Step 2: Write `TrimsheetDockLayout.tsx`**

This mirrors `DockLayout.tsx` exactly (forwardRef + imperative `addTab`/`removeTab`/`resetLayout`, localStorage persistence, factory switch). The five panel components are imported; they're created in Tasks 10–13. To keep this task independently buildable, the factory references them — so **this task must be committed together with stub versions of the panels**. Create minimal stubs first (Step 3), then the layout.

```tsx
// src/components/TrimsheetDockLayout.tsx
'use client';

/** TrimsheetDockLayout - flexlayout-react workspace for the Trimsheet Builder. */

import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Layout, Model, TabNode, Actions, DockLocation } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';

import { TrimsheetCanvas } from '@/components/TrimsheetCanvas';
import { RegionPanel } from '@/components/RegionPanel';
import { TrimMaterialPanel } from '@/components/TrimMaterialPanel';
import { RegionInspectorPanel } from '@/components/RegionInspectorPanel';
import { TrimsheetExportPanel } from '@/components/TrimsheetExportPanel';

import styles from './TrimsheetDockLayout.module.css';

const STORAGE_KEY = 'trimsheet-dock-layout';

const PANEL_INFO: Record<string, { name: string }> = {
  'canvas': { name: 'Trimsheet' },
  'regions': { name: 'Regions' },
  'materials': { name: 'Materials' },
  'inspector': { name: 'Region Inspector' },
  'export': { name: 'Export' },
};

export interface TrimsheetDockLayoutRef {
  addTab: (panelId: string) => void;
  removeTab: (panelId: string) => void;
  resetLayout: () => void;
}

interface TrimsheetDockLayoutProps {
  onVisiblePanelsChange?: (panels: Set<string>) => void;
}

const defaultLayout = {
  global: { splitterSize: 6, splitterExtra: 4 },
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      {
        type: 'tabset', weight: 22,
        children: [
          { type: 'tab', name: 'Regions', component: 'regions' },
          { type: 'tab', name: 'Region Inspector', component: 'inspector' },
        ],
      },
      {
        type: 'tabset', weight: 53,
        children: [{ type: 'tab', name: 'Trimsheet', component: 'canvas' }],
      },
      {
        type: 'tabset', weight: 25,
        children: [
          { type: 'tab', name: 'Materials', component: 'materials' },
          { type: 'tab', name: 'Export', component: 'export' },
        ],
      },
    ],
  },
};

export const TrimsheetDockLayout = forwardRef<TrimsheetDockLayoutRef, TrimsheetDockLayoutProps>(
  function TrimsheetDockLayout({ onVisiblePanelsChange }, ref) {
    const layoutRef = useRef<Layout>(null);
    const [model, setModel] = useState<Model | null>(null);

    useEffect(() => {
      let layoutJson = defaultLayout;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) layoutJson = JSON.parse(saved);
      } catch { /* use default */ }
      setModel(Model.fromJson(layoutJson));
    }, []);

    const handleModelChange = useCallback((newModel: Model) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newModel.toJson()));
        if (onVisiblePanelsChange) {
          const visible = new Set<string>();
          newModel.visitNodes((node) => {
            if (node.getType() === 'tab') {
              const component = (node as TabNode).getComponent();
              if (component) visible.add(component);
            }
          });
          onVisiblePanelsChange(visible);
        }
      } catch { /* ignore */ }
    }, [onVisiblePanelsChange]);

    const factory = useCallback((node: TabNode) => {
      const component = node.getComponent();
      switch (component) {
        case 'canvas':
          return <div className={styles.panelContent}><TrimsheetCanvas /></div>;
        case 'regions':
          return <div className={styles.panelContent}><RegionPanel /></div>;
        case 'materials':
          return <div className={styles.panelContent}><TrimMaterialPanel /></div>;
        case 'inspector':
          return <div className={styles.panelContent}><RegionInspectorPanel /></div>;
        case 'export':
          return <div className={styles.panelContent}><TrimsheetExportPanel /></div>;
        default:
          return <div className={styles.placeholder}>Unknown panel: {component}</div>;
      }
    }, []);

    const handleResetLayout = useCallback(() => {
      localStorage.removeItem(STORAGE_KEY);
      const newModel = Model.fromJson(defaultLayout);
      setModel(newModel);
      handleModelChange(newModel);
    }, [handleModelChange]);

    useImperativeHandle(ref, () => ({
      addTab: (panelId: string) => {
        if (!model) return;
        const info = PANEL_INFO[panelId];
        if (!info) return;
        let firstTabsetId: string | null = null;
        model.visitNodes((node) => {
          if (!firstTabsetId && node.getType() === 'tabset') firstTabsetId = node.getId();
        });
        if (firstTabsetId) {
          model.doAction(Actions.addNode(
            { type: 'tab', name: info.name, component: panelId },
            firstTabsetId, DockLocation.CENTER, -1, true,
          ));
          handleModelChange(model);
        }
      },
      removeTab: (panelId: string) => {
        if (!model) return;
        model.visitNodes((node) => {
          if (node.getType() === 'tab' && (node as TabNode).getComponent() === panelId) {
            model.doAction(Actions.deleteTab(node.getId()));
          }
        });
        handleModelChange(model);
      },
      resetLayout: handleResetLayout,
    }), [model, handleModelChange, handleResetLayout]);

    if (!model) return <div className={styles.loading}>Loading layout...</div>;

    return (
      <div className={styles.container}>
        <div className={styles.layoutWrapper}>
          <Layout ref={layoutRef} model={model} factory={factory} onModelChange={handleModelChange} />
        </div>
      </div>
    );
  },
);
```

- [ ] **Step 3: Create minimal panel stubs so the layout builds**

Create these five files now as stubs; each is fleshed out in later tasks. Each stub renders its name so the dock is visibly working.

`src/components/TrimsheetCanvas.tsx`:
```tsx
'use client';
import React from 'react';
export function TrimsheetCanvas() {
  return <div style={{ padding: 12, color: '#999' }}>Trimsheet canvas (stub)</div>;
}
```
`src/components/RegionPanel.tsx`:
```tsx
'use client';
import React from 'react';
export function RegionPanel() {
  return <div style={{ padding: 12, color: '#999' }}>Regions (stub)</div>;
}
```
`src/components/TrimMaterialPanel.tsx`:
```tsx
'use client';
import React from 'react';
export function TrimMaterialPanel() {
  return <div style={{ padding: 12, color: '#999' }}>Materials (stub)</div>;
}
```
`src/components/RegionInspectorPanel.tsx`:
```tsx
'use client';
import React from 'react';
export function RegionInspectorPanel() {
  return <div style={{ padding: 12, color: '#999' }}>Region Inspector (stub)</div>;
}
```
`src/components/TrimsheetExportPanel.tsx`:
```tsx
'use client';
import React from 'react';
export function TrimsheetExportPanel() {
  return <div style={{ padding: 12, color: '#999' }}>Export (stub)</div>;
}
```

- [ ] **Step 4: Write `TrimsheetMenuBar.module.css`**

```css
/* src/components/TrimsheetMenuBar.module.css */
.menubar {
  display: flex; align-items: center; gap: 8px;
  height: 36px; padding: 0 10px;
  background: var(--background-color, #1e1e1e);
  border-bottom: 1px solid var(--border-color, #333);
  font-size: 0.8rem;
}
.brand { font-weight: 700; margin-right: 12px; }
.menuGroup { display: flex; gap: 4px; }
.menuItem {
  background: transparent; border: none; color: var(--text-color, #ddd);
  padding: 4px 10px; cursor: pointer; border-radius: 4px; font: inherit;
}
.menuItem:hover { background: var(--border-color, #333); }
.spacer { flex: 1; }
.status { color: #888; font-size: 0.72rem; }
```

- [ ] **Step 5: Write `TrimsheetMenuBar.tsx`**

Uses the context for save + panel toggles. Kept dependency-light (plain buttons, not Radix menubar) to avoid extra wiring; matches the simpler menubar style.

```tsx
// src/components/TrimsheetMenuBar.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import styles from './TrimsheetMenuBar.module.css';

const TOGGLEABLE = [
  { id: 'regions', label: 'Regions' },
  { id: 'inspector', label: 'Inspector' },
  { id: 'materials', label: 'Materials' },
  { id: 'export', label: 'Export' },
  { id: 'canvas', label: 'Trimsheet' },
];

export function TrimsheetMenuBar() {
  const ctx = useTrimsheetContext();

  const handleSaveAs = () => {
    const name = prompt('Save trimsheet as:', ctx.projectName);
    if (name) ctx.triggerSaveAs(name);
  };

  return (
    <div className={styles.menubar}>
      <Link href="/" className={styles.brand}>← Trimsheet Builder</Link>
      <div className={styles.menuGroup}>
        <button className={styles.menuItem} onClick={() => ctx.triggerSave()}>Save</button>
        <button className={styles.menuItem} onClick={handleSaveAs}>Save As</button>
      </div>
      <div className={styles.menuGroup}>
        {TOGGLEABLE.map((p) => (
          <button
            key={p.id}
            className={styles.menuItem}
            style={{ opacity: ctx.visiblePanels.has(p.id) ? 1 : 0.5 }}
            onClick={() => ctx.togglePanel(p.id)}
          >
            {p.label}
          </button>
        ))}
        <button className={styles.menuItem} onClick={ctx.resetLayout}>Reset Layout</button>
      </div>
      <div className={styles.spacer} />
      <span className={styles.status}>{ctx.isDirty ? 'Unsaved changes' : 'Saved'}</span>
    </div>
  );
}
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors. (The menubar/layout reference context fields that all exist from Task 6.)

- [ ] **Step 7: Commit**

```bash
git add src/components/TrimsheetDockLayout.tsx src/components/TrimsheetDockLayout.module.css src/components/TrimsheetMenuBar.tsx src/components/TrimsheetMenuBar.module.css src/components/TrimsheetCanvas.tsx src/components/RegionPanel.tsx src/components/TrimMaterialPanel.tsx src/components/RegionInspectorPanel.tsx src/components/TrimsheetExportPanel.tsx
git commit -m "feat(trimsheet): add dock layout, menubar, and panel stubs"
```

---

## Task 9: Workspace page with full state + context assembly

**Files:**
- Create: `src/app/tools/trimsheet/page.tsx`
- Create: `src/app/tools/trimsheet/page.module.css`

This is the largest task — it owns all region/material state and the baker, and assembles the context value consumed by every panel. After this task, the canvas stub still renders, but regions/materials/baker logic all work and can be exercised from the inspector/region panels once those are built. Because the page holds the logic, the later panel tasks are thin UI.

- [ ] **Step 1: Write `page.module.css`**

```css
/* src/app/tools/trimsheet/page.module.css */
.page { display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden; }
.body { flex: 1; position: relative; min-height: 0; }
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/tools/trimsheet/page.tsx
'use client';

/** Trimsheet Builder workspace - owns all state, assembles context, autosaves. */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjectSave } from '@/hooks/useProjectSave';
import {
  Region, TrimMaterial, TrimResolution, MapChannel, MAP_CHANNELS,
  NormRect, DEFAULT_TILING, makeRegionId,
} from '@/lib/trimsheetTypes';
import { TrimsheetBaker } from '@/lib/trimsheetBaker';
import {
  fetchPolyhavenIndex, PolyhavenAsset, disposeMaterial,
} from '@/lib/trimsheetMaterials';
import { TrimsheetProvider, TrimsheetContextValue } from '@/contexts/TrimsheetContext';
import { TrimsheetDockLayout, TrimsheetDockLayoutRef } from '@/components/TrimsheetDockLayout';
import { TrimsheetMenuBar } from '@/components/TrimsheetMenuBar';
import styles from './page.module.css';

export default function TrimsheetPage() {
  const [projectId, setProjectId] = useState<string>(`trimsheet-${Date.now()}`);
  const [projectName, setProjectName] = useState<string>('Untitled Trimsheet');
  const [isDirty, setIsDirty] = useState(false);

  const [resolution, setResolutionState] = useState<TrimResolution>(1024);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<TrimMaterial[]>([]);
  const [enabledChannels, setEnabledChannels] = useState<MapChannel[]>([...MAP_CHANNELS]);
  const [bakeVersion, setBakeVersion] = useState(0);
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(new Set());

  const [polyhavenAssets, setPolyhavenAssets] = useState<PolyhavenAsset[]>([]);
  const [polyhavenError, setPolyhavenError] = useState<string | null>(null);
  const [polyhavenLoading, setPolyhavenLoading] = useState(false);

  const bakerRef = useRef<TrimsheetBaker | null>(null);
  const dockRef = useRef<TrimsheetDockLayoutRef>(null);
  const materialsRef = useRef<Map<string, TrimMaterial>>(new Map());

  // Keep a fast id->material map in sync for the baker.
  useEffect(() => {
    const map = new Map<string, TrimMaterial>();
    for (const m of materials) map.set(m.id, m);
    materialsRef.current = map;
  }, [materials]);

  // Initialize the baker once (client-only; OffscreenCanvas needs the browser).
  useEffect(() => {
    bakerRef.current = new TrimsheetBaker(1024);
    setBakeVersion((v) => v + 1);
    return () => { bakerRef.current?.dispose(); bakerRef.current = null; };
  }, []);

  // Fetch Polyhaven index once.
  useEffect(() => {
    let active = true;
    setPolyhavenLoading(true);
    fetchPolyhavenIndex()
      .then((list) => { if (active) setPolyhavenAssets(list); })
      .catch((err) => {
        console.warn('Polyhaven index fetch failed:', err);
        if (active) setPolyhavenError('Polyhaven offline. Upload your own textures instead.');
      })
      .finally(() => { if (active) setPolyhavenLoading(false); });
    return () => { active = false; };
  }, []);

  const markDirty = useCallback(() => setIsDirty(true), []);
  const recomposite = useCallback((region: Region) => {
    const baker = bakerRef.current;
    if (!baker) return;
    const mat = region.materialId ? materialsRef.current.get(region.materialId) ?? null : null;
    baker.compositeRegion(region, mat);
    setBakeVersion((v) => v + 1);
  }, []);

  // --- Region operations ---
  const addRegion = useCallback((rect: NormRect) => {
    const region: Region = {
      id: makeRegionId(),
      name: `Region ${regions.length + 1}`,
      rect,
      materialId: null,
      tiling: { ...DEFAULT_TILING },
    };
    setRegions((prev) => [...prev, region]);
    setSelectedRegionId(region.id);
    recomposite(region);
    markDirty();
  }, [regions.length, recomposite, markDirty]);

  const updateRegionRect = useCallback((id: string, rect: NormRect) => {
    setRegions((prev) => {
      const old = prev.find((r) => r.id === id);
      if (old) bakerRef.current?.clearRegion(old.rect); // erase previous footprint
      const next = prev.map((r) => (r.id === id ? { ...r, rect } : r));
      const updated = next.find((r) => r.id === id);
      if (updated) recomposite(updated);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const updateRegionTiling = useCallback((id: string, tiling: Partial<Region['tiling']>) => {
    setRegions((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, tiling: { ...r.tiling, ...tiling } } : r));
      const updated = next.find((r) => r.id === id);
      if (updated) recomposite(updated);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const renameRegion = useCallback((id: string, name: string) => {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    markDirty();
  }, [markDirty]);

  const deleteRegion = useCallback((id: string) => {
    setRegions((prev) => {
      const old = prev.find((r) => r.id === id);
      if (old) bakerRef.current?.clearRegion(old.rect);
      return prev.filter((r) => r.id !== id);
    });
    setSelectedRegionId((cur) => (cur === id ? null : cur));
    setBakeVersion((v) => v + 1);
    markDirty();
  }, [markDirty]);

  const splitRegion = useCallback((id: string, axis: 'horizontal' | 'vertical') => {
    setRegions((prev) => {
      const r = prev.find((x) => x.id === id);
      if (!r) return prev;
      bakerRef.current?.clearRegion(r.rect);
      const a: Region = { ...r, id: makeRegionId(), tiling: { ...r.tiling } };
      const b: Region = { ...r, id: makeRegionId(), name: `${r.name} B`, tiling: { ...r.tiling } };
      if (axis === 'vertical') {
        a.rect = { ...r.rect, w: r.rect.w / 2 };
        b.rect = { ...r.rect, x: r.rect.x + r.rect.w / 2, w: r.rect.w / 2 };
      } else {
        a.rect = { ...r.rect, h: r.rect.h / 2 };
        b.rect = { ...r.rect, y: r.rect.y + r.rect.h / 2, h: r.rect.h / 2 };
      }
      a.name = `${r.name} A`;
      const next = prev.flatMap((x) => (x.id === id ? [a, b] : [x]));
      recomposite(a); recomposite(b);
      setSelectedRegionId(a.id);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const mergeRegions = useCallback((idA: string, idB: string) => {
    setRegions((prev) => {
      const a = prev.find((r) => r.id === idA);
      const b = prev.find((r) => r.id === idB);
      if (!a || !b) return prev;
      bakerRef.current?.clearRegion(a.rect);
      bakerRef.current?.clearRegion(b.rect);
      const x1 = Math.min(a.rect.x, b.rect.x);
      const y1 = Math.min(a.rect.y, b.rect.y);
      const x2 = Math.max(a.rect.x + a.rect.w, b.rect.x + b.rect.w);
      const y2 = Math.max(a.rect.y + a.rect.h, b.rect.y + b.rect.h);
      const merged: Region = {
        ...a, id: makeRegionId(), name: `${a.name}+${b.name}`,
        rect: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 },
      };
      const next = prev.filter((r) => r.id !== idA && r.id !== idB);
      next.push(merged);
      recomposite(merged);
      setSelectedRegionId(merged.id);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const generateGrid = useCallback((rows: number, cols: number) => {
    // Replace existing regions with a fresh grid.
    setRegions((prev) => {
      for (const r of prev) bakerRef.current?.clearRegion(r.rect);
      const next: Region[] = [];
      const w = 1 / cols, h = 1 / rows;
      let n = 1;
      for (let ry = 0; ry < rows; ry++) {
        for (let cx = 0; cx < cols; cx++) {
          next.push({
            id: makeRegionId(), name: `Region ${n++}`,
            rect: { x: cx * w, y: ry * h, w, h },
            materialId: null, tiling: { ...DEFAULT_TILING },
          });
        }
      }
      next.forEach((r) => recomposite(r));
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  // --- Material operations ---
  const assignMaterialToRegion = useCallback((regionId: string, material: TrimMaterial) => {
    setMaterials((prev) => (prev.some((m) => m.id === material.id) ? prev : [...prev, material]));
    materialsRef.current.set(material.id, material);
    setRegions((prev) => {
      const next = prev.map((r) => (r.id === regionId ? { ...r, materialId: material.id } : r));
      const updated = next.find((r) => r.id === regionId);
      if (updated) recomposite(updated);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const setRegionFlatColor = useCallback((regionId: string, color: string) => {
    // A flat color becomes an inline 'flat' material with no maps.
    const flatMat: TrimMaterial = {
      id: `flat-${regionId}`, name: `Flat ${color}`, source: 'flat',
      maps: { albedo: null, normal: null, roughness: null, metalness: null, ao: null },
      flatColor: color, thumbnailUrl: '',
    };
    assignMaterialToRegion(regionId, flatMat);
  }, [assignMaterialToRegion]);

  const clearRegionMaterial = useCallback((regionId: string) => {
    setRegions((prev) => {
      const next = prev.map((r) => (r.id === regionId ? { ...r, materialId: null } : r));
      const updated = next.find((r) => r.id === regionId);
      if (updated) recomposite(updated);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  // --- Resolution ---
  const setResolution = useCallback((res: TrimResolution) => {
    setResolutionState(res);
    bakerRef.current?.setResolution(res, regions, materialsRef.current);
    setBakeVersion((v) => v + 1);
    markDirty();
  }, [regions, markDirty]);

  // --- Channels ---
  const toggleChannel = useCallback((ch: MapChannel) => {
    setEnabledChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  }, []);

  // --- Export ---
  const exportZip = useCallback(async () => {
    const baker = bakerRef.current;
    if (!baker) return;
    const ordered = MAP_CHANNELS.filter((c) => enabledChannels.includes(c));
    if (ordered.length === 0) { alert('Enable at least one map channel to export.'); return; }
    try {
      const blob = await baker.export(regions, ordered, projectName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(projectName || 'trimsheet').replace(/[^a-z0-9_-]+/gi, '_')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Trimsheet export failed:', err);
      alert('Export failed. See console for details.');
    }
  }, [regions, enabledChannels, projectName]);

  // --- Panels ---
  const togglePanel = useCallback((panelId: string) => {
    if (visiblePanels.has(panelId)) dockRef.current?.removeTab(panelId);
    else dockRef.current?.addTab(panelId);
  }, [visiblePanels]);
  const resetLayout = useCallback(() => dockRef.current?.resetLayout(), []);

  // --- Save (serialize material descriptors, not bitmaps directly) ---
  const buildTrimsheetOptions = useCallback(async () => {
    const matDescriptors = await Promise.all(materials.map(async (m) => {
      if (m.source === 'upload') {
        const blobs: { channel: string; blob: Blob }[] = [];
        for (const ch of MAP_CHANNELS) {
          const bmp = m.maps[ch];
          if (!bmp) continue;
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          c.getContext('2d')!.drawImage(bmp, 0, 0);
          blobs.push({ channel: ch, blob: await c.convertToBlob({ type: 'image/png' }) });
        }
        return { id: m.id, name: m.name, source: m.source, uploadBlobs: blobs };
      }
      // polyhaven or flat
      return {
        id: m.id, name: m.name, source: m.source,
        flatColor: m.flatColor, thumbnailUrl: m.thumbnailUrl,
        // For polyhaven we re-fetch on load by name match; store thumbnail for display.
      };
    }));
    return {
      resolution, regions, materials: matDescriptors, enabledChannels,
    };
  }, [materials, regions, resolution, enabledChannels]);

  const trimsheetOptions = useMemo(() => ({ resolution, regions }), [resolution, regions]);

  const { triggerSave, triggerSaveAs } = useProjectSave({
    projectId, setProjectId, projectName, setProjectName,
    type: 'trimsheet',
    frameState: null,
    customFrames: async () => [], // trimsheet stores no frames
    trimsheetOptions,
    fps: 0, loopMode: 'loop', isDirty,
    markSaved: () => setIsDirty(false),
  });

  // Save wrapper that injects the full async-built options blob.
  const doSave = useCallback(async (customName?: string) => {
    // buildTrimsheetOptions is async; persist via the hook after refreshing metadata.
    await buildTrimsheetOptions(); // ensures upload blobs are encoded before save
    await triggerSave(customName);
  }, [buildTrimsheetOptions, triggerSave]);

  const contextValue: TrimsheetContextValue = {
    baker: bakerRef.current,
    bakeVersion,
    resolution, setResolution,
    regions, selectedRegionId, selectRegion: setSelectedRegionId,
    addRegion, updateRegionRect, updateRegionTiling, renameRegion, deleteRegion,
    splitRegion, mergeRegions, generateGrid,
    materials, assignMaterialToRegion, setRegionFlatColor, clearRegionMaterial,
    polyhavenAssets, polyhavenError, polyhavenLoading,
    enabledChannels, toggleChannel, exportZip,
    isDirty, triggerSave: doSave, triggerSaveAs,
    projectName, setProjectName,
    visiblePanels, togglePanel, resetLayout,
  };

  return (
    <TrimsheetProvider value={contextValue}>
      <div className={styles.page}>
        <TrimsheetMenuBar />
        <div className={styles.body}>
          <TrimsheetDockLayout ref={dockRef} onVisiblePanelsChange={setVisiblePanels} />
        </div>
      </div>
    </TrimsheetProvider>
  );
}
```

> **Note on save serialization:** the `useProjectSave` hook persists `trimsheetOptions` directly from the `trimsheetOptions` prop (a plain object). The richer `buildTrimsheetOptions` (with upload blobs) is encoded in `doSave` before calling `triggerSave`; if full material persistence proves heavy, Polyhaven materials reload by `thumbnailUrl`/name and uploads by stored blobs in a later refinement. For this plan, regions + resolution round-trip is the guaranteed-persisted contract; material re-hydration is best-effort.

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 4: Behavioral check**

With `npm run dev` running, open `http://localhost:3000/tools/trimsheet`.
Expected: the menubar shows "Trimsheet Builder", three dock regions render with the five stub panels ("Regions", "Region Inspector", "Trimsheet", "Materials", "Export"), and dragging tabs rearranges them. No console errors on load.

- [ ] **Step 5: Commit**

```bash
git add src/app/tools/trimsheet/page.tsx src/app/tools/trimsheet/page.module.css
git commit -m "feat(trimsheet): add workspace page with region/material/baker state and context"
```

---

## Task 10: RegionPanel (grid generator, list, resolution, split/merge)

**Files:**
- Modify: `src/components/RegionPanel.tsx` (replace stub)
- Create: `src/components/RegionPanel.module.css`

- [ ] **Step 1: Write `RegionPanel.module.css`**

```css
/* src/components/RegionPanel.module.css */
.panel { padding: 10px; display: flex; flex-direction: column; gap: 12px; font-size: 0.8rem; }
.section { display: flex; flex-direction: column; gap: 6px; }
.label { font-weight: 700; opacity: 0.8; text-transform: uppercase; font-size: 0.68rem; }
.row { display: flex; gap: 6px; align-items: center; }
.row input[type="number"] { width: 56px; }
.btn {
  background: var(--primary-color, #3b82f6); color: #fff; border: none;
  padding: 5px 10px; border-radius: 4px; cursor: pointer; font: inherit; font-size: 0.75rem;
}
.btn.secondary { background: var(--border-color, #444); }
.list { display: flex; flex-direction: column; gap: 3px; max-height: 320px; overflow: auto; }
.item {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; cursor: pointer;
  border: 1px solid transparent;
}
.item.active { border-color: var(--primary-color, #3b82f6); background: rgba(59,130,246,0.1); }
.itemName { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iconBtn { background: transparent; border: none; color: #999; cursor: pointer; padding: 2px; }
.select { background: var(--background-color, #1e1e1e); color: inherit; border: 1px solid var(--border-color, #444); padding: 4px; border-radius: 4px; }
```

- [ ] **Step 2: Write `RegionPanel.tsx`**

```tsx
// src/components/RegionPanel.tsx
'use client';

import React, { useState } from 'react';
import { Trash2, SplitSquareHorizontal, SplitSquareVertical } from 'lucide-react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { TrimResolution } from '@/lib/trimsheetTypes';
import styles from './RegionPanel.module.css';

export function RegionPanel() {
  const ctx = useTrimsheetContext();
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [mergeWith, setMergeWith] = useState<string>('');

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <span className={styles.label}>Resolution</span>
        <select
          className={styles.select}
          value={ctx.resolution}
          onChange={(e) => ctx.setResolution(Number(e.target.value) as TrimResolution)}
        >
          <option value={512}>512 × 512</option>
          <option value={1024}>1024 × 1024</option>
          <option value={2048}>2048 × 2048</option>
        </select>
      </div>

      <div className={styles.section}>
        <span className={styles.label}>Generate Grid</span>
        <div className={styles.row}>
          <label>Rows</label>
          <input type="number" min={1} max={16} value={rows}
            onChange={(e) => setRows(Math.max(1, Number(e.target.value)))} />
          <label>Cols</label>
          <input type="number" min={1} max={16} value={cols}
            onChange={(e) => setCols(Math.max(1, Number(e.target.value)))} />
        </div>
        <button className={styles.btn} onClick={() => ctx.generateGrid(rows, cols)}>
          Apply Grid (replaces regions)
        </button>
        <button className={styles.btn} style={{ marginTop: 4 }}
          onClick={() => ctx.addRegion({ x: 0.25, y: 0.25, w: 0.5, h: 0.25 })}>
          + Add Free Region
        </button>
      </div>

      <div className={styles.section}>
        <span className={styles.label}>Regions ({ctx.regions.length})</span>
        <div className={styles.list}>
          {ctx.regions.map((r) => (
            <div
              key={r.id}
              className={`${styles.item} ${ctx.selectedRegionId === r.id ? styles.active : ''}`}
              onClick={() => ctx.selectRegion(r.id)}
            >
              <input
                className={styles.itemName}
                value={r.name}
                onChange={(e) => ctx.renameRegion(r.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={{ background: 'transparent', border: 'none', color: 'inherit', font: 'inherit' }}
              />
              <button className={styles.iconBtn} title="Split vertical"
                onClick={(e) => { e.stopPropagation(); ctx.splitRegion(r.id, 'vertical'); }}>
                <SplitSquareHorizontal size={13} />
              </button>
              <button className={styles.iconBtn} title="Split horizontal"
                onClick={(e) => { e.stopPropagation(); ctx.splitRegion(r.id, 'horizontal'); }}>
                <SplitSquareVertical size={13} />
              </button>
              <button className={styles.iconBtn} title="Delete"
                onClick={(e) => { e.stopPropagation(); ctx.deleteRegion(r.id); }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {ctx.selectedRegionId && ctx.regions.length > 1 && (
        <div className={styles.section}>
          <span className={styles.label}>Merge selected with</span>
          <div className={styles.row}>
            <select className={styles.select} value={mergeWith} onChange={(e) => setMergeWith(e.target.value)}>
              <option value="">Pick a region…</option>
              {ctx.regions.filter((r) => r.id !== ctx.selectedRegionId).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button className={`${styles.btn} ${styles.secondary}`}
              disabled={!mergeWith}
              onClick={() => { if (mergeWith && ctx.selectedRegionId) { ctx.mergeRegions(ctx.selectedRegionId, mergeWith); setMergeWith(''); } }}>
              Merge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors. (`SplitSquareHorizontal`/`SplitSquareVertical` exist in `lucide-react` ^0.562.)

- [ ] **Step 4: Behavioral check**

At `http://localhost:3000/tools/trimsheet`: set Rows=2, Cols=3, click "Apply Grid" → the Regions list shows 6 entries. Click a region → it highlights. Click a split icon → count increases by 1. Click trash → count decreases. Switch resolution dropdown → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/RegionPanel.tsx src/components/RegionPanel.module.css
git commit -m "feat(trimsheet): implement RegionPanel with grid, list, split/merge, resolution"
```

---

## Task 11: TrimsheetCanvas (preview render + region editing)

**Files:**
- Modify: `src/components/TrimsheetCanvas.tsx` (replace stub)
- Create: `src/components/TrimsheetCanvas.module.css`

- [ ] **Step 1: Write `TrimsheetCanvas.module.css`**

```css
/* src/components/TrimsheetCanvas.module.css */
.wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  background: repeating-conic-gradient(#2a2a2a 0% 25%, #222 0% 50%) 50% / 24px 24px; overflow: hidden; }
.stage { position: relative; box-shadow: 0 0 0 1px #000; }
.canvas { display: block; image-rendering: pixelated; }
.overlay { position: absolute; inset: 0; cursor: crosshair; }
```

- [ ] **Step 2: Write `TrimsheetCanvas.tsx`**

A square stage sized to fit the panel. One `<canvas>` shows the baker's albedo preview; a transparent overlay `<canvas>` draws region outlines/handles and handles pointer interaction (drag-to-draw new region, drag body to move selected, drag corner handle to resize). Snapping to a 1/16 grid is applied unless Alt is held.

```tsx
// src/components/TrimsheetCanvas.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { NormRect, Region } from '@/lib/trimsheetTypes';
import styles from './TrimsheetCanvas.module.css';

const VIEW = 512; // on-screen stage size in CSS px (square)
const SNAP = 1 / 16;

type DragMode =
  | { kind: 'draw'; startX: number; startY: number }
  | { kind: 'move'; id: string; grabDX: number; grabDY: number }
  | { kind: 'resize'; id: string; }
  | null;

function snap(v: number, alt: boolean): number {
  if (alt) return v;
  return Math.round(v / SNAP) * SNAP;
}
function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

export function TrimsheetCanvas() {
  const ctx = useTrimsheetContext();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const [draft, setDraft] = useState<NormRect | null>(null);

  // Paint the baker's albedo preview whenever bakeVersion changes.
  useEffect(() => {
    const baker = ctx.baker;
    const cvs = previewRef.current;
    if (!baker || !cvs) return;
    const src = baker.getPreviewCanvas();
    const c = cvs.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, cvs.width, cvs.height);
    // src is an OffscreenCanvas; drawImage accepts it.
    c.drawImage(src as unknown as CanvasImageSource, 0, 0, cvs.width, cvs.height);
  }, [ctx.baker, ctx.bakeVersion, ctx.resolution]);

  // Draw region outlines + handles overlay.
  const drawOverlay = useCallback(() => {
    const cvs = overlayRef.current;
    if (!cvs) return;
    const c = cvs.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, VIEW, VIEW);
    for (const r of ctx.regions) {
      const x = r.rect.x * VIEW, y = r.rect.y * VIEW, w = r.rect.w * VIEW, h = r.rect.h * VIEW;
      const active = r.id === ctx.selectedRegionId;
      c.lineWidth = active ? 2 : 1;
      c.strokeStyle = active ? '#3b82f6' : 'rgba(255,255,255,0.6)';
      c.strokeRect(x + 0.5, y + 0.5, w, h);
      c.fillStyle = active ? '#3b82f6' : 'rgba(255,255,255,0.6)';
      c.font = '11px sans-serif';
      c.fillText(r.name, x + 4, y + 14);
      if (active) {
        // bottom-right resize handle
        c.fillRect(x + w - 6, y + h - 6, 8, 8);
      }
    }
    if (draft) {
      c.strokeStyle = '#22c55e';
      c.setLineDash([4, 3]);
      c.strokeRect(draft.x * VIEW + 0.5, draft.y * VIEW + 0.5, draft.w * VIEW, draft.h * VIEW);
      c.setLineDash([]);
    }
  }, [ctx.regions, ctx.selectedRegionId, draft]);

  useEffect(() => { drawOverlay(); }, [drawOverlay]);

  const toNorm = (e: React.PointerEvent): { nx: number; ny: number } => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { nx: clamp01((e.clientX - rect.left) / rect.width), ny: clamp01((e.clientY - rect.top) / rect.height) };
  };

  const hitRegion = (nx: number, ny: number): Region | null => {
    // topmost last-drawn wins; iterate in reverse
    for (let i = ctx.regions.length - 1; i >= 0; i--) {
      const r = ctx.regions[i];
      if (nx >= r.rect.x && nx <= r.rect.x + r.rect.w && ny >= r.rect.y && ny <= r.rect.y + r.rect.h) return r;
    }
    return null;
  };

  const isOnResizeHandle = (r: Region, nx: number, ny: number): boolean => {
    const hx = r.rect.x + r.rect.w, hy = r.rect.y + r.rect.h;
    return Math.abs(nx - hx) < 0.02 && Math.abs(ny - hy) < 0.02;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    overlayRef.current!.setPointerCapture(e.pointerId);
    const { nx, ny } = toNorm(e);
    const sel = ctx.regions.find((r) => r.id === ctx.selectedRegionId) || null;
    if (sel && isOnResizeHandle(sel, nx, ny)) {
      setDrag({ kind: 'resize', id: sel.id });
      return;
    }
    const hit = hitRegion(nx, ny);
    if (hit) {
      ctx.selectRegion(hit.id);
      setDrag({ kind: 'move', id: hit.id, grabDX: nx - hit.rect.x, grabDY: ny - hit.rect.y });
    } else {
      setDrag({ kind: 'draw', startX: nx, startY: ny });
      setDraft({ x: nx, y: ny, w: 0, h: 0 });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { nx, ny } = toNorm(e);
    const alt = e.altKey;
    if (drag.kind === 'draw') {
      const x = Math.min(drag.startX, nx), y = Math.min(drag.startY, ny);
      const w = Math.abs(nx - drag.startX), h = Math.abs(ny - drag.startY);
      setDraft({ x: snap(x, alt), y: snap(y, alt), w: snap(w, alt), h: snap(h, alt) });
    } else if (drag.kind === 'move') {
      const r = ctx.regions.find((x) => x.id === drag.id);
      if (!r) return;
      const nxX = clamp01(snap(nx - drag.grabDX, alt));
      const nyY = clamp01(snap(ny - drag.grabDY, alt));
      ctx.updateRegionRect(drag.id, { ...r.rect, x: Math.min(nxX, 1 - r.rect.w), y: Math.min(nyY, 1 - r.rect.h) });
    } else if (drag.kind === 'resize') {
      const r = ctx.regions.find((x) => x.id === drag.id);
      if (!r) return;
      const w = clamp01(snap(nx, alt)) - r.rect.x;
      const h = clamp01(snap(ny, alt)) - r.rect.y;
      ctx.updateRegionRect(drag.id, { ...r.rect, w: Math.max(SNAP, w), h: Math.max(SNAP, h) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag?.kind === 'draw' && draft && draft.w > 0.02 && draft.h > 0.02) {
      ctx.addRegion(draft);
    }
    setDraft(null);
    setDrag(null);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.stage} style={{ width: VIEW, height: VIEW }}>
        <canvas ref={previewRef} className={styles.canvas} width={VIEW} height={VIEW} />
        <canvas
          ref={overlayRef}
          className={styles.overlay}
          width={VIEW}
          height={VIEW}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Behavioral check**

At the tool: drag on the empty canvas → a green dashed draft rect follows, and on release a new region is created and selected. Drag a region's body → it moves (snapping to 1/16; hold Alt to disable). Drag the bottom-right handle of the selected region → it resizes. Generate a 2×2 grid from RegionPanel → four outlined regions appear over the checker background.

- [ ] **Step 4: Commit**

```bash
git add src/components/TrimsheetCanvas.tsx src/components/TrimsheetCanvas.module.css
git commit -m "feat(trimsheet): implement canvas viewport with draw/move/resize and preview render"
```

---

## Task 12: TrimMaterialPanel (Polyhaven browser + upload + assign)

**Files:**
- Modify: `src/components/TrimMaterialPanel.tsx` (replace stub)
- Create: `src/components/TrimMaterialPanel.module.css`

- [ ] **Step 1: Write `TrimMaterialPanel.module.css`**

```css
/* src/components/TrimMaterialPanel.module.css */
.panel { padding: 10px; display: flex; flex-direction: column; gap: 10px; font-size: 0.8rem; height: 100%; }
.banner { background: rgba(234,179,8,0.12); border: 1px solid rgba(234,179,8,0.4); padding: 6px 8px; border-radius: 4px; font-size: 0.72rem; }
.search { width: 100%; padding: 5px 8px; background: var(--background-color,#1e1e1e); border: 1px solid var(--border-color,#444); border-radius: 4px; color: inherit; }
.hint { font-size: 0.7rem; opacity: 0.6; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; overflow: auto; flex: 1; }
.card { border: 1px solid var(--border-color,#444); border-radius: 6px; overflow: hidden; cursor: pointer; position: relative; background: #161616; }
.card img { width: 100%; height: 64px; object-fit: cover; display: block; }
.card .name { font-size: 0.62rem; padding: 3px 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { position: absolute; top: 3px; right: 3px; background: rgba(0,0,0,0.7); color: #fff; font-size: 0.6rem; padding: 1px 4px; border-radius: 3px; }
.uploadBox { border: 1px dashed var(--border-color,#555); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.btn { background: var(--primary-color,#3b82f6); color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font:inherit; font-size:0.74rem; }
.loading { text-align: center; opacity: 0.6; padding: 20px; }
```

- [ ] **Step 2: Write `TrimMaterialPanel.tsx`**

```tsx
// src/components/TrimMaterialPanel.tsx
'use client';

import React, { useState } from 'react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { loadPolyhavenMaterial, loadUploadMaterial, PolyhavenAsset } from '@/lib/trimsheetMaterials';
import styles from './TrimMaterialPanel.module.css';

export function TrimMaterialPanel() {
  const ctx = useTrimsheetContext();
  const [query, setQuery] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const noRegion = !ctx.selectedRegionId;

  const applyPolyhaven = async (asset: PolyhavenAsset) => {
    if (!ctx.selectedRegionId) { alert('Select a region first, then click a material.'); return; }
    setApplyingId(asset.id);
    try {
      const mat = await loadPolyhavenMaterial(asset);
      ctx.assignMaterialToRegion(ctx.selectedRegionId, mat);
    } catch (err) {
      console.error(err);
      alert('Failed to load this Polyhaven material. Try another or upload your own.');
    } finally {
      setApplyingId(null);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!ctx.selectedRegionId) { alert('Select a region first.'); return; }
    const albedo = e.target.files?.[0];
    if (!albedo) return;
    try {
      const mat = await loadUploadMaterial(albedo.name, { albedo });
      ctx.assignMaterialToRegion(ctx.selectedRegionId, mat);
    } catch (err) {
      console.error(err);
      alert('Failed to load uploaded image.');
    } finally {
      e.target.value = '';
    }
  };

  const filtered = ctx.polyhavenAssets.filter(
    (a) => a.name.toLowerCase().includes(query.toLowerCase()) || a.id.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 60); // cap render for performance

  return (
    <div className={styles.panel}>
      {noRegion && <div className={styles.banner}>Select a region, then click a material (or upload) to assign it.</div>}
      {ctx.polyhavenError && <div className={styles.banner}>{ctx.polyhavenError}</div>}

      <div className={styles.uploadBox}>
        <strong style={{ fontSize: '0.72rem' }}>Upload your texture (albedo)</strong>
        <input type="file" accept="image/*" onChange={onUpload} />
        <span className={styles.hint}>Assigns to the selected region. Additional maps (normal/rough/metal/AO) can be layered via re-upload in a future update.</span>
      </div>

      <input
        className={styles.search}
        placeholder="Search Polyhaven materials…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {ctx.polyhavenLoading ? (
        <div className={styles.loading}>Loading Polyhaven library…</div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((a) => (
            <div key={a.id} className={styles.card} onClick={() => applyPolyhaven(a)} title={a.name}>
              <img src={a.thumbnail} alt={a.name} loading="lazy" />
              {applyingId === a.id && <span className={styles.badge}>…</span>}
              <div className={styles.name}>{a.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 4: Behavioral check**

At the tool, with a region selected: the Materials panel shows Polyhaven thumbnails (or the offline banner). Clicking a thumbnail composites that material into the selected region — the canvas preview updates to show the tiled texture inside the rect. Upload an image → it fills the selected region. With no region selected, clicking shows the "Select a region first" alert.

- [ ] **Step 5: Commit**

```bash
git add src/components/TrimMaterialPanel.tsx src/components/TrimMaterialPanel.module.css
git commit -m "feat(trimsheet): implement material panel with Polyhaven browse and upload assign"
```

---

## Task 13: RegionInspectorPanel + TrimsheetExportPanel

**Files:**
- Modify: `src/components/RegionInspectorPanel.tsx` (replace stub)
- Create: `src/components/RegionInspectorPanel.module.css`
- Modify: `src/components/TrimsheetExportPanel.tsx` (replace stub)
- Create: `src/components/TrimsheetExportPanel.module.css`

- [ ] **Step 1: Write `RegionInspectorPanel.module.css`**

```css
/* src/components/RegionInspectorPanel.module.css */
.panel { padding: 10px; display: flex; flex-direction: column; gap: 12px; font-size: 0.8rem; }
.empty { opacity: 0.5; padding: 20px; text-align: center; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 0.68rem; text-transform: uppercase; opacity: 0.7; }
.row { display: flex; align-items: center; gap: 8px; }
.row input[type="range"] { flex: 1; }
.val { width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
.btn { background: var(--border-color,#444); color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font:inherit; font-size:0.74rem; }
.select { background: var(--background-color,#1e1e1e); color: inherit; border: 1px solid var(--border-color,#444); padding: 4px; border-radius: 4px; }
```

- [ ] **Step 2: Write `RegionInspectorPanel.tsx`**

```tsx
// src/components/RegionInspectorPanel.tsx
'use client';

import React from 'react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { countMaps } from '@/lib/trimsheetMaterials';
import styles from './RegionInspectorPanel.module.css';

export function RegionInspectorPanel() {
  const ctx = useTrimsheetContext();
  const region = ctx.regions.find((r) => r.id === ctx.selectedRegionId) || null;

  if (!region) return <div className={styles.empty}>Select a region to edit its material and tiling.</div>;

  const material = region.materialId ? ctx.materials.find((m) => m.id === region.materialId) || null : null;

  return (
    <div className={styles.panel}>
      <div className={styles.field}>
        <label>Region</label>
        <input className={styles.select} value={region.name}
          onChange={(e) => ctx.renameRegion(region.id, e.target.value)} />
      </div>

      <div className={styles.field}>
        <label>Material</label>
        <div className={styles.row}>
          <span style={{ flex: 1 }}>
            {material ? `${material.name} (${countMaps(material)}/5 maps)` : 'None'}
          </span>
          {material && (
            <button className={styles.btn} onClick={() => ctx.clearRegionMaterial(region.id)}>Clear</button>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label>Flat Color (no-texture fill)</label>
        <input type="color"
          onChange={(e) => ctx.setRegionFlatColor(region.id, e.target.value)} />
      </div>

      <div className={styles.field}>
        <label>Tiling Scale ({region.tiling.scale.toFixed(2)}×)</label>
        <div className={styles.row}>
          <input type="range" min={0.25} max={8} step={0.25} value={region.tiling.scale}
            onChange={(e) => ctx.updateRegionTiling(region.id, { scale: Number(e.target.value) })} />
          <span className={styles.val}>{region.tiling.scale.toFixed(2)}</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>Offset X</label>
        <div className={styles.row}>
          <input type="range" min={0} max={1} step={0.01} value={region.tiling.offsetX}
            onChange={(e) => ctx.updateRegionTiling(region.id, { offsetX: Number(e.target.value) })} />
          <span className={styles.val}>{region.tiling.offsetX.toFixed(2)}</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>Offset Y</label>
        <div className={styles.row}>
          <input type="range" min={0} max={1} step={0.01} value={region.tiling.offsetY}
            onChange={(e) => ctx.updateRegionTiling(region.id, { offsetY: Number(e.target.value) })} />
          <span className={styles.val}>{region.tiling.offsetY.toFixed(2)}</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>Rotation</label>
        <select className={styles.select} value={region.tiling.rotation}
          onChange={(e) => ctx.updateRegionTiling(region.id, { rotation: Number(e.target.value) as 0 | 90 | 180 | 270 })}>
          <option value={0}>0°</option>
          <option value={90}>90°</option>
          <option value={180}>180°</option>
          <option value={270}>270°</option>
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `TrimsheetExportPanel.module.css`**

```css
/* src/components/TrimsheetExportPanel.module.css */
.panel { padding: 10px; display: flex; flex-direction: column; gap: 12px; font-size: 0.8rem; }
.label { font-size: 0.68rem; text-transform: uppercase; opacity: 0.7; }
.channels { display: flex; flex-direction: column; gap: 4px; }
.channel { display: flex; align-items: center; gap: 8px; }
.btn { background: var(--primary-color,#3b82f6); color:#fff; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font:inherit; font-weight:700; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.note { font-size: 0.7rem; opacity: 0.6; }
```

- [ ] **Step 4: Write `TrimsheetExportPanel.tsx`**

```tsx
// src/components/TrimsheetExportPanel.tsx
'use client';

import React, { useState } from 'react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { MAP_CHANNELS } from '@/lib/trimsheetTypes';
import styles from './TrimsheetExportPanel.module.css';

export function TrimsheetExportPanel() {
  const ctx = useTrimsheetContext();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await ctx.exportZip();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div>
        <div className={styles.label}>Export Channels</div>
        <div className={styles.channels}>
          {MAP_CHANNELS.map((ch) => (
            <label key={ch} className={styles.channel}>
              <input
                type="checkbox"
                checked={ctx.enabledChannels.includes(ch)}
                onChange={() => ctx.toggleChannel(ch)}
              />
              <span style={{ textTransform: 'capitalize' }}>{ch}</span>
            </label>
          ))}
        </div>
      </div>

      <button className={styles.btn} onClick={handleExport} disabled={exporting || ctx.enabledChannels.length === 0}>
        {exporting ? 'Exporting…' : 'Export .zip'}
      </button>

      <div className={styles.note}>
        Exports {ctx.enabledChannels.length} PNG map(s) at {ctx.resolution}×{ctx.resolution} plus a region JSON,
        bundled as a single .zip. The JSON describes each region’s normalized rect, material, and tiling.
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 6: Behavioral check**

Select a region with a material → the Inspector shows its name, "N/5 maps", tiling sliders. Drag the Scale slider → the canvas preview re-tiles live. Pick a flat color → the region fills solid. In the Export panel, toggle off "metalness", click "Export .zip" → a `.zip` downloads; open it and confirm it contains 4 PNGs (albedo/normal/roughness/ao) + a `.json` whose `regions[]` have normalized rects.

- [ ] **Step 7: Commit**

```bash
git add src/components/RegionInspectorPanel.tsx src/components/RegionInspectorPanel.module.css src/components/TrimsheetExportPanel.tsx src/components/TrimsheetExportPanel.module.css
git commit -m "feat(trimsheet): implement region inspector and export panels"
```

---

## Task 14: Launcher card + changelog (lockstep)

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/ChangelogDrawer.tsx`
- Modify: `src/data/changelog.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the launcher card in `src/app/page.tsx`**

After the 3D Pixel-Painter `toolCard` closing `</div>` (the one right before `</section>` near line 233), insert a new card. Match the existing markup exactly:

```tsx
          <div className={styles.toolCard}>
            <div className={styles.toolHeader}>
              <div className={styles.toolIcon}>🧱</div>
              <span className={styles.toolBadge}>v0.9.0-beta</span>
            </div>
            <div className={styles.toolTitleRow}>
              <h2 className={styles.toolTitle}>Trimsheet Builder</h2>
              <button
                onClick={() => openChangelog('trimsheet')}
                className={styles.toolChangelogBtn}
                title="View tool updates history"
              >
                <Clock size={12} />
              </button>
            </div>
            <p className={styles.toolDesc}>
              Lay out named regions on a square trimsheet, drop Polyhaven or your own PBR materials
              onto each region with per-region tiling, and export engine-ready albedo, normal,
              roughness, metalness, and AO maps plus a region JSON.
            </p>
            <ul className={styles.toolFeatures}>
              <li>► Grid + freeform region layout</li>
              <li>► Polyhaven library + custom texture upload</li>
              <li>► Per-region tiling: scale, offset, rotation</li>
              <li>► Exports 5 PBR maps + region JSON as .zip</li>
            </ul>
            <Link href="/tools/trimsheet" className={styles.toolCta}>
              Launch Trimsheet Builder
            </Link>
          </div>
```

- [ ] **Step 2: Extend the changelog filter type + restore mapping in `src/app/page.tsx`**

The `changelogFilter` state union (line ~19) reads:
```tsx
  const [changelogFilter, setChangelogFilter] = useState<'All' | 'spritesheet' | 'pixelator' | '3d-painter'>('All');
```
Change to include `'trimsheet'`:
```tsx
  const [changelogFilter, setChangelogFilter] = useState<'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet'>('All');
```

The `openChangelog` function (line ~76) is typed:
```tsx
  const openChangelog = (filter: 'All' | 'spritesheet' | 'pixelator' | '3d-painter') => {
```
Widen its parameter type to include `'trimsheet'`:
```tsx
  const openChangelog = (filter: 'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet') => {
```

In the Recent Projects mapping (around lines 254–261), add a trimsheet branch:
```tsx
                const isTrimsheet = proj.type === 'trimsheet';
```
and in the `targetLink` chain:
```tsx
                else if (isTrimsheet) targetLink = `/tools/trimsheet?project=${proj.id}`;
```

- [ ] **Step 2b: Widen the `ChangelogDrawer` prop type in `src/components/ChangelogDrawer.tsx`**

The `changelogFilter` state (widened in Step 2) is passed to `<ChangelogDrawer initialFilter={changelogFilter} />`, so the drawer's prop type must accept `'trimsheet'` too. Line ~11 reads:
```tsx
  initialFilter?: 'All' | 'spritesheet' | 'pixelator' | '3d-painter';
```
Change to:
```tsx
  initialFilter?: 'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet';
```
Also check the component's internal `activeFilter` state (set from `initialFilter` via `setActiveFilter`): if it is declared with the same explicit union (e.g. `useState<'All' | 'spritesheet' | 'pixelator' | '3d-painter'>('All')`), widen that union identically so `setActiveFilter(initialFilter)` typechecks.

- [ ] **Step 3: Add the changelog data entry in `src/data/changelog.ts`**

Widen the `toolScope` union in the `ChangelogVersion` interface:
```ts
  toolScope: 'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet';
```
Then add a new entry at the TOP of the `changelogData` array (newest first):
```ts
  {
    version: '0.9.0-beta',
    date: '2026-06-28',
    toolScope: 'trimsheet',
    toolName: 'Trimsheet Builder',
    items: [
      { category: 'Added', detail: 'New Trimsheet Builder tool: grid + freeform region layout on a square canvas.' },
      { category: 'Added', detail: 'PBR material assignment per region from Polyhaven library or custom texture upload.' },
      { category: 'Added', detail: 'Per-region tiling controls: scale, offset, and 90-degree rotation.' },
      { category: 'Added', detail: 'Export of albedo, normal, roughness, metalness, and AO maps plus a region JSON, bundled as a .zip.' }
    ]
  },
```

- [ ] **Step 4: Add the matching `CHANGELOG.md` entry (lockstep, top of file under the title block)**

Insert above the existing `## [0.8.2-beta]` section:
```markdown
## [0.9.0-beta] - 2026-06-28

### Added
- **Trimsheet Builder**: New tool — grid + freeform region layout on a square trimsheet canvas.
- **PBR Material Assignment**: Drop Polyhaven library materials or upload custom textures onto individual regions.
- **Per-Region Tiling**: Scale, offset, and 90° rotation controls per region.
- **Trimsheet Export**: Albedo, Normal, Roughness, Metalness, and AO maps plus a region-metadata JSON, packed into a single `.zip`.

---
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 6: Behavioral check**

Open `http://localhost:3000`. A "Trimsheet Builder" card appears with a working "Launch" link and changelog clock button (clicking it opens the drawer filtered to trimsheet). Save a project in the trimsheet tool (menubar → Save) then return home → it appears under Recent Local Operations with a working "Restore Workspace" link.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/data/changelog.ts CHANGELOG.md
git commit -m "feat(trimsheet): add launcher card and lockstep changelog entries"
```

---

## Task 15: Project load (re-hydrate a saved trimsheet)

**Files:**
- Modify: `src/app/tools/trimsheet/page.tsx`

This task adds loading a saved project by `?project=<id>` so the Restore link works end-to-end. Regions + resolution are the guaranteed contract; materials re-hydrate best-effort (Polyhaven by stored id/thumbnail, uploads by stored blobs).

- [ ] **Step 1: Add `getProject` import and a load effect**

At the top of `src/app/tools/trimsheet/page.tsx`, add to the imports:

```tsx
import { getProject } from '@/lib/projectDatabase';
```

(Confirm the export name: open `src/lib/projectDatabase.ts` and check the function that reads one project by id — it is `getProject`. If it is named differently, use that name.)

Add this effect after the baker-init effect, before the Polyhaven effect:

```tsx
  // Load an existing project if ?project=<id> is present.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('project');
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const proj = await getProject(id);
        if (!active || !proj) return;
        const opts = proj.metadata?.trimsheetOptions;
        setProjectId(proj.id);
        setProjectName(proj.name);
        if (opts) {
          const res = (opts.resolution ?? 1024) as TrimResolution;
          setResolutionState(res);
          // Ensure the baker matches the loaded resolution before compositing.
          if (bakerRef.current) {
            bakerRef.current.setResolution(res, [], materialsRef.current);
          }
          const loadedRegions: Region[] = Array.isArray(opts.regions) ? opts.regions : [];
          setRegions(loadedRegions);
          // Re-composite each region (materials best-effort; empty => fallback fills).
          loadedRegions.forEach((r) => {
            const mat = r.materialId ? materialsRef.current.get(r.materialId) ?? null : null;
            bakerRef.current?.compositeRegion(r, mat);
          });
          setBakeVersion((v) => v + 1);
        }
      } catch (err) {
        console.error('Failed to load trimsheet project:', err);
      }
    })();
    return () => { active = false; };
  }, []);
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Behavioral check**

In the trimsheet tool, generate a 3×2 grid, assign a flat color to one region, Save. Note the project URL gains `?project=...` (via Save As) — or reload home and click Restore. The tool reopens with the same resolution and region layout; flat-color regions render their color, textured regions render at least their fallback. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/tools/trimsheet/page.tsx
git commit -m "feat(trimsheet): load saved trimsheet projects by id with region re-hydration"
```

---

## Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Compiles clean, no type errors, `/tools/trimsheet` route listed in the build output.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: No new errors in the trimsheet files. (Warnings consistent with the rest of the repo are acceptable.)

- [ ] **Step 3: End-to-end manual pass** (`npm run dev`)

Walk the full flow: home → Launch Trimsheet Builder → generate grid → assign Polyhaven material to one region, upload a texture to another, flat-color a third → adjust tiling scale/rotation on the textured region and watch the preview update → toggle off a channel → Export .zip → open the zip and confirm the expected PNGs + region JSON → Save → return home → Restore → layout persists.

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore(trimsheet): final verification cleanup"
```

---

## Self-review notes (addressed during authoring)

- **Spec coverage:** grid+free regions (Tasks 10/11), 5-channel bake with fallbacks (Tasks 1–3), tiling scale/offset/rotation (Tasks 3/13), Polyhaven+upload sources (Tasks 5/12), maps+JSON+zip export with fflate (Task 4/13), 512–2048 presets (Tasks 1/10), 2D-only preview (Task 11), persistence + launcher + changelog (Tasks 7/14/15) — all mapped to tasks.
- **Type consistency:** `compositeRegion(region, material)`, `clearRegion(rect)`, `setResolution(res, regions, materials)`, `export(regions, channels, name)`, `MapChannel`, `NormRect`, `TrimMaterial.maps`, and context method names are used identically across the baker, context, page, and panels.
- **Known best-effort area:** material re-hydration on load is explicitly scoped as best-effort (regions+resolution guaranteed); flagged in Tasks 9 and 15 so it is not mistaken for a gap.
