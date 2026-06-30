# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Next.js dev server (http://localhost:3000)
npm run build    # Production build — run this to verify TypeScript/Next.js compile before completing work
npm run start    # Serve the production build
npm run lint     # ESLint (eslint-config-next, core-web-vitals + TypeScript)
```

There is no test runner configured. "Verification" in this repo means a clean `npm run build`.

## Mandatory workflow rules (from .cursorrules)

These are enforced project conventions, not suggestions:

1. **Lockstep changelog.** Every feature/fix/refactor that warrants a version bump must update **both** files together, with matching content:
   - `CHANGELOG.md` (Keep a Changelog format: `Added`/`Changed`/`Deprecated`/`Removed`/`Fixed`/`Security`)
   - `src/data/changelog.ts` (a new `ChangelogVersion` object; this is what the in-app Changelog Drawer renders, filtered by `toolScope`)
2. **Conventional Commits** with SemVer intent: `feat:` (minor), `fix:` (patch), `refactor:`, `docs:`, `style:`.
3. **Before declaring done / committing:** confirm the two changelog sources are aligned and `npm run build` passes.

## Architecture

This is a **fully client-side** (`'use client'`) browser image/3D toolkit built on Next.js App Router + React 19. Heavy media processing runs in the browser via Canvas, `ImageBitmap`, WebGL/Three.js, WebCodecs, and TensorFlow.js — there is essentially no server. Persistence is **local-only IndexedDB**; nothing is uploaded. The only API route (`src/app/api/generate-texture`) is an optional dev-side bridge that shells out to local AI CLIs (see below).

### Three independent tools

`src/app/page.tsx` is a project launcher (lists IndexedDB projects). Each tool lives under `src/app/tools/<name>/page.tsx` and is a self-contained workspace:

| Tool route | Purpose | Context provider | Dock layout component |
|---|---|---|---|
| `tools/video-to-spritesheet` | Extract frames from video/images → edit → export spritesheet | `EditorProvider` (`EditorContext`) | `DockLayout` |
| `tools/pixelator` | Standalone spritesheet slicer + pixel-art pixelation | `EditorProvider` (`EditorContext`) | `PixelatorDockLayout` |
| `tools/3d-pixelator` | 3D model texture painting + retro/PSX rendering ("ThreePainter") | `ThreePainterProvider` (`ThreePainterContext`) | `ThreePainterDockLayout` |

The first two tools **share `EditorContext`**; the 3D tool has its own `ThreePainterContext`. When adding panels or state, follow whichever context the tool already uses.

### The dock-layout pattern (repeated 3×)

Each tool's UI is a draggable VS Code-style workspace built on **`flexlayout-react`**:

- The page component holds nearly all state and assembles a large context value object, passed via `<XProvider value={...}>`.
- Panels are registered in a `*DockLayout.tsx` `PANEL_INFO` map + a `factory` that maps a node id → panel component. Panels read/write state through `useEditorContext()` / `useThreePainterContext()` rather than props.
- The dock layout persists to `localStorage` (e.g. key `editor-dock-layout`) and exposes an imperative ref (`addTab`/`removeTab`/`resetLayout`) used by the tool's `*MenuBar` View menu.
- **To add a panel:** create `ComponentName.tsx` + `.module.css`, register it in the relevant `*DockLayout.tsx` (PANEL_INFO + factory), and expose any new state through the matching context.

### State & persistence

- **Frames** (`src/lib/frameStore.ts`): `FrameState = { frames, folders, selectedIds }`. Frames carry live `ImageBitmap`s; folders define ordering/visibility. Pure helper functions (`getOrderedFrames`, `moveFrameToFolder`, `disposeFrames`, …) transform `FrameState` immutably. **`ImageBitmap`s must be explicitly disposed** (`disposeFrames`) to avoid leaking GPU memory.
- **Undo/redo** (`src/hooks/useFrameHistory.ts`): bounded history wrapper around `FrameState`, designed to free VRAM as old states drop out.
- **Save/load** (`src/hooks/useProjectSave.ts` + `src/lib/projectDatabase.ts`): autosave to IndexedDB (`SpriteCraftDB` / `projects` store). `serializeProject` in `frameStore.ts` turns bitmaps into a storable form. Project type is one of `'spritesheet' | 'pixelator' | '3d-painter'`.

### Processing libraries (`src/lib/`)

Pure, framework-agnostic engines — keep them free of React. Most take and return `ImageBitmap`/canvas. Key ones:

- `pixelator.ts` — pixelation, dithering (Bayer / Floyd-Steinberg / blue-noise), and palette/color quantization. `PixelatorOptions` + `DEFAULT_PIXELATOR_OPTIONS` are the canonical option shape, reused across tools.
- `palettes.ts` — built-in retro palettes (NES, PICO-8, C64, GameBoy) + custom palette storage.
- `threePainter.ts` — large Three.js engine class (`ThreePainter`): model loading (GLTF/GLB/OBJ/FBX), UV painting onto a texture canvas, PSX/retro shaders, lighting, texture-map slots (AO/normal/emissive/…), atlas packing.
- Background/watermark removal: `bodyPixRemoval.ts` & `u2netRemoval.ts` (TensorFlow.js / ONNX models, **lazy-`import()`ed** so the heavy ML deps don't load until used), `chromaKey.ts`, `maskPostProcess.ts`, `inpaint.ts`.
- Frame/export: `videoDecoder.ts` (WebCodecs + fallback), `imageLoader.ts`, `spritesheetPacker.ts`, `atlasPacker.ts`, `spritesheetSlicer.ts`, `exporter.ts`, `outlineGenerator.ts`.

### AI texture generation API

`src/app/api/generate-texture/route.ts` is the lone server route. It supports `openai`/`google` HTTP providers **and** a `cli` provider that `spawn`s a local command (e.g. an `aider`/agent CLI), optionally feeding a UV snapshot and reading back a generated image. Called only from `AIGenerationPanel.tsx`. This is a local-dev convenience and assumes a trusted local environment.

## Conventions

- Path alias `@/*` → `src/*`. Aliases: `@/components`, `@/lib`, `@/hooks`, `@/contexts`, `@/components/ui`.
- Styling: **CSS Modules** (`Component.module.css`) per component, plus Tailwind v4 (configured via `@tailwindcss/postcss`, no `tailwind.config`; tokens in `src/app/globals.css`). shadcn/ui ("new-york" style) primitives live in `src/components/ui/`.
- Components are heavy and stateful; the page owns state and pushes it down through context. Prefer extending the existing context value over prop-drilling or adding new providers.
