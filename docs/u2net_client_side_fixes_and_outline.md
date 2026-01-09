# U²-Net Client-Side Fixes & Outline Feature — Implementation Guide

## Goal

Improve client-side background removal using **U²-Net** by:
1. Preventing browser tab freezes / UI hangs
2. Reducing background bleed and edge artifacts
3. Turning unavoidable imperfections into a **controlled outline feature**

This document defines **how to implement this correctly** and safely in a web tool.

---

## 1. Core Problems Observed

### 1.1 Performance / Freezing
- U²-Net inference blocks the main thread
- 1–2 second stalls cause UI hangs
- Memory pressure triggers GC pauses

### 1.2 Visual Artifacts
- Background color bleed near edges
- Semi-transparent halos
- Hair / soft-edge instability

These issues are **expected** in client-side ML inference.

---

## 2. Mandatory Performance Fixes (Non-Negotiable)

### 2.1 Run U²-Net in a Web Worker

U²-Net **MUST NOT** run on the main thread.

Architecture:
```
Main Thread
  - UI
  - Canvas preview
  - Sends ImageBitmap

Web Worker
  - ONNX Runtime
  - U²-Net inference
  - Alpha mask output
```

Rules:
- Use `ImageBitmap` or `Uint8Array`
- Transfer ownership (`postMessage(..., [data])`)
- No DOM access in worker

---

### 2.2 Downscale Before Inference

U²-Net does not need full resolution.

Recommended:
- Max dimension: 512–640 px
- Preserve aspect ratio
- Upscale mask afterward

Benefits:
- 2–4× speed improvement
- Lower memory usage
- Fewer freezes

---

### 2.3 Use OffscreenCanvas in Worker (If Available)

Use `OffscreenCanvas` for:
- Resize
- Normalization
- Mask post-processing

Fallback gracefully if unsupported.

---

### 2.4 Cancellation / Timeout Support

Implement a cancel mechanism:
- Abort inference if it exceeds time limit
- Allow user to retry
- Fallback to non-AI background removal

This prevents “stuck” states.

---

## 3. Post-Processing Pipeline (Critical)

U²-Net output must be refined. Raw masks are NOT final.

### 3.1 Alpha Thresholding

Clamp alpha values:
```
alpha < 0.05 → 0
alpha > 0.95 → 1
```

Removes weak transparency noise.

---

### 3.2 Morphological Erosion (1–2 px)

- Slightly shrink alpha mask
- Eliminates background bleed
- Especially effective on flat backgrounds

---

### 3.3 Edge Color Decontamination

For semi-transparent pixels:
- Divide RGB by alpha
- Or sample inward opaque pixels
- Prevents old background color ghosts

This step greatly improves visual quality.

---

## 4. Intentional Outline Feature (Recommended)

### Key Insight

An outline is **not a hack**.
It is a legitimate production technique used in:
- Games
- Spritesheets
- Pixel art
- Animation

It hides imperfections and improves readability.

---

## 5. Outline Generation Algorithm

Steps:
1. Take final alpha mask
2. Dilate mask outward by N pixels
3. Subtract original mask
4. Fill with chosen color

Formula:
```
Outline = Dilated(alpha) − alpha
```

---

## 6. Outline Controls (Expose to User)

- Thickness (1–8 px)
- Color
- Position:
  - Outside
  - Inside
  - Both
- Optional softness / blur

Defaults:
- Outline OFF by default
- Clean edge remains primary output

---

## 7. UX & Framing Rules

### Naming (Important)
Use:
- “Edge Outline”
- “Sprite Stroke”
- “Border”

Avoid:
- “Fix AI artifacts”
- “Watermark cleanup”

This reframes limitations as **stylistic control**.

---

## 8. Recommended Background Removal Modes

### Mode 1 — Fast (Default)
- Color key
- Edge flood-fill
- Manual mask

### Mode 2 — AI (U²-Net)
- Worker-based
- Non-blocking
- Optional outline

AI mode should NEVER block the UI.

---

## 9. Expected Results After Implementation

- No browser freezes
- Smooth UI during inference
- Cleaner edges
- No visible background bleed
- User-controlled stylistic outline
- Production-ready sprites

---

## 10. Guiding Principle

> AI output is **raw material**, not final art.
> Classic graphics techniques are required to finish the job.

Treat U²-Net as a helper, not a magic solution.
