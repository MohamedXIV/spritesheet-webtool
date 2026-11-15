# Background Removal — implementation and validation dossier

Status: **draft for real-browser benchmarking**, 2026-11-15. This is not a claim
that the 5-second WebGPU target or any AI quality improvement has been measured.

## Audit of the previous implementation

The old `BackgroundRemovalPanel` exposed Color Key, BodyPix MobileNetV1 and a
misleadingly named "U²-Net" method. `u2netRemoval.ts` actually called IMG.LY's
**ISNet**, without selecting WebGPU. Each frame travelled through Canvas → PNG
Blob → inference → PNG Blob → ImageBitmap. The old panel applied results
immediately, did not preview the result, could not cancel a batch, and applied
one pixel of erosion by default, even to delicate hair and thin sprite details.
Original alpha was also overwritten by the Color Key's partial alpha.

The following is now implemented in the draft:

- **Color Key:** remains download-free; preserves source alpha, limits spill
  correction to partially keyed edges, and detects the modal opaque corner
  color instead of averaging unrelated corners. Tiny and transparent sources
  are handled explicitly.
- **AI Background Removal:** IMG.LY 1.7 / ISNet via WebGPU when an actual adapter
  is available; quantized ISNet on CPU/WASM otherwise. UI labels name the real
  runtime and explain estimated first-download sizes. GPU failures offer an
  explicit CPU retry so downloading a second model is not automatic.
- **Mask pipeline:** sends raw RGBA bytes to IMG.LY and retrieves a separate raw
  mask, eliminating both PNG encodes/decodes. Composites the mask with the
  original RGBA at full size, multiplying existing alpha. Source RGB is left
  unchanged by default. Optional soft/pixel edges, erosion (default 0), and
  edge decontamination are shared refinements.
- **Animation:** processes selected frames, reuses IMG.LY's memoized model
  session, reports download/initialization/inference/compositing stages and
  complete-frame progress. Cancelling stops after the current inference, with
  partial outputs disposed. Preview first, then Apply or Discard. Apply verifies
  that each source bitmap still matches the one used for the preview.
- **Explicit download confirmation:** the first AI operation for each backend
  during a page session requires choosing to load/reuse its ~80 MB WebGPU or
  ~40 MB CPU model. The panel explains why the model is needed, that browser
  caching normally survives refreshes, and when eviction, site-data clearing,
  updates or changing backend can trigger downloads again. No model is fetched
  merely because the panel was opened.
- **Empty-mask protection:** a model result that would fully erase a visible
  frame is first retried once through a conventional PNG input (same cached
  model; no new model download), in case raw RGBA transport failed. On a confidently uniform
  background (including transparent letterboxing), the sprite is recovered via
  Color Key, with an explicit per-batch notice. Otherwise processing fails
  safely and offers another method/backend; no project frame is modified.
- **Integration:** Apply uses the editor's existing `onFramesProcessed` path.
  No IDs, frame timings, layers, or project schema fields are rebuilt here.
  Existing undo/save/export logic remains the integration point.

**Cancellation limitation:** IMG.LY 1.7 does not provide a reliable way to abort
an ONNX session *during* inference. The Cancel button prevents subsequent frames
and discards the completed work; it cannot preempt a stuck GPU kernel. A hard
worker-termination architecture needs separate validation before claiming
instant cancellation.

## Candidate evaluation

| Candidate | Role | Download evidence | License evidence | Current decision |
| --- | --- | --- | --- | --- |
| Color Key (Canvas) | Solid backgrounds, pixel sprites | No model | Original app code | Keep and harden |
| IMG.LY ISNet quantized | Fast CPU fallback | ~40 MB, vendor estimate | IMG.LY library AGPL; IMG.LY model repository lists MIT | Used on CPU |
| IMG.LY ISNet FP16 | WebGPU general foreground | ~80 MB, vendor estimate | Same separate code/weights caveat | Used on GPU |
| BiRefNet Lite (quantized ONNX export) | Candidate for improved illustration/hair quality | Original weights ~178 MB; browser export varies by revision | Original repository and weights author confirm MIT; individual exports need their own review | Not installed before measurements |
| BodyPix MobileNetV1 | Existing person-only baseline | Depends on model/config | TensorFlow.js model code Apache-2.0 | Hidden from UX pending comparative test |
| MediaPipe / TF.js body-segmentation | Modern people-only candidate | Varies by task/model | Verify both model-specific weights and runtime | Only if people-only quality clearly wins |

Licensing and technical sources:

- [IMG.LY code and license (AGPL)](https://github.com/imgly/background-removal-js)
- [IMG.LY model repository (MIT card)](https://huggingface.co/imgly/isnet-general-onnx)
- [IMG.LY model size estimates and caching](https://www.npmjs.com/package/@imgly/background-removal)
- [ONNX Runtime WebGPU guide](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
- [BiRefNet Lite model card (MIT, original ~178 MB)](https://huggingface.co/ZhengPeng7/BiRefNet_lite)
- [BiRefNet author confirming code **and weights** MIT](https://github.com/ZhengPeng7/BiRefNet/issues/316)
- [BodyPix deprecation notice](https://github.com/tensorflow/tfjs-models/tree/master/body-pix)

**Before any merge:** verify the exact downloadable ISNet artifact revision and
its distribution notices, plus the existing application's AGPL compliance.
This draft retains the pre-existing AGPL dependency; it does not resolve that
licensing question or silently substitute a new model.

## Benchmark protocol and honest status

Use the *same original eight fixtures* on `main` and this draft, at 256, 512
and 1024 pixels when possible. Fixtures should include (1) green-screen
character with known mask, (2) anime character and busy background, (3) AI
animation frame, (4) pixel art, (5) a human subject, (6) flyaway hair/thin
details, (7) subject near the background color, (8) existing transparent and
semi-transparent edges. Keep the ground-truth mask separate, when available.

For each runtime, record on fresh and warm caches separately:

| Measurement | Previous `main` | This draft | Status |
| --- | --- | --- | --- |
| Model bytes transferred (cold) | — | — | Requires network panel in target browser |
| Model/session startup (cold/warm) | — | — | Requires target browser |
| First 512px inference | — | — | Requires target browser |
| Warm 512px inference | — | — | Requires target browser |
| 10-frame batch and peak memory | — | — | Requires target browser |
| GPU and CPU/WASM fallback | — | — | Requires separate supported browsers |
| Mask IoU, edge F-score, halo/parts lost | — | — | Needs ground-truth/annotated fixtures |

The new preview reports *total batch*, *first frame* and *subsequent-frame
average* timings (these are wall-clock timings including compositing; **not**
isolated ONNX inference). Record separate Network timings for download and use
the Performance panel to isolate initialization, inference and compositing.
Inspect GPU availability in browser devtools; test CPU with the explicit toggle.

A deterministic pixel-core-only benchmark is included:
`npm run benchmark:color-key`. It verifies a simple known-mask synthetic fixture
and records 15 warm runs at each size. On this container (Node 24.22.1), its
median times were **0.409 ms at 256px, 1.694 ms at 512px, and 6.678 ms at
1024px**. These are *not* browser, Canvas, end-to-end, or AI performance
measurements. Re-run on target hardware before quoting them in product UI.
Test Chrome/Edge with real WebGPU, a browser without WebGPU, and a weak CPU.

The development container has passed TypeScript, build and unit tests, but its
Chromium process cannot create the sandbox socket, and the remote browser cannot
connect to its local Next.js server. No honest AI speed/quality measurements can
be reported from that environment. **Do not promote this draft to a completed
overhaul until those tests and baseline measurements exist.**

## Browser regression checklist

1. Load a green-screen sprite, a transparent PNG, an illustrated sprite and a
   short GIF/video with multiple frames.
2. Preview Color Key; ensure originals remain unchanged until Apply. Discard and
   confirm no dirty project or Undo entry is created.
3. Select two of five frames; process and Apply. Check the other three remain
   identical, and IDs, dimensions, timestamp and per-frame duration persist.
4. Undo, redo, save to IndexedDB, close, restore, and export GIF/spritesheet.
   Verify paint layers and other project content are unchanged.
5. On GPU, check only ~80 MB ISNet resources download once; after warmup, rerun
   several frames and record timings. Repeat on CPU (new or disabled WebGPU).
6. Cancel during multi-frame inference. Ensure no partial project write. On a
   failed WebGPU session, choose CPU retry *after* the size warning.
7. Inspect a faint hair edge, tiny pixel-art outline, transparent shadow, and
   green clothing near green background with soft vs crisp edge modes.
8. Select AI and verify the download/reuse confirmation appears *before*
   assets are requested. Reload and confirm the cache policy remains visible.
   Switch GPU to CPU and confirm the separate model download is disclosed.
9. Use an illustrated character on green with transparent padding, as well as
   a complex-background source. Verify an empty AI mask never yields a fully
   blank applicable preview. On the uniform case, verify the fallback warning.

## Next decision gate

Run comparative mask-quality and warm-inference tests with BiRefNet Lite ONNX
before committing another large download or claiming it beats ISNet. Remove
BodyPix code/dependencies only after checking that a specialized People mode
adds no measurable value on real subjects. If the AI path still regularly
exceeds 5 seconds at 512 px on WebGPU, a separate worker/model architecture
should be evaluated against actual profiling traces.
