# Material Stylizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new self-contained browser tool (`tools/stylizer`) that converts realistic textures/PBR materials into stylized hand-painted looks (painterly, cel, watercolor, sketch), with live 2D/3D preview and map export.

**Architecture:** Mirror the existing per-tool pattern — an isolated page under `src/app/tools/stylizer/` owning all state, its own `StylizerContext`, a `StylizerDockLayout` (flexlayout-react), and dedicated panel components. A pure engine `src/lib/stylizer.ts` follows the `pixelator.ts` shape (`Options` + `DEFAULT` + processing functions taking/returning `ImageBitmap`). The `ThreePainter` engine is reused read-only for the optional 3D preview.

**Tech Stack:** Next.js App Router (React 19, `'use client'`), TypeScript, CSS Modules + Tailwind v4 tokens, `flexlayout-react`, Canvas/`OffscreenCanvas`/`ImageBitmap`, Three.js (`threePainter.ts`), IndexedDB (`projectDatabase.ts`), `jszip` (already used by exporter).

## Global Constraints

- **No test runner exists.** Verification in this repo = a clean `npm run build`. Every task ends with `npm run build` passing plus a manual smoke check. Do NOT invent a test framework.
- **Lockstep changelog is mandatory.** Any version-worthy change updates BOTH `CHANGELOG.md` (Keep a Changelog format) AND `src/data/changelog.ts` (a `ChangelogVersion` object) with matching content. This happens in Task 12.
- **Conventional Commits + SemVer intent:** `feat:` (minor), `fix:` (patch), `refactor:`, `docs:`, `style:`.
- **Fully client-side.** All processing in the browser. No new server routes (the optional AI pass is phase 2 and out of scope here). Persistence is local IndexedDB only.
- **`ImageBitmap`s must be explicitly disposed** (`.close()`) on replace/reset/unmount to avoid GPU memory leaks. This is a hard repo rule.
- **Path alias:** `@/*` → `src/*`. Use `@/components`, `@/lib`, `@/contexts`, `@/hooks`.
- **Styling:** one `Component.module.css` per component; use design tokens from `src/app/globals.css` (no hardcoded colors — recent commits enforce this).
- **Windows/bash environment:** forward slashes in code paths; the git line-ending warning (LF→CRLF) is expected and harmless.
- **Project type string is `'stylizer'`** everywhere (project DB union, changelog `toolScope`, launcher filter).

---

## File Structure

**New files:**
- `src/lib/stylizer.ts` — pure engine: `StylizerOptions`, `DEFAULT_STYLIZER_OPTIONS`, `stylize()`, `bakeLighting()`, `regenerateNormal()`, `regenerateHeight()`, `flattenMap()`.
- `src/contexts/StylizerContext.tsx` — `StylizerContextValue`, `StylizerProvider`, `useStylizerContext()`.
- `src/app/tools/stylizer/page.tsx` — tool page, owns state, assembles context, renders menubar + dock.
- `src/app/tools/stylizer/page.module.css` — page layout.
- `src/components/StylizerDockLayout.tsx` (+ `.module.css`) — dock layout + `PANEL_INFO` + factory + imperative ref.
- `src/components/StylizerMenuBar.tsx` (+ `.module.css`) — File/View/Help menubar.
- `src/components/StylizerMaterialLoaderPanel.tsx` (+ `.module.css`) — per-slot map loaders.
- `src/components/StylizerStylePanel.tsx` (+ `.module.css`) — style selector + knobs.
- `src/components/StylizerMapOutputPanel.tsx` (+ `.module.css`) — bake/regen/flatten toggles + thumbnails.
- `src/components/StylizerPreviewPanel.tsx` (+ `.module.css`) — 2D wipe/tile preview.
- `src/components/StylizerPreview3DPanel.tsx` (+ `.module.css`) — 3D material preview.
- `src/components/StylizerExportPanel.tsx` (+ `.module.css`) — map export zip.

**Modified files:**
- `src/lib/projectDatabase.ts` — add `'stylizer'` to two type unions; add `stylizerOptions` to `ProjectMetadata`.
- `src/data/changelog.ts` — add `'stylizer'` to `toolScope` union + new version entry.
- `CHANGELOG.md` — matching entry.
- `src/app/page.tsx` — launcher nav link, tool card, changelog filter, project badge + deep link.

---

## Task 1: Stylizer engine — options shape and color/tone helpers

**Files:**
- Create: `src/lib/stylizer.ts`

**Interfaces:**
- Consumes: nothing (pure, leaf module).
- Produces: `StylizerOptions` interface, `DEFAULT_STYLIZER_OPTIONS` const, and internal helpers `toImageData(bitmap)`, `fromImageData(imageData)`, `applyToneAdjust(data, contrast, saturation, brightness)`. These are consumed by Tasks 2–4 and by the panels (Tasks 7–8).

- [ ] **Step 1: Create the engine file with the options contract and canvas helpers**

Create `src/lib/stylizer.ts`:

```ts
/**
 * stylizer.ts - Pure, framework-free engine that converts realistic textures
 * into stylized looks (painterly / cel / watercolor / sketch), bakes lighting
 * into the albedo, and regenerates normal/height maps. Mirrors pixelator.ts.
 *
 * All functions take and return ImageBitmap and run on OffscreenCanvas so they
 * stay off the React tree. Callers own bitmap disposal.
 */

export type StylizerStyle = 'painterly' | 'cel' | 'watercolor' | 'sketch';

export interface StylizerOptions {
  style: StylizerStyle;

  // Shared pre-stage
  smoothRadius: number;        // 0..8  Kuwahara/mean radius ("brush size")
  bilateralPreSmooth: boolean;
  contrast: number;            // -100..100
  saturation: number;          // -100..100
  brightness: number;          // -100..100

  // Painterly
  brushStrength: number;       // 0..100
  detailPreserve: number;      // 0..100

  // Cel
  levels: number;              // 2..16 posterize bands
  celSmoothing: number;        // 0..100
  paletteSnap: boolean;

  // Watercolor
  bleed: number;               // 0..100
  granulation: number;         // 0..100
  washStrength: number;        // 0..100

  // Sketch
  lineStrength: number;        // 0..100
  lineThreshold: number;       // 0..100
  hatching: boolean;

  // Shared post-stage
  outlineEnabled: boolean;
  outlineColor: string;        // hex
  outlineThickness: number;    // 1..4 px

  // AO + shading bake
  bakeAO: boolean;
  bakeShading: boolean;
  bakeStrength: number;        // 0..100

  // Map regeneration
  regenerateNormal: boolean;
  normalStrength: number;      // 0..100
  regenerateHeight: boolean;
  flattenRoughness: boolean;
  flattenMetallic: boolean;
}

export const DEFAULT_STYLIZER_OPTIONS: StylizerOptions = {
  style: 'painterly',
  smoothRadius: 3,
  bilateralPreSmooth: true,
  contrast: 10,
  saturation: 0,
  brightness: 0,
  brushStrength: 50,
  detailPreserve: 50,
  levels: 5,
  celSmoothing: 40,
  paletteSnap: false,
  bleed: 40,
  granulation: 30,
  washStrength: 50,
  lineStrength: 60,
  lineThreshold: 30,
  hatching: false,
  outlineEnabled: false,
  outlineColor: '#000000',
  outlineThickness: 1,
  bakeAO: false,
  bakeShading: false,
  bakeStrength: 60,
  regenerateNormal: false,
  normalStrength: 50,
  regenerateHeight: false,
  flattenRoughness: false,
  flattenMetallic: false,
};

// --- Canvas helpers -------------------------------------------------------

function makeCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(width, height);
}

export function toImageData(bitmap: ImageBitmap): ImageData {
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

export async function fromImageData(imageData: ImageData): Promise<ImageBitmap> {
  const canvas = makeCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.transferToImageBitmap();
}

// contrast/saturation/brightness in-place on RGBA Uint8ClampedArray
export function applyToneAdjust(
  data: Uint8ClampedArray,
  contrast: number,
  saturation: number,
  brightness: number,
): void {
  const c = 1 + contrast / 100;      // 0..2
  const s = 1 + saturation / 100;    // 0..2
  const b = (brightness / 100) * 255; // -255..255
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], bl = data[i + 2];
    // brightness
    r += b; g += b; bl += b;
    // contrast around 128
    r = (r - 128) * c + 128;
    g = (g - 128) * c + 128;
    bl = (bl - 128) * c + 128;
    // saturation toward luma
    const luma = 0.299 * r + 0.587 * g + 0.114 * bl;
    r = luma + (r - luma) * s;
    g = luma + (g - luma) * s;
    bl = luma + (bl - luma) * s;
    data[i] = r; data[i + 1] = g; data[i + 2] = bl;
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: PASS (no type errors). The module is unused so far, which is fine.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stylizer.ts
git commit -m "feat(stylizer): add engine options contract and canvas/tone helpers"
```

---

## Task 2: Stylizer engine — shared pre-stage (Kuwahara smooth) + `stylize()` dispatcher with cel style

**Files:**
- Modify: `src/lib/stylizer.ts`

**Interfaces:**
- Consumes: `toImageData`, `fromImageData`, `applyToneAdjust`, `StylizerOptions` (Task 1).
- Produces: `stylize(albedo: ImageBitmap, opts: StylizerOptions): Promise<ImageBitmap>` — the main entry the page/panels call. In this task it implements the shared pre-stage + the `cel` branch; other branches fall through to a passthrough until Tasks 3–4 fill them in.

- [ ] **Step 1: Add the Kuwahara smoothing pass and `stylize` with the cel branch**

Append to `src/lib/stylizer.ts`:

```ts
// --- Shared pre-stage: Kuwahara (generalized mean) edge-preserving smooth ---

function kuwahara(src: ImageData, radius: number): ImageData {
  if (radius <= 0) return src;
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  const od = out.data;
  const r = Math.min(8, Math.floor(radius));
  // Four overlapping quadrant windows; pick the one with lowest luma variance.
  const quads = [
    [-r, 0, -r, 0], [0, r, -r, 0], [-r, 0, 0, r], [0, r, 0, r],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let bestVar = Infinity, bR = 0, bG = 0, bB = 0;
      for (const [x0, x1, y0, y1] of quads) {
        let sum = 0, sumSq = 0, sr = 0, sg = 0, sb = 0, n = 0;
        for (let dy = y0; dy <= y1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = x0; dx <= x1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const idx = (yy * w + xx) * 4;
            const rr = data[idx], gg = data[idx + 1], bb = data[idx + 2];
            const luma = 0.299 * rr + 0.587 * gg + 0.114 * bb;
            sum += luma; sumSq += luma * luma;
            sr += rr; sg += gg; sb += bb; n++;
          }
        }
        if (n === 0) continue;
        const variance = sumSq / n - (sum / n) * (sum / n);
        if (variance < bestVar) {
          bestVar = variance; bR = sr / n; bG = sg / n; bB = sb / n;
        }
      }
      const o = (y * w + x) * 4;
      od[o] = bR; od[o + 1] = bG; od[o + 2] = bB;
      od[o + 3] = data[o + 3];
    }
  }
  return out;
}

function posterize(data: Uint8ClampedArray, levels: number): void {
  const step = 255 / Math.max(1, levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(Math.round(data[i] / step) * step);
    data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
    data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
  }
}

export async function stylize(
  albedo: ImageBitmap,
  opts: StylizerOptions,
): Promise<ImageBitmap> {
  // Pre-stage
  let img = toImageData(albedo);
  if (opts.smoothRadius > 0) img = kuwahara(img, opts.smoothRadius);
  applyToneAdjust(img.data, opts.contrast, opts.saturation, opts.brightness);

  // Style stage
  switch (opts.style) {
    case 'cel':
      if (opts.celSmoothing > 0) {
        img = kuwahara(img, Math.round((opts.celSmoothing / 100) * 4));
      }
      posterize(img.data, opts.levels);
      break;
    // painterly / watercolor / sketch added in later tasks
    default:
      break;
  }

  return fromImageData(img);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stylizer.ts
git commit -m "feat(stylizer): add Kuwahara pre-stage and cel posterize style"
```

---

## Task 3: Stylizer engine — painterly and watercolor styles

**Files:**
- Modify: `src/lib/stylizer.ts`

**Interfaces:**
- Consumes: `kuwahara`, `posterize`, `toImageData`, `applyToneAdjust` (Tasks 1–2).
- Produces: extends `stylize()` switch with `painterly` and `watercolor` branches. Adds internal helpers `boxBlur(img, radius)` and `desaturate(data, amount)`.

- [ ] **Step 1: Add blur/desaturate helpers and the two style branches**

Add these helpers above `stylize` in `src/lib/stylizer.ts`:

```ts
function boxBlur(src: ImageData, radius: number): ImageData {
  if (radius <= 0) return src;
  const { width: w, height: h, data } = src;
  const tmp = new ImageData(w, h);
  const td = tmp.data;
  const r = Math.floor(radius);
  // horizontal then vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= w) continue;
        const idx = (y * w + xx) * 4;
        sr += data[idx]; sg += data[idx + 1]; sb += data[idx + 2]; sa += data[idx + 3]; n++;
      }
      const o = (y * w + x) * 4;
      td[o] = sr / n; td[o + 1] = sg / n; td[o + 2] = sb / n; td[o + 3] = sa / n;
    }
  }
  const out = new ImageData(w, h);
  const od = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        const idx = (yy * w + x) * 4;
        sr += td[idx]; sg += td[idx + 1]; sb += td[idx + 2]; sa += td[idx + 3]; n++;
      }
      const o = (y * w + x) * 4;
      od[o] = sr / n; od[o + 1] = sg / n; od[o + 2] = sb / n; od[o + 3] = sa / n;
    }
  }
  return out;
}

function desaturate(data: Uint8ClampedArray, amount: number): void {
  const a = amount / 100;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i] + (luma - data[i]) * a;
    data[i + 1] = data[i + 1] + (luma - data[i + 1]) * a;
    data[i + 2] = data[i + 2] + (luma - data[i + 2]) * a;
  }
}
```

Then add these two `case` branches inside the `stylize` switch, before `default`:

```ts
    case 'painterly': {
      // Stronger Kuwahara scaled by brush strength, softened by detailPreserve.
      const brushRadius = Math.max(1, Math.round((opts.brushStrength / 100) * 6));
      img = kuwahara(img, brushRadius);
      if (opts.detailPreserve < 50) {
        img = boxBlur(img, 1);
      }
      break;
    }
    case 'watercolor': {
      const blurR = Math.max(1, Math.round((opts.bleed / 100) * 4));
      img = boxBlur(img, blurR);
      desaturate(img.data, opts.granulation * 0.4);
      posterize(img.data, 12); // gentle banding for pigment pooling
      // wash: lift toward white by washStrength
      const lift = (opts.washStrength / 100) * 40;
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] += lift; img.data[i + 1] += lift; img.data[i + 2] += lift;
      }
      break;
    }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stylizer.ts
git commit -m "feat(stylizer): add painterly and watercolor styles"
```

---

## Task 4: Stylizer engine — sketch style, outline post-stage, and map helpers

**Files:**
- Modify: `src/lib/stylizer.ts`

**Interfaces:**
- Consumes: `toImageData`, `fromImageData`, `boxBlur` (Tasks 1–3).
- Produces:
  - extends `stylize()` with the `sketch` branch and a shared outline post-stage;
  - `bakeLighting(stylizedAlbedo, ao, height, opts): Promise<ImageBitmap>`;
  - `regenerateNormal(albedo, strength): Promise<ImageBitmap>`;
  - `regenerateHeight(albedo): Promise<ImageBitmap>`;
  - `flattenMap(map, levels): Promise<ImageBitmap>`.

- [ ] **Step 1: Add a Sobel helper, the sketch branch, outline post-stage, and the exported map functions**

Add a Sobel luminance-edge helper above `stylize`:

```ts
// Returns a Float32Array of edge magnitude (0..~1) per pixel.
function sobelEdges(src: ImageData): Float32Array {
  const { width: w, height: h, data } = src;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  }
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] +
        lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy =
        -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] +
        lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      edges[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
```

Add the `sketch` case inside the `stylize` switch (before `default`):

```ts
    case 'sketch': {
      const edges = sobelEdges(img);
      const thr = opts.lineThreshold / 100;
      const strength = opts.lineStrength / 100;
      const { width: w, height: h } = img;
      // Start from a lightly posterized tone, then draw dark lines over it.
      posterize(img.data, 4);
      desaturate(img.data, 100);
      for (let i = 0; i < w * h; i++) {
        const e = edges[i];
        if (e > thr) {
          const ink = Math.min(1, (e - thr) * strength * 4);
          const o = i * 4;
          img.data[o] *= (1 - ink);
          img.data[o + 1] *= (1 - ink);
          img.data[o + 2] *= (1 - ink);
        }
      }
      break;
    }
```

Add the outline post-stage right after the switch, before `return fromImageData(img)`:

```ts
  // Shared outline/ink post-stage
  if (opts.outlineEnabled) {
    const edges = sobelEdges(img);
    const [or, og, ob] = hexToRgb(opts.outlineColor);
    const t = opts.outlineThickness; // 1..4 → threshold scaling
    const thr = 0.5 / t;
    for (let i = 0; i < edges.length; i++) {
      if (edges[i] > thr) {
        const o = i * 4;
        img.data[o] = or; img.data[o + 1] = og; img.data[o + 2] = ob;
      }
    }
  }
```

Add the exported map functions at the end of the file:

```ts
// --- Lighting bake --------------------------------------------------------

export async function bakeLighting(
  stylizedAlbedo: ImageBitmap,
  ao: ImageBitmap | undefined,
  height: ImageBitmap | undefined,
  opts: StylizerOptions,
): Promise<ImageBitmap> {
  const img = toImageData(stylizedAlbedo);
  const strength = opts.bakeStrength / 100;

  if (opts.bakeAO && ao) {
    const aoData = toImageData(ao).data;
    for (let i = 0; i < img.data.length; i += 4) {
      const occ = aoData[i] / 255; // AO stored in R (grayscale)
      const factor = 1 - (1 - occ) * strength;
      img.data[i] *= factor;
      img.data[i + 1] *= factor;
      img.data[i + 2] *= factor;
    }
  }

  if (opts.bakeShading && height) {
    // Soft top-down light: brighten where height slope faces up.
    const hd = toImageData(height);
    const { width: w, height: h } = hd;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const up = hd.data[((y - 1) * w + x) * 4];
        const down = hd.data[((y + 1) * w + x) * 4];
        const slope = (up - down) / 255; // -1..1
        const light = 1 + slope * strength * 0.5;
        const o = i * 4;
        img.data[o] *= light;
        img.data[o + 1] *= light;
        img.data[o + 2] *= light;
      }
    }
  }

  return fromImageData(img);
}

// --- Map regeneration -----------------------------------------------------

export async function regenerateNormal(
  albedo: ImageBitmap,
  strength: number,
): Promise<ImageBitmap> {
  const src = toImageData(albedo);
  const { width: w, height: h } = src;
  const edges = sobelEdges(src); // reuse luma gradient magnitude is not enough; recompute directional
  // Directional gradients for normal:
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (0.299 * src.data[i * 4] + 0.587 * src.data[i * 4 + 1] + 0.114 * src.data[i * 4 + 2]) / 255;
  }
  const out = new ImageData(w, h);
  const s = (strength / 100) * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xl = lum[y * w + Math.max(0, x - 1)];
      const xr = lum[y * w + Math.min(w - 1, x + 1)];
      const yu = lum[Math.max(0, y - 1) * w + x];
      const yd = lum[Math.min(h - 1, y + 1) * w + x];
      const dx = (xl - xr) * s;
      const dy = (yu - yd) * s;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const o = i * 4;
      out.data[o] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  void edges;
  return fromImageData(out);
}

export async function regenerateHeight(albedo: ImageBitmap): Promise<ImageBitmap> {
  let img = toImageData(albedo);
  img = boxBlur(img, 1);
  const out = new ImageData(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const luma = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    out.data[i] = luma; out.data[i + 1] = luma; out.data[i + 2] = luma; out.data[i + 3] = 255;
  }
  return fromImageData(out);
}

export async function flattenMap(map: ImageBitmap, levels: number): Promise<ImageBitmap> {
  const img = toImageData(map);
  posterize(img.data, levels);
  return fromImageData(img);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stylizer.ts
git commit -m "feat(stylizer): add sketch style, outline pass, lighting bake and map regen"
```

---

## Task 5: Project DB — add `stylizer` type and options metadata

**Files:**
- Modify: `src/lib/projectDatabase.ts`

**Interfaces:**
- Consumes: `StylizerOptions` type from `src/lib/stylizer.ts` (Task 1).
- Produces: `'stylizer'` accepted as a project `type`; `ProjectMetadata.stylizerOptions?: StylizerOptions` and `ProjectMetadata.stylizerMapSlots?: string[]` fields for the page (Task 11) to store/read.

- [ ] **Step 1: Add the type union member and metadata fields**

In `src/lib/projectDatabase.ts`, add the import near the top (after existing imports):

```ts
import type { StylizerOptions } from '@/lib/stylizer';
```

Change BOTH occurrences of the type union (lines ~89 and ~99, `DbProject` and any `saveProject` signature) from:

```ts
  type: 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet';
```
to:
```ts
  type: 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet' | 'stylizer';
```

In the `ProjectMetadata` interface, add these optional fields (alongside `trimsheetOptions`):

```ts
  stylizerOptions?: StylizerOptions;
  stylizerMapSlots?: string[]; // ordered MapSlot names matching the saved frame blobs
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/projectDatabase.ts
git commit -m "feat(stylizer): register stylizer project type and options metadata"
```

---

## Task 6: StylizerContext — value shape and provider

**Files:**
- Create: `src/contexts/StylizerContext.tsx`

**Interfaces:**
- Consumes: `StylizerOptions` (Task 1).
- Produces: `MapSlot` type, `StylizerMaterial` interface, `StylizerContextValue` interface, `StylizerProvider`, `useStylizerContext()`. All panels (Tasks 7–10) and the dock (Task 9) consume `useStylizerContext()`.

- [ ] **Step 1: Create the context**

Create `src/contexts/StylizerContext.tsx`:

```tsx
'use client';

/**
 * StylizerContext - Shared state for the Material Stylizer tool's dock panels.
 * Holds the loaded PBR map set, stylizer options, and derived (cached) results.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { StylizerOptions } from '@/lib/stylizer';

export type MapSlot = 'albedo' | 'normal' | 'roughness' | 'metallic' | 'ao' | 'height';

export const MAP_SLOTS: MapSlot[] = ['albedo', 'normal', 'roughness', 'metallic', 'ao', 'height'];

export interface StylizerMaterial {
  maps: Partial<Record<MapSlot, ImageBitmap>>;
  resolution: { width: number; height: number } | null;
}

export interface StylizerDerived {
  stylizedAlbedo: ImageBitmap | null;
  normal: ImageBitmap | null;   // regenerated (or null if disabled)
  height: ImageBitmap | null;   // regenerated (or null if disabled)
  roughness: ImageBitmap | null; // flattened (or null if disabled)
  metallic: ImageBitmap | null;  // flattened (or null if disabled)
}

export interface StylizerContextValue {
  // Source material
  material: StylizerMaterial;
  loadMap: (slot: MapSlot, file: File) => Promise<void>;
  clearMap: (slot: MapSlot) => void;
  resetMaterial: () => void;
  hasAlbedo: boolean;

  // Options
  options: StylizerOptions;
  setOptions: (updater: (prev: StylizerOptions) => StylizerOptions) => void;

  // Derived results (recomputed by the page effect)
  derived: StylizerDerived;
  isProcessing: boolean;

  // Preview UI state
  wipePosition: number;            // 0..100
  setWipePosition: (v: number) => void;
  tiled: boolean;
  setTiled: (v: boolean) => void;

  // Panel visibility / layout
  visiblePanels: Set<string>;
  togglePanel: (panelId: string) => void;
  resetLayout: () => void;

  // Project
  projectId: string;
  projectName: string;
  setProjectName: (name: string) => void;
  triggerSave: (customName?: string) => void;
  isSaving: boolean;
  autosaveNotification: string | null;
}

const StylizerContext = createContext<StylizerContextValue | null>(null);

export function useStylizerContext(): StylizerContextValue {
  const ctx = useContext(StylizerContext);
  if (!ctx) throw new Error('useStylizerContext must be used within StylizerProvider');
  return ctx;
}

interface StylizerProviderProps {
  value: StylizerContextValue;
  children: ReactNode;
}

export function StylizerProvider({ value, children }: StylizerProviderProps) {
  return <StylizerContext.Provider value={value}>{children}</StylizerContext.Provider>;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/StylizerContext.tsx
git commit -m "feat(stylizer): add StylizerContext value shape and provider"
```

---

## Task 7: Material Loader panel

**Files:**
- Create: `src/components/StylizerMaterialLoaderPanel.tsx`
- Create: `src/components/StylizerMaterialLoaderPanel.module.css`

**Interfaces:**
- Consumes: `useStylizerContext()`, `MAP_SLOTS`, `MapSlot` (Task 6).
- Produces: `StylizerMaterialLoaderPanel` component (default-registered under id `material-loader` in Task 9). Exports a helper `detectSlot(filename): MapSlot | null` used by the drop handler.

- [ ] **Step 1: Create the panel**

Create `src/components/StylizerMaterialLoaderPanel.tsx`:

```tsx
'use client';

import React, { useCallback, useRef } from 'react';
import { useStylizerContext, MAP_SLOTS, MapSlot } from '@/contexts/StylizerContext';
import styles from './StylizerMaterialLoaderPanel.module.css';

const SLOT_LABELS: Record<MapSlot, string> = {
  albedo: 'Albedo / Base Color',
  normal: 'Normal',
  roughness: 'Roughness',
  metallic: 'Metallic',
  ao: 'Ambient Occlusion',
  height: 'Height / Displacement',
};

const SLOT_PATTERNS: Record<MapSlot, RegExp> = {
  albedo: /(albedo|basecolor|base_color|diffuse|_col|_color)/i,
  normal: /(normal|_nrm|_nor|_norm)/i,
  roughness: /(rough|_rgh)/i,
  metallic: /(metal|metallic|_met)/i,
  ao: /(ao|occlusion|_occ)/i,
  height: /(height|displace|_disp|_hgt|bump)/i,
};

export function detectSlot(filename: string): MapSlot | null {
  for (const slot of MAP_SLOTS) {
    if (SLOT_PATTERNS[slot].test(filename)) return slot;
  }
  return null;
}

export function StylizerMaterialLoaderPanel() {
  const ctx = useStylizerContext();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const onFile = useCallback((slot: MapSlot, file: File | undefined) => {
    if (file) ctx.loadMap(slot, file);
  }, [ctx]);

  const onDrop = useCallback((slot: MapSlot, e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const detected = detectSlot(file.name) ?? slot;
    ctx.loadMap(detected, file);
  }, [ctx]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Material Maps</span>
        <button className={styles.resetBtn} onClick={ctx.resetMaterial}>Reset</button>
      </div>
      <div className={styles.slots}>
        {MAP_SLOTS.map((slot) => {
          const loaded = !!ctx.material.maps[slot];
          return (
            <div
              key={slot}
              className={`${styles.slot} ${loaded ? styles.slotLoaded : ''} ${slot === 'albedo' ? styles.slotRequired : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(slot, e)}
              onClick={() => inputRefs.current[slot]?.click()}
            >
              <div className={styles.slotLabel}>
                {SLOT_LABELS[slot]}{slot === 'albedo' ? ' *' : ''}
              </div>
              <div className={styles.slotState}>{loaded ? 'Loaded' : 'Drop / click'}</div>
              {loaded && (
                <button
                  className={styles.clearBtn}
                  onClick={(e) => { e.stopPropagation(); ctx.clearMap(slot); }}
                >×</button>
              )}
              <input
                ref={(el) => { inputRefs.current[slot] = el; }}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={(e) => onFile(slot, e.target.files?.[0])}
              />
            </div>
          );
        })}
      </div>
      <p className={styles.hint}>Albedo is required. Filenames auto-detect their slot.</p>
    </div>
  );
}
```

Create `src/components/StylizerMaterialLoaderPanel.module.css` using design tokens (match the look of existing panel CSS — inspect `PixelationPanel.module.css` for token names):

```css
.panel { display: flex; flex-direction: column; height: 100%; padding: 12px; gap: 10px; color: var(--foreground); }
.header { display: flex; align-items: center; justify-content: space-between; font-weight: 600; font-size: 13px; }
.resetBtn { background: var(--secondary); color: var(--secondary-foreground); border: 1px solid var(--border); border-radius: 6px; padding: 3px 10px; cursor: pointer; font-size: 12px; }
.slots { display: flex; flex-direction: column; gap: 8px; }
.slot { position: relative; border: 1px dashed var(--border); border-radius: 8px; padding: 10px 12px; cursor: pointer; background: var(--card); transition: border-color .15s, background .15s; }
.slot:hover { border-color: var(--primary); }
.slotLoaded { border-style: solid; border-color: var(--primary); }
.slotRequired .slotLabel { color: var(--primary); }
.slotLabel { font-size: 12px; font-weight: 600; }
.slotState { font-size: 11px; opacity: .7; margin-top: 2px; }
.clearBtn { position: absolute; top: 6px; right: 8px; background: transparent; border: none; color: var(--foreground); font-size: 16px; cursor: pointer; line-height: 1; }
.hiddenInput { display: none; }
.hint { font-size: 11px; opacity: .6; margin: 0; }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS (component is not yet wired into a route; that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/components/StylizerMaterialLoaderPanel.tsx src/components/StylizerMaterialLoaderPanel.module.css
git commit -m "feat(stylizer): add material loader panel with filename slot detection"
```

---

## Task 8: Style panel + Map Output panel

**Files:**
- Create: `src/components/StylizerStylePanel.tsx` (+ `.module.css`)
- Create: `src/components/StylizerMapOutputPanel.tsx` (+ `.module.css`)

**Interfaces:**
- Consumes: `useStylizerContext()`, `StylizerStyle`, `StylizerOptions` (Tasks 1, 6).
- Produces: `StylizerStylePanel` (id `style`) and `StylizerMapOutputPanel` (id `map-output`) components for Task 9.

- [ ] **Step 1: Create the style panel**

Create `src/components/StylizerStylePanel.tsx`:

```tsx
'use client';

import React from 'react';
import { useStylizerContext } from '@/contexts/StylizerContext';
import { StylizerStyle } from '@/lib/stylizer';
import styles from './StylizerStylePanel.module.css';

const STYLE_OPTIONS: { value: StylizerStyle; label: string }[] = [
  { value: 'painterly', label: 'Painterly' },
  { value: 'cel', label: 'Cel / Toon' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'sketch', label: 'Sketch' },
];

function Slider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <label className={styles.slider}>
      <span>{label}<em>{value}</em></span>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function StylizerStylePanel() {
  const { options, setOptions } = useStylizerContext();
  const set = <K extends keyof typeof options>(k: K, v: (typeof options)[K]) =>
    setOptions((p) => ({ ...p, [k]: v }));

  return (
    <div className={styles.panel}>
      <div className={styles.styleRow}>
        {STYLE_OPTIONS.map((s) => (
          <button key={s.value}
            className={`${styles.styleBtn} ${options.style === s.value ? styles.styleActive : ''}`}
            onClick={() => set('style', s.value)}>{s.label}</button>
        ))}
      </div>

      <div className={styles.section}>
        <h4>Base</h4>
        <Slider label="Brush / Smooth" value={options.smoothRadius} min={0} max={8} onChange={(v) => set('smoothRadius', v)} />
        <Slider label="Contrast" value={options.contrast} min={-100} max={100} onChange={(v) => set('contrast', v)} />
        <Slider label="Saturation" value={options.saturation} min={-100} max={100} onChange={(v) => set('saturation', v)} />
        <Slider label="Brightness" value={options.brightness} min={-100} max={100} onChange={(v) => set('brightness', v)} />
      </div>

      {options.style === 'painterly' && (
        <div className={styles.section}>
          <h4>Painterly</h4>
          <Slider label="Brush Strength" value={options.brushStrength} min={0} max={100} onChange={(v) => set('brushStrength', v)} />
          <Slider label="Detail Preserve" value={options.detailPreserve} min={0} max={100} onChange={(v) => set('detailPreserve', v)} />
        </div>
      )}
      {options.style === 'cel' && (
        <div className={styles.section}>
          <h4>Cel</h4>
          <Slider label="Levels" value={options.levels} min={2} max={16} onChange={(v) => set('levels', v)} />
          <Slider label="Smoothing" value={options.celSmoothing} min={0} max={100} onChange={(v) => set('celSmoothing', v)} />
        </div>
      )}
      {options.style === 'watercolor' && (
        <div className={styles.section}>
          <h4>Watercolor</h4>
          <Slider label="Bleed" value={options.bleed} min={0} max={100} onChange={(v) => set('bleed', v)} />
          <Slider label="Granulation" value={options.granulation} min={0} max={100} onChange={(v) => set('granulation', v)} />
          <Slider label="Wash" value={options.washStrength} min={0} max={100} onChange={(v) => set('washStrength', v)} />
        </div>
      )}
      {options.style === 'sketch' && (
        <div className={styles.section}>
          <h4>Sketch</h4>
          <Slider label="Line Strength" value={options.lineStrength} min={0} max={100} onChange={(v) => set('lineStrength', v)} />
          <Slider label="Threshold" value={options.lineThreshold} min={0} max={100} onChange={(v) => set('lineThreshold', v)} />
        </div>
      )}

      <div className={styles.section}>
        <h4>Outline</h4>
        <label className={styles.check}>
          <input type="checkbox" checked={options.outlineEnabled} onChange={(e) => set('outlineEnabled', e.target.checked)} />
          Enable ink outline
        </label>
        {options.outlineEnabled && (
          <>
            <label className={styles.colorRow}>Color
              <input type="color" value={options.outlineColor} onChange={(e) => set('outlineColor', e.target.value)} />
            </label>
            <Slider label="Thickness" value={options.outlineThickness} min={1} max={4} onChange={(v) => set('outlineThickness', v)} />
          </>
        )}
      </div>
    </div>
  );
}
```

Create `src/components/StylizerStylePanel.module.css`:

```css
.panel { display: flex; flex-direction: column; gap: 14px; padding: 12px; height: 100%; overflow-y: auto; color: var(--foreground); }
.styleRow { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.styleBtn { padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--foreground); cursor: pointer; font-size: 12px; }
.styleActive { border-color: var(--primary); background: var(--primary); color: var(--primary-foreground); }
.section { display: flex; flex-direction: column; gap: 8px; }
.section h4 { margin: 0; font-size: 12px; text-transform: uppercase; opacity: .7; letter-spacing: .04em; }
.slider { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.slider span { display: flex; justify-content: space-between; }
.slider em { opacity: .6; font-style: normal; }
.slider input { width: 100%; accent-color: var(--primary); }
.check { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.colorRow { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
```

- [ ] **Step 2: Create the map output panel**

Create `src/components/StylizerMapOutputPanel.tsx`:

```tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { useStylizerContext, MapSlot } from '@/contexts/StylizerContext';
import styles from './StylizerMapOutputPanel.module.css';

function Thumb({ bitmap, label }: { bitmap: ImageBitmap | null; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    }
  }, [bitmap]);
  return (
    <div className={styles.thumb}>
      <canvas ref={canvasRef} width={72} height={72} className={styles.thumbCanvas} />
      <span>{label}</span>
    </div>
  );
}

export function StylizerMapOutputPanel() {
  const { options, setOptions, derived } = useStylizerContext();
  const set = <K extends keyof typeof options>(k: K, v: (typeof options)[K]) =>
    setOptions((p) => ({ ...p, [k]: v }));

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <h4>Bake into Albedo</h4>
        <label className={styles.check}>
          <input type="checkbox" checked={options.bakeAO} onChange={(e) => set('bakeAO', e.target.checked)} />
          Bake AO
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={options.bakeShading} onChange={(e) => set('bakeShading', e.target.checked)} />
          Bake soft shading (from height)
        </label>
        <label className={styles.slider}>
          <span>Bake Strength<em>{options.bakeStrength}</em></span>
          <input type="range" min={0} max={100} value={options.bakeStrength}
            onChange={(e) => set('bakeStrength', Number(e.target.value))} />
        </label>
      </div>

      <div className={styles.section}>
        <h4>Regenerate Maps</h4>
        <label className={styles.check}>
          <input type="checkbox" checked={options.regenerateNormal} onChange={(e) => set('regenerateNormal', e.target.checked)} />
          Regenerate Normal
        </label>
        {options.regenerateNormal && (
          <label className={styles.slider}>
            <span>Normal Strength<em>{options.normalStrength}</em></span>
            <input type="range" min={0} max={100} value={options.normalStrength}
              onChange={(e) => set('normalStrength', Number(e.target.value))} />
          </label>
        )}
        <label className={styles.check}>
          <input type="checkbox" checked={options.regenerateHeight} onChange={(e) => set('regenerateHeight', e.target.checked)} />
          Regenerate Height
        </label>
      </div>

      <div className={styles.section}>
        <h4>Flatten (pass-through maps)</h4>
        <label className={styles.check}>
          <input type="checkbox" checked={options.flattenRoughness} onChange={(e) => set('flattenRoughness', e.target.checked)} />
          Flatten Roughness
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={options.flattenMetallic} onChange={(e) => set('flattenMetallic', e.target.checked)} />
          Flatten Metallic
        </label>
      </div>

      <div className={styles.section}>
        <h4>Output Preview</h4>
        <div className={styles.thumbs}>
          <Thumb bitmap={derived.stylizedAlbedo} label="Albedo" />
          <Thumb bitmap={derived.normal} label="Normal" />
          <Thumb bitmap={derived.height} label="Height" />
        </div>
      </div>
    </div>
  );
}
```

Create `src/components/StylizerMapOutputPanel.module.css`:

```css
.panel { display: flex; flex-direction: column; gap: 14px; padding: 12px; height: 100%; overflow-y: auto; color: var(--foreground); }
.section { display: flex; flex-direction: column; gap: 8px; }
.section h4 { margin: 0; font-size: 12px; text-transform: uppercase; opacity: .7; letter-spacing: .04em; }
.check { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.slider { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.slider span { display: flex; justify-content: space-between; }
.slider em { opacity: .6; font-style: normal; }
.slider input { width: 100%; accent-color: var(--primary); }
.thumbs { display: flex; gap: 10px; }
.thumb { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; opacity: .85; }
.thumbCanvas { border: 1px solid var(--border); border-radius: 6px; background: var(--muted); image-rendering: auto; }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/StylizerStylePanel.tsx src/components/StylizerStylePanel.module.css src/components/StylizerMapOutputPanel.tsx src/components/StylizerMapOutputPanel.module.css
git commit -m "feat(stylizer): add style controls and map-output panels"
```

---

## Task 9: Preview panels (2D + 3D) and Export panel

**Files:**
- Create: `src/components/StylizerPreviewPanel.tsx` (+ `.module.css`)
- Create: `src/components/StylizerPreview3DPanel.tsx` (+ `.module.css`)
- Create: `src/components/StylizerExportPanel.tsx` (+ `.module.css`)

**Interfaces:**
- Consumes: `useStylizerContext()`, `ThreePainter` from `@/lib/threePainter`, `jszip`.
- Produces: `StylizerPreviewPanel` (id `preview-2d`), `StylizerPreview3DPanel` (id `preview-3d`), `StylizerExportPanel` (id `export`) for Task 10.

- [ ] **Step 1: Create the 2D preview panel (wipe + tile)**

Create `src/components/StylizerPreviewPanel.tsx`:

```tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { useStylizerContext } from '@/contexts/StylizerContext';
import styles from './StylizerPreviewPanel.module.css';

export function StylizerPreviewPanel() {
  const { material, derived, wipePosition, setWipePosition, tiled, setTiled, isProcessing } = useStylizerContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const before = material.maps.albedo ?? null;
    const after = derived.stylizedAlbedo ?? before;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!before) return;

    const draw = (bmp: ImageBitmap, sx: number, sw: number) => {
      if (tiled) {
        const tw = canvas.width / 2, th = canvas.height / 2;
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
          ctx.drawImage(bmp, tx * tw, ty * th, tw, th);
        }
      } else {
        ctx.drawImage(bmp, sx, 0, sw, bmp.height, sx, 0, sw * (canvas.width / bmp.width), canvas.height);
      }
    };

    if (tiled) {
      draw(after!, 0, after!.width);
      return;
    }
    // before on left, after on right of wipe line
    const wipeX = (wipePosition / 100) * canvas.width;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, wipeX, canvas.height); ctx.clip();
    ctx.drawImage(before, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(wipeX, 0, canvas.width - wipeX, canvas.height); ctx.clip();
    if (after) ctx.drawImage(after, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    // wipe line
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wipeX, 0); ctx.lineTo(wipeX, canvas.height); ctx.stroke();
  }, [material.maps.albedo, derived.stylizedAlbedo, wipePosition, tiled]);

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <label className={styles.check}>
          <input type="checkbox" checked={tiled} onChange={(e) => setTiled(e.target.checked)} />
          Tile 2×2
        </label>
        {!tiled && (
          <input className={styles.wipe} type="range" min={0} max={100} value={wipePosition}
            onChange={(e) => setWipePosition(Number(e.target.value))} />
        )}
        {isProcessing && <span className={styles.processing}>Processing…</span>}
      </div>
      <div className={styles.canvasWrap}>
        {material.maps.albedo
          ? <canvas ref={canvasRef} width={512} height={512} className={styles.canvas} />
          : <div className={styles.placeholder}>Load an albedo map to preview.</div>}
      </div>
    </div>
  );
}
```

Create `src/components/StylizerPreviewPanel.module.css`:

```css
.panel { display: flex; flex-direction: column; height: 100%; color: var(--foreground); }
.toolbar { display: flex; align-items: center; gap: 14px; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
.check { display: flex; align-items: center; gap: 6px; }
.wipe { flex: 1; accent-color: var(--primary); }
.processing { opacity: .7; }
.canvasWrap { flex: 1; display: flex; align-items: center; justify-content: center; padding: 12px; overflow: hidden; }
.canvas { max-width: 100%; max-height: 100%; border: 1px solid var(--border); border-radius: 8px; background: var(--muted); }
.placeholder { opacity: .6; font-size: 13px; }
```

- [ ] **Step 2: Create the 3D preview panel**

First inspect the `ThreePainter` public API to call it correctly:

Run: `grep -nE "^  (async )?(public )?[a-zA-Z]+\(|constructor|loadModel|setTexture|setMaterialMap|dispose" src/lib/threePainter.ts | head -40`

Create `src/components/StylizerPreview3DPanel.tsx`. Use the ThreePainter methods discovered above; the skeleton below mounts a canvas, instantiates the painter on a primitive sphere, and pushes the derived maps. Adapt the method names (`setBaseTexture`/`setMap`/etc.) to whatever the grep reveals — do not invent names:

```tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { useStylizerContext } from '@/contexts/StylizerContext';
import styles from './StylizerPreview3DPanel.module.css';

export function StylizerPreview3DPanel() {
  const { derived, material } = useStylizerContext();
  const mountRef = useRef<HTMLDivElement>(null);
  const painterRef = useRef<any>(null);

  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    if (!mount) return;
    import('@/lib/threePainter').then(({ ThreePainter }) => {
      if (disposed) return;
      // Instantiate against the mount element per ThreePainter's constructor.
      // NOTE: adapt constructor args + primitive-load call to the real API.
      const painter = new (ThreePainter as any)(mount);
      painterRef.current = painter;
      if (typeof painter.loadPrimitive === 'function') painter.loadPrimitive('sphere');
    });
    return () => {
      disposed = true;
      const p = painterRef.current;
      if (p && typeof p.dispose === 'function') p.dispose();
      painterRef.current = null;
    };
  }, []);

  // Push derived maps to the material when they change.
  useEffect(() => {
    const p = painterRef.current;
    if (!p) return;
    const albedo = derived.stylizedAlbedo ?? material.maps.albedo;
    if (albedo && typeof p.setBaseTexture === 'function') p.setBaseTexture(albedo);
    if (derived.normal && typeof p.setNormalMap === 'function') p.setNormalMap(derived.normal);
  }, [derived.stylizedAlbedo, derived.normal, material.maps.albedo]);

  return (
    <div className={styles.panel}>
      <div ref={mountRef} className={styles.mount} />
      {!material.maps.albedo && <div className={styles.placeholder}>Load an albedo map to preview in 3D.</div>}
    </div>
  );
}
```

> **Implementer note:** If ThreePainter's real API cannot drive a standalone primitive preview without heavy setup, render a simpler fallback: a rotating textured `three` `Mesh` created directly with `three` (already a dependency). Keep the same props contract. Do not block the whole tool on 3D — it is an optional panel.

Create `src/components/StylizerPreview3DPanel.module.css`:

```css
.panel { position: relative; height: 100%; background: var(--muted); }
.mount { width: 100%; height: 100%; }
.placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: .6; font-size: 13px; }
```

- [ ] **Step 3: Create the export panel**

Create `src/components/StylizerExportPanel.tsx`:

```tsx
'use client';

import React, { useState, useCallback } from 'react';
import { useStylizerContext, MapSlot } from '@/contexts/StylizerContext';
import styles from './StylizerExportPanel.module.css';

const EXPORTABLE: { slot: MapSlot; label: string; source: 'derived' | 'material' }[] = [
  { slot: 'albedo', label: 'Albedo (stylized)', source: 'derived' },
  { slot: 'normal', label: 'Normal', source: 'derived' },
  { slot: 'height', label: 'Height', source: 'derived' },
  { slot: 'roughness', label: 'Roughness', source: 'derived' },
  { slot: 'metallic', label: 'Metallic', source: 'derived' },
  { slot: 'ao', label: 'AO (original)', source: 'material' },
];

async function bitmapToBlob(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
}

export function StylizerExportPanel() {
  const { material, derived, projectName } = useStylizerContext();
  const [selected, setSelected] = useState<Set<MapSlot>>(new Set(['albedo', 'normal', 'height']));
  const [busy, setBusy] = useState(false);

  const toggle = (slot: MapSlot) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(slot) ? next.delete(slot) : next.add(slot);
    return next;
  });

  const getBitmap = (slot: MapSlot, source: 'derived' | 'material'): ImageBitmap | null => {
    if (source === 'derived') {
      if (slot === 'albedo') return derived.stylizedAlbedo;
      if (slot === 'normal') return derived.normal ?? material.maps.normal ?? null;
      if (slot === 'height') return derived.height ?? material.maps.height ?? null;
      if (slot === 'roughness') return derived.roughness ?? material.maps.roughness ?? null;
      if (slot === 'metallic') return derived.metallic ?? material.maps.metallic ?? null;
    }
    return material.maps[slot] ?? null;
  };

  const onExport = useCallback(async () => {
    setBusy(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const base = (projectName || 'material').replace(/\s+/g, '_');
      for (const item of EXPORTABLE) {
        if (!selected.has(item.slot)) continue;
        const bmp = getBitmap(item.slot, item.source);
        if (!bmp) continue;
        const blob = await bitmapToBlob(bmp);
        zip.file(`${base}_${item.slot}.png`, blob);
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url; a.download = `${base}_stylized.zip`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }, [selected, derived, material, projectName]);

  return (
    <div className={styles.panel}>
      <h4>Export Maps</h4>
      <div className={styles.list}>
        {EXPORTABLE.map((item) => (
          <label key={item.slot} className={styles.row}>
            <input type="checkbox" checked={selected.has(item.slot)} onChange={() => toggle(item.slot)} />
            {item.label}
          </label>
        ))}
      </div>
      <button className={styles.exportBtn} disabled={busy || !derived.stylizedAlbedo} onClick={onExport}>
        {busy ? 'Exporting…' : 'Download ZIP'}
      </button>
    </div>
  );
}
```

Create `src/components/StylizerExportPanel.module.css`:

```css
.panel { display: flex; flex-direction: column; gap: 12px; padding: 12px; height: 100%; color: var(--foreground); }
.panel h4 { margin: 0; font-size: 12px; text-transform: uppercase; opacity: .7; letter-spacing: .04em; }
.list { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.exportBtn { padding: 10px; border: none; border-radius: 8px; background: var(--primary); color: var(--primary-foreground); cursor: pointer; font-weight: 600; }
.exportBtn:disabled { opacity: .5; cursor: not-allowed; }
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS. (Confirm `jszip` is a dependency: `grep '"jszip"' package.json` — the existing exporter uses it. If absent, run `npm install jszip` and commit the lockfile change with this task.)

- [ ] **Step 5: Commit**

```bash
git add src/components/StylizerPreviewPanel.tsx src/components/StylizerPreviewPanel.module.css src/components/StylizerPreview3DPanel.tsx src/components/StylizerPreview3DPanel.module.css src/components/StylizerExportPanel.tsx src/components/StylizerExportPanel.module.css
git commit -m "feat(stylizer): add 2D/3D preview and export panels"
```

---

## Task 10: Dock layout + menu bar

**Files:**
- Create: `src/components/StylizerDockLayout.tsx` (+ `.module.css`)
- Create: `src/components/StylizerMenuBar.tsx` (+ `.module.css`)

**Interfaces:**
- Consumes: all six panels (Tasks 7–9), `useStylizerContext()`.
- Produces: `StylizerDockLayout` (with `StylizerDockLayoutRef` = `{ addTab, removeTab, resetLayout }`) and `StylizerMenuBar`, both used by the page (Task 11).

- [ ] **Step 1: Create the dock layout**

Create `src/components/StylizerDockLayout.tsx` following the `PixelatorDockLayout` pattern exactly (same imports, `forwardRef`, `PANEL_INFO`, `defaultLayout`, `factory`, imperative ref, `STORAGE_KEY = 'stylizer-dock-layout'`):

```tsx
'use client';

import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Layout, Model, TabNode, Actions, DockLocation } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';

import { StylizerMaterialLoaderPanel } from '@/components/StylizerMaterialLoaderPanel';
import { StylizerStylePanel } from '@/components/StylizerStylePanel';
import { StylizerMapOutputPanel } from '@/components/StylizerMapOutputPanel';
import { StylizerPreviewPanel } from '@/components/StylizerPreviewPanel';
import { StylizerPreview3DPanel } from '@/components/StylizerPreview3DPanel';
import { StylizerExportPanel } from '@/components/StylizerExportPanel';

import styles from './StylizerDockLayout.module.css';

const STORAGE_KEY = 'stylizer-dock-layout';

const PANEL_INFO: Record<string, { name: string }> = {
  'material-loader': { name: 'Material Maps' },
  'style': { name: 'Style' },
  'map-output': { name: 'Map Output' },
  'preview-2d': { name: 'Preview' },
  'preview-3d': { name: '3D Preview' },
  'export': { name: 'Export' },
};

export interface StylizerDockLayoutRef {
  addTab: (panelId: string) => void;
  removeTab: (panelId: string) => void;
  resetLayout: () => void;
}

interface StylizerDockLayoutProps {
  onVisiblePanelsChange?: (panels: Set<string>) => void;
}

const defaultLayout = {
  global: { splitterSize: 6, splitterExtra: 4 },
  borders: [],
  layout: {
    type: 'row', weight: 100, children: [
      { type: 'tabset', weight: 24, children: [
        { type: 'tab', name: 'Material Maps', component: 'material-loader' },
        { type: 'tab', name: 'Style', component: 'style' },
      ]},
      { type: 'tabset', weight: 50, children: [
        { type: 'tab', name: 'Preview', component: 'preview-2d' },
        { type: 'tab', name: '3D Preview', component: 'preview-3d' },
      ]},
      { type: 'tabset', weight: 26, children: [
        { type: 'tab', name: 'Map Output', component: 'map-output' },
        { type: 'tab', name: 'Export', component: 'export' },
      ]},
    ],
  },
};

export const StylizerDockLayout = forwardRef<StylizerDockLayoutRef, StylizerDockLayoutProps>(
  function StylizerDockLayout({ onVisiblePanelsChange }, ref) {
    const layoutRef = useRef<Layout>(null);
    const [model, setModel] = useState<Model | null>(null);

    useEffect(() => {
      let layoutJson = defaultLayout;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) layoutJson = JSON.parse(saved);
      } catch { /* fallback */ }
      setModel(Model.fromJson(layoutJson));
    }, []);

    const handleModelChange = useCallback((newModel: Model) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newModel.toJson()));
        if (onVisiblePanelsChange) {
          const visible = new Set<string>();
          newModel.visitNodes((node) => {
            if (node.getType() === 'tab') {
              const c = (node as TabNode).getComponent();
              if (c) visible.add(c);
            }
          });
          onVisiblePanelsChange(visible);
        }
      } catch { /* ignore */ }
    }, [onVisiblePanelsChange]);

    const factory = useCallback((node: TabNode) => {
      const component = node.getComponent();
      switch (component) {
        case 'material-loader': return <div className={styles.panelContent}><StylizerMaterialLoaderPanel /></div>;
        case 'style': return <div className={styles.panelContent}><StylizerStylePanel /></div>;
        case 'map-output': return <div className={styles.panelContent}><StylizerMapOutputPanel /></div>;
        case 'preview-2d': return <div className={styles.panelContent}><StylizerPreviewPanel /></div>;
        case 'preview-3d': return <div className={styles.panelContent}><StylizerPreview3DPanel /></div>;
        case 'export': return <div className={styles.panelContent}><StylizerExportPanel /></div>;
        default: return <div className={styles.placeholder}>Unknown Panel: {component}</div>;
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
          if (node.getType() === 'tab') {
            const c = (node as TabNode).getComponent();
            if (c === panelId) model.doAction(Actions.deleteTab(node.getId()));
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
  }
);
```

Create `src/components/StylizerDockLayout.module.css` (copy from `PixelatorDockLayout.module.css`):

Run: `cp src/components/PixelatorDockLayout.module.css src/components/StylizerDockLayout.module.css`

- [ ] **Step 2: Create the menu bar**

Inspect the existing menubar to match structure/props:

Run: `sed -n '1,60p' src/components/PixelatorMenuBar.tsx`

Create `src/components/StylizerMenuBar.tsx` modeled on it, with:
- **File**: New (`ctx.resetMaterial`), Save (`ctx.triggerSave`), Export (focus export — can simply `ctx.togglePanel('export')`).
- **View**: a checkbox item per `PANEL_INFO` id calling `ctx.togglePanel(id)`, plus Reset Layout (`ctx.resetLayout`).
- **Help**: link to the launcher changelog (open `/` — or a no-op button labeled "Changelog"; keep minimal).

```tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { useStylizerContext } from '@/contexts/StylizerContext';
import styles from './StylizerMenuBar.module.css';

const VIEW_PANELS: { id: string; label: string }[] = [
  { id: 'material-loader', label: 'Material Maps' },
  { id: 'style', label: 'Style' },
  { id: 'map-output', label: 'Map Output' },
  { id: 'preview-2d', label: 'Preview' },
  { id: 'preview-3d', label: '3D Preview' },
  { id: 'export', label: 'Export' },
];

export function StylizerMenuBar() {
  const ctx = useStylizerContext();
  return (
    <div className={styles.menubar}>
      <Link href="/" className={styles.brand}>🎨 Material Stylizer</Link>
      <input
        className={styles.nameInput}
        value={ctx.projectName}
        onChange={(e) => ctx.setProjectName(e.target.value)}
        aria-label="Project name"
      />
      <button className={styles.item} onClick={ctx.resetMaterial}>New</button>
      <button className={styles.item} onClick={() => ctx.triggerSave()} disabled={ctx.isSaving}>
        {ctx.isSaving ? 'Saving…' : 'Save'}
      </button>
      <div className={styles.viewMenu}>
        <span className={styles.item}>View ▾</span>
        <div className={styles.dropdown}>
          {VIEW_PANELS.map((p) => (
            <button key={p.id} className={styles.dropItem}
              onClick={() => ctx.togglePanel(p.id)}>
              {ctx.visiblePanels.has(p.id) ? '✓ ' : '  '}{p.label}
            </button>
          ))}
          <button className={styles.dropItem} onClick={ctx.resetLayout}>Reset Layout</button>
        </div>
      </div>
      {ctx.autosaveNotification && <span className={styles.note}>{ctx.autosaveNotification}</span>}
    </div>
  );
}
```

Create `src/components/StylizerMenuBar.module.css`:

```css
.menubar { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--card); border-bottom: 1px solid var(--border); color: var(--foreground); }
.brand { font-weight: 700; text-decoration: none; color: var(--foreground); }
.nameInput { background: var(--muted); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; color: var(--foreground); font-size: 12px; }
.item { background: transparent; border: none; color: var(--foreground); cursor: pointer; font-size: 12px; padding: 4px 8px; border-radius: 6px; }
.item:hover { background: var(--muted); }
.viewMenu { position: relative; }
.viewMenu:hover .dropdown { display: block; }
.dropdown { display: none; position: absolute; top: 100%; left: 0; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 4px; z-index: 50; min-width: 160px; }
.dropItem { display: block; width: 100%; text-align: left; background: transparent; border: none; color: var(--foreground); padding: 6px 10px; font-size: 12px; cursor: pointer; border-radius: 6px; white-space: pre; }
.dropItem:hover { background: var(--muted); }
.note { margin-left: auto; font-size: 11px; opacity: .7; }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/StylizerDockLayout.tsx src/components/StylizerDockLayout.module.css src/components/StylizerMenuBar.tsx src/components/StylizerMenuBar.module.css
git commit -m "feat(stylizer): add dock layout and menu bar"
```

---

## Task 11: Tool page — state, processing effect, persistence

**Files:**
- Create: `src/app/tools/stylizer/page.tsx`
- Create: `src/app/tools/stylizer/page.module.css`

**Interfaces:**
- Consumes: everything above — `StylizerProvider`, `StylizerDockLayout`, `StylizerMenuBar`, the engine functions, `useProjectSave`, `projectDatabase`.
- Produces: the `/tools/stylizer` route. Deep-link restore via `?project=<id>`.

- [ ] **Step 1: Create the page**

Create `src/app/tools/stylizer/page.tsx`:

```tsx
'use client';

/**
 * Material Stylizer Workspace - converts realistic PBR materials into stylized looks.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { StylizerProvider, StylizerContextValue, StylizerMaterial, StylizerDerived, MapSlot, MAP_SLOTS } from '@/contexts/StylizerContext';
import { StylizerDockLayout, StylizerDockLayoutRef } from '@/components/StylizerDockLayout';
import { StylizerMenuBar } from '@/components/StylizerMenuBar';
import {
  StylizerOptions, DEFAULT_STYLIZER_OPTIONS,
  stylize, bakeLighting, regenerateNormal, regenerateHeight, flattenMap,
} from '@/lib/stylizer';
import { useProjectSave } from '@/hooks/useProjectSave';
import styles from './page.module.css';

const EMPTY_MATERIAL: StylizerMaterial = { maps: {}, resolution: null };
const EMPTY_DERIVED: StylizerDerived = {
  stylizedAlbedo: null, normal: null, height: null, roughness: null, metallic: null,
};

const PREVIEW_MAX = 1024;

async function fileToBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function disposeBitmap(b: ImageBitmap | null | undefined) {
  if (b) { try { b.close(); } catch { /* noop */ } }
}

export default function StylizerPage() {
  const [material, setMaterial] = useState<StylizerMaterial>(EMPTY_MATERIAL);
  const [options, setOptionsState] = useState<StylizerOptions>(DEFAULT_STYLIZER_OPTIONS);
  const [derived, setDerived] = useState<StylizerDerived>(EMPTY_DERIVED);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wipePosition, setWipePosition] = useState(50);
  const [tiled, setTiled] = useState(false);
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(new Set([
    'material-loader', 'style', 'map-output', 'preview-2d', 'preview-3d', 'export',
  ]));
  const dockRef = useRef<StylizerDockLayoutRef>(null);

  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('Untitled Material');
  useEffect(() => {
    if (!projectId) setProjectId(`stylizer-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
  }, [projectId]);

  const setOptions = useCallback((updater: (prev: StylizerOptions) => StylizerOptions) => {
    setOptionsState(updater);
  }, []);

  // --- Map loading ---
  const loadMap = useCallback(async (slot: MapSlot, file: File) => {
    const bmp = await fileToBitmap(file);
    setMaterial((prev) => {
      disposeBitmap(prev.maps[slot]);
      const maps = { ...prev.maps, [slot]: bmp };
      const resolution = slot === 'albedo'
        ? { width: bmp.width, height: bmp.height }
        : prev.resolution;
      return { maps, resolution };
    });
  }, []);

  const clearMap = useCallback((slot: MapSlot) => {
    setMaterial((prev) => {
      disposeBitmap(prev.maps[slot]);
      const maps = { ...prev.maps };
      delete maps[slot];
      return { ...prev, maps, resolution: slot === 'albedo' ? null : prev.resolution };
    });
  }, []);

  const resetMaterial = useCallback(() => {
    setMaterial((prev) => {
      MAP_SLOTS.forEach((s) => disposeBitmap(prev.maps[s]));
      return EMPTY_MATERIAL;
    });
  }, []);

  // --- Processing effect (debounced) ---
  const runIdRef = useRef(0);
  useEffect(() => {
    const albedo = material.maps.albedo;
    if (!albedo) {
      setDerived((prev) => {
        disposeBitmap(prev.stylizedAlbedo); disposeBitmap(prev.normal);
        disposeBitmap(prev.height); disposeBitmap(prev.roughness); disposeBitmap(prev.metallic);
        return EMPTY_DERIVED;
      });
      return;
    }
    const runId = ++runIdRef.current;
    setIsProcessing(true);
    const handle = setTimeout(async () => {
      try {
        // Downscale albedo for preview if large.
        let previewAlbedo = albedo;
        const longEdge = Math.max(albedo.width, albedo.height);
        if (longEdge > PREVIEW_MAX) {
          const scale = PREVIEW_MAX / longEdge;
          previewAlbedo = await createImageBitmap(albedo, {
            resizeWidth: Math.round(albedo.width * scale),
            resizeHeight: Math.round(albedo.height * scale),
            resizeQuality: 'high',
          });
        }

        let styled = await stylize(previewAlbedo, options);
        if (options.bakeAO || options.bakeShading) {
          const baked = await bakeLighting(styled, material.maps.ao, material.maps.height, options);
          disposeBitmap(styled); styled = baked;
        }
        const normal = options.regenerateNormal ? await regenerateNormal(styled, options.normalStrength) : null;
        const height = options.regenerateHeight ? await regenerateHeight(styled) : null;
        const roughness = options.flattenRoughness && material.maps.roughness
          ? await flattenMap(material.maps.roughness, 4) : null;
        const metallic = options.flattenMetallic && material.maps.metallic
          ? await flattenMap(material.maps.metallic, 2) : null;

        if (runId !== runIdRef.current) {
          [styled, normal, height, roughness, metallic].forEach(disposeBitmap);
          if (previewAlbedo !== albedo) disposeBitmap(previewAlbedo);
          return;
        }
        if (previewAlbedo !== albedo) disposeBitmap(previewAlbedo);

        setDerived((prev) => {
          disposeBitmap(prev.stylizedAlbedo); disposeBitmap(prev.normal);
          disposeBitmap(prev.height); disposeBitmap(prev.roughness); disposeBitmap(prev.metallic);
          return { stylizedAlbedo: styled, normal, height, roughness, metallic };
        });
      } finally {
        if (runId === runIdRef.current) setIsProcessing(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [material.maps.albedo, material.maps.ao, material.maps.height, material.maps.roughness, material.maps.metallic, options]);

  // --- Persistence: serialize source maps as frames ---
  const customFrames = useCallback(async () => {
    const frames = [];
    let index = 0;
    for (const slot of MAP_SLOTS) {
      const bmp = material.maps[slot];
      if (!bmp) continue;
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width; canvas.height = bmp.height;
      canvas.getContext('2d')!.drawImage(bmp, 0, 0);
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
      frames.push({ id: slot, index: index++, timestamp: 0, blob, sourceId: 'stylizer', sourceColor: '#8b5cf6' });
    }
    return frames;
  }, [material.maps]);

  const savedSlots = useMemo(() => MAP_SLOTS.filter((s) => material.maps[s]), [material.maps]);

  const { triggerSave, isSaving, autosaveNotification } = useProjectSave({
    projectId, setProjectId, projectName, setProjectName,
    type: 'stylizer',
    frameState: null,
    customFrames,
    fps: 0, loopMode: 'normal',
    isDirty: !!material.maps.albedo,
    // stash stylizer state in the trimsheetOptions-style channel:
    // (projectDatabase ProjectMetadata gained stylizerOptions + stylizerMapSlots in Task 5)
    trimsheetOptions: undefined,
    threePainterOptions: undefined,
  } as any);

  // NOTE: useProjectSave writes metadata fields it knows about. To persist stylizerOptions
  // and slot order, extend the save call once (see Task 11 Step 2).

  // --- Deep-link restore ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('project');
    if (!id) return;
    import('@/lib/projectDatabase').then(async ({ getProject }) => {
      const project = await getProject(id);
      if (!project || project.type !== 'stylizer') return;
      setProjectId(project.id);
      setProjectName(project.name);
      if (project.metadata.stylizerOptions) setOptionsState(project.metadata.stylizerOptions);
      const maps: Partial<Record<MapSlot, ImageBitmap>> = {};
      let resolution: { width: number; height: number } | null = null;
      for (const f of project.frames) {
        const slot = f.id as MapSlot;
        if (!MAP_SLOTS.includes(slot)) continue;
        const bmp = await createImageBitmap(f.blob);
        maps[slot] = bmp;
        if (slot === 'albedo') resolution = { width: bmp.width, height: bmp.height };
      }
      setMaterial({ maps, resolution });
    });
  }, []);

  // --- Panel toggles ---
  const togglePanel = useCallback((panelId: string) => {
    setVisiblePanels((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) { next.delete(panelId); dockRef.current?.removeTab(panelId); }
      else { next.add(panelId); dockRef.current?.addTab(panelId); }
      return next;
    });
  }, []);
  const resetLayout = useCallback(() => {
    dockRef.current?.resetLayout();
    setVisiblePanels(new Set(['material-loader', 'style', 'map-output', 'preview-2d', 'preview-3d', 'export']));
  }, []);

  // Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); triggerSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [triggerSave]);

  const ctxValue: StylizerContextValue = useMemo(() => ({
    material,
    loadMap, clearMap, resetMaterial,
    hasAlbedo: !!material.maps.albedo,
    options, setOptions,
    derived, isProcessing,
    wipePosition, setWipePosition, tiled, setTiled,
    visiblePanels, togglePanel, resetLayout,
    projectId, projectName, setProjectName,
    triggerSave, isSaving, autosaveNotification,
  }), [material, loadMap, clearMap, resetMaterial, options, setOptions, derived, isProcessing,
    wipePosition, tiled, visiblePanels, togglePanel, resetLayout,
    projectId, projectName, triggerSave, isSaving, autosaveNotification]);

  return (
    <StylizerProvider value={ctxValue}>
      <div className={styles.container}>
        <StylizerMenuBar />
        <StylizerDockLayout ref={dockRef} onVisiblePanelsChange={setVisiblePanels} />
      </div>
    </StylizerProvider>
  );
}
```

- [ ] **Step 2: Persist `stylizerOptions` and slot order**

`useProjectSave` builds `metadata` internally from known fields. To store the stylizer-specific bits, extend the hook's option pass-through. In `src/hooks/useProjectSave.ts`, locate where `metadata` is assembled (the `ProjectMetadata` object) and add:

```ts
        stylizerOptions: currentOpts.stylizerOptions,
        stylizerMapSlots: currentOpts.stylizerMapSlots,
```

and add these to the hook's options type:

```ts
  stylizerOptions?: import('@/lib/stylizer').StylizerOptions;
  stylizerMapSlots?: string[];
```

Then in `page.tsx`, pass them in the `useProjectSave({...})` call (replace the `as any` cast):

```ts
    stylizerOptions: options,
    stylizerMapSlots: savedSlots,
```

- [ ] **Step 3: Create page CSS**

Create `src/app/tools/stylizer/page.module.css`:

```css
.container { display: flex; flex-direction: column; height: 100vh; width: 100vw; overflow: hidden; background: var(--background); }
```

- [ ] **Step 4: Verify build + manual smoke**

Run: `npm run build`
Expected: PASS.

Then: `npm run dev`, open `http://localhost:3000/tools/stylizer`. Load any image into the Albedo slot. Confirm: the four style buttons change the preview live; the wipe slider reveals before/after; Map Output regenerate-normal shows a bluish normal thumbnail; Export downloads a zip. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/tools/stylizer/page.tsx src/app/tools/stylizer/page.module.css src/hooks/useProjectSave.ts
git commit -m "feat(stylizer): add tool page with processing pipeline and persistence"
```

---

## Task 12: Launcher wiring + lockstep changelog

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/data/changelog.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the `/tools/stylizer` route (Task 11), `'stylizer'` project type (Task 5).
- Produces: launcher entry points + changelog entries. Final task — verifies the whole feature.

- [ ] **Step 1: Add `stylizer` to the changelog `toolScope` union and a version entry**

In `src/data/changelog.ts`, change the `toolScope` union (line ~9) to include `'stylizer'`:

```ts
  toolScope: 'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet' | 'stylizer';
```

Add a new entry at the TOP of the versions array (match the shape of the existing first entry — inspect it first with `sed -n '12,30p' src/data/changelog.ts`):

```ts
  {
    version: '0.X.0', // next minor; check the current top entry and bump
    date: '2026-07-04',
    toolScope: 'stylizer',
    toolName: 'Material Stylizer',
    items: [
      { type: 'Added', text: 'New Material Stylizer tool: convert realistic textures/PBR materials into painterly, cel, watercolor, or sketch styles.' },
      { type: 'Added', text: 'Bake AO and soft shading into the stylized albedo; regenerate normal and height maps from the result.' },
      { type: 'Added', text: 'Live 2D before/after wipe preview with 2×2 tiling, optional 3D material preview, and ZIP export of selected maps.' },
    ],
  },
```

- [ ] **Step 2: Add matching `CHANGELOG.md` entry**

Inspect the top of `CHANGELOG.md` for format, then add under a new version heading matching Step 1's version/date:

```markdown
## [0.X.0] - 2026-07-04

### Added
- **Material Stylizer tool** — convert realistic textures/PBR materials into painterly, cel, watercolor, or sketch styles.
- Bake AO and soft shading into the stylized albedo; regenerate normal and height maps from the stylized result.
- Live 2D before/after wipe preview with 2×2 tiling, optional 3D material preview, and ZIP export of selected maps.
```

- [ ] **Step 3: Wire the launcher**

In `src/app/page.tsx`:

(a) Extend the `changelogFilter` state union and `openChangelog` param type (lines ~19, ~76) to include `'stylizer'`.

(b) Add a nav link near the other tool links (~line 100):

```tsx
            <Link href="/tools/stylizer" className={styles.navItem}>
              🎨 Material Stylizer
            </Link>
```

(c) Add a tool card in the tool-cards section (model it on the Trimsheet card ~lines 241-262):

```tsx
            <div className={styles.toolCard}>
              <h2 className={styles.toolTitle}>Material Stylizer</h2>
              <p className={styles.toolDesc}>
                Convert realistic textures and PBR materials into hand-painted, stylized looks —
                painterly, cel, watercolor, or sketch — with baked lighting and regenerated maps.
              </p>
              <button className={styles.changelogBtn} onClick={() => openChangelog('stylizer')}>
                Changelog
              </button>
              <Link href="/tools/stylizer" className={styles.toolCta}>
                Launch Material Stylizer
              </Link>
            </div>
```

(Use the exact class names present in the Trimsheet card — copy them verbatim from that card.)

(d) In the recent-projects mapping (~lines 286-308), add stylizer handling:

```tsx
                const isStylizer = proj.type === 'stylizer';
```
add to the `targetLink` chain:
```tsx
                else if (isStylizer) targetLink = `/tools/stylizer?project=${proj.id}`;
```
and add a badge branch in the badge label expression:
```tsx
                        {isSpritesheet ? '🎬 Spritesheet' : isPixelator ? '👾 Pixelator' : isTrimsheet ? '🧱 Trimsheet' : isStylizer ? '🎨 Stylizer' : '📦 3D Painter'}
```

- [ ] **Step 4: Verify build + full smoke**

Run: `npm run build`
Expected: PASS.

Then `npm run dev`:
- Launcher shows the Material Stylizer nav link + card; "Changelog" opens the drawer filtered to the tool.
- Launch the tool, load an albedo, tune a style, Save (Ctrl+S).
- Return to launcher (`/`) — the project appears with the 🎨 Stylizer badge; clicking it deep-links back and restores the map + options.

- [ ] **Step 5: Confirm lockstep + commit**

Verify `CHANGELOG.md` and `src/data/changelog.ts` have matching version/date/content.

```bash
git add src/app/page.tsx src/data/changelog.ts CHANGELOG.md
git commit -m "feat(stylizer): wire launcher entry points and changelog"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** four styles (Tasks 2–4), bake AO+shading (Task 4/11), regenerate normal+height (Task 4/11), flatten pass-through (Task 4/8/11), 2D wipe+tile preview (Task 9), 3D preview (Task 9), export zip (Task 9), persistence+deep-link (Tasks 5/11), launcher (Task 12), lockstep changelog (Task 12). No undo/redo and no AI panel — both explicitly out of v1 per the spec.
- **Verification method:** adapted from unit-test TDD to `npm run build` + manual smoke, because the repo has no test runner (per CLAUDE.md). This is called out in Global Constraints.
- **Type consistency:** engine fn names (`stylize`, `bakeLighting`, `regenerateNormal`, `regenerateHeight`, `flattenMap`) are used identically in Task 11. Context shape (`StylizerContextValue`, `derived.stylizedAlbedo`, etc.) matches between Task 6 and consuming panels. `MapSlot`/`MAP_SLOTS` imported from the context everywhere.
- **Known adaptation point:** Task 9 Step 2 (3D panel) depends on the real `ThreePainter` constructor/method names — the task instructs the implementer to grep the actual API and adapt, with a plain-`three` fallback so the tool is never blocked on it.
- **Known adaptation point:** Task 11 Step 2 requires reading the exact `metadata` assembly site in `useProjectSave.ts`. The change is additive (two optional fields), following the existing `trimsheetOptions` precedent.
