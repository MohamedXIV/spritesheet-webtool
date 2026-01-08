# Video → Spritesheet Web Tool (MVP Dev Plan)

## 1. Goal (MVP Scope)

Build a **client-side web tool** that:
- Takes a local video file
- Extracts frames
- Lets the user select, reorder, and preview frames as an animation
- Exports a spritesheet image (PNG)
- Optionally exports metadata (JSON)

No backend. No uploads. No accounts.

---

## 2. Non-Goals (Explicitly Out of Scope)

- FFmpeg (server or wasm)
- Audio handling
- Advanced codecs edge cases
- GIF/APNG export
- Mobile optimization
- Authentication / payments
- AI features

---

## 3. Tech Stack (Locked)

### Core
- Next.js (App Router)
- TypeScript
- React (Client Components)
- Canvas API
- Web Workers (optional but recommended)

### Browser APIs
- WebCodecs (primary)
- HTML5 `<video>` + canvas (fallback)
- ImageBitmap
- OffscreenCanvas (if supported)

### Hosting
- Static deployment (Vercel / Netlify)

---

## 4. High-Level Architecture

```
/app
  /page.tsx            → Landing
  /editor/page.tsx     → Editor (client-only)
  /components
    VideoLoader.tsx
    FrameGrid.tsx
    Timeline.tsx
    PreviewPlayer.tsx
    ExportPanel.tsx
  /lib
    videoDecoder.ts
    frameStore.ts
    spritesheetPacker.ts
    exporter.ts
```

Editor page must be:
```ts
'use client'
```

---

## 5. Core Pipeline

### 5.1 Video Loading
- User selects a local video file
- Create ObjectURL
- Detect browser capabilities

```ts
if ('VideoDecoder' in window) {
  use WebCodecs
} else {
  use <video> fallback
}
```

---

### 5.2 Frame Extraction

#### WebCodecs path
- Decode frames sequentially
- Convert each frame to ImageBitmap
- Immediately close VideoFrame
- Store minimal metadata only

#### Fallback path
- Seek video
- drawImage(video → canvas)
- createImageBitmap(canvas)

---

### 5.3 Frame Storage Strategy

- Store frames as `ImageBitmap[]`
- Release frames when deselected
- Do NOT store raw pixel buffers
- Virtualize UI (only render visible thumbnails)

---

## 6. Editor Features (MVP)

### Frame Grid
- Thumbnail preview
- Multi-select (shift / ctrl)
- Delete frames
- Reorder via drag & drop

### Timeline
- Order matters
- Playback direction
- FPS control (global)

### Preview Player
- Loop playback
- FPS-based timing
- Canvas-based render
- Play / Pause / Scrub

---

## 7. Spritesheet Export

### Packing (MVP)
- Fixed columns
- Auto rows
- Padding option
- No trimming (yet)

### Output
- PNG spritesheet
- Optional JSON metadata

```json
{
  "fps": 12,
  "frameWidth": 64,
  "frameHeight": 64,
  "frames": [
    { "x": 0, "y": 0, "w": 64, "h": 64 }
  ]
}
```

---

## 8. Performance Rules (Important)

- Use ImageBitmap, not Image
- Close VideoFrame immediately
- Avoid copying pixel buffers
- Prefer OffscreenCanvas
- Heavy work can move to Web Worker

NO WASM in MVP.

---

## 9. UX Priorities

1. Fast feedback
2. Visual preview always available
3. Zero upload / privacy-safe
4. No modal hell
5. Keyboard-friendly (optional)

---

## 10. Deployment

- Static export
- No backend APIs
- No environment secrets
- Analytics optional

---

## 11. Future Extensions (Not Implemented)

- Frame trimming
- Power-of-two packing
- Multi-sheet export
- GIF/WebM export
- Rust WASM for pixel ops
- Desktop build (Tauri + FFmpeg)
- Ads (outside editor only)

---

## 12. Definition of Done (MVP)

- Video → frames works
- Frame selection & ordering works
- Preview animation works
- Spritesheet exports correctly
- No crashes on medium videos
- Runs fully offline

---

## 13. Guiding Principle

> Optimize for **developer sanity**, not theoretical performance.
> Profile first, optimize later.
