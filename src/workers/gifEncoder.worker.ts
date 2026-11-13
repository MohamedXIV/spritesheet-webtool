import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { gifCentisecondDelay } from '../lib/gifTiming';

type Message =
  | { type: 'start'; width: number; height: number; colors: number; repeat: number; total: number }
  | { type: 'frame'; pixels: Uint8ClampedArray; delay: number }
  | { type: 'finish' };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Message>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

let encoder: ReturnType<typeof GIFEncoder> | null = null;
let width = 0;
let height = 0;
let colors = 256;
let repeat = 0;
let total = 0;
let written = 0;

scope.onmessage = (event) => {
  try {
    const data = event.data;
    if (data.type === 'start') {
      width = data.width;
      height = data.height;
      colors = Math.max(2, Math.min(256, Math.floor(data.colors)));
      repeat = data.repeat;
      total = data.total;
      written = 0;
      encoder = GIFEncoder();
      return;
    }
    if (!encoder) throw new Error('GIF encoder was not initialized');

    if (data.type === 'frame') {
      const rgba = data.pixels;
      if (rgba.length !== width * height * 4) throw new Error('Invalid frame dimensions');

      let opaqueCount = 0;
      let transparent = false;
      for (let p = 3; p < rgba.length; p += 4) {
        if (rgba[p] < 128) transparent = true;
        else opaqueCount++;
      }

      // Excluding transparent pixels from quantization keeps their RGB values
      // from overwhelming the palette (especially on transparent sprites).
      const opaque = new Uint8Array(opaqueCount * 4);
      let offset = 0;
      for (let p = 0; p < rgba.length; p += 4) {
        if (rgba[p + 3] < 128) continue;
        opaque[offset++] = rgba[p];
        opaque[offset++] = rgba[p + 1];
        opaque[offset++] = rgba[p + 2];
        opaque[offset++] = 255;
      }

      const palette: number[][] = opaqueCount
        ? quantize(opaque, transparent ? colors - 1 : colors, { format: 'rgb565' })
        : [[0, 0, 0]];
      const transparentIndex = transparent ? palette.length : 0;
      if (transparent) palette.push([0, 0, 0]);

      const indexes = applyPalette(rgba, palette);
      if (transparent) {
        for (let p = 3; p < rgba.length; p += 4) {
          if (rgba[p] < 128) indexes[p >> 2] = transparentIndex;
        }
      }

      encoder.writeFrame(indexes, width, height, {
        palette,
        transparent,
        transparentIndex,
        delay: gifCentisecondDelay(data.delay),
        repeat,
        dispose: 2, // Every encoded frame is full-size, avoiding stale pixel trails
      });
      written++;
      scope.postMessage({ type: 'progress', completed: written, total });
    } else if (data.type === 'finish') {
      encoder.finish();
      const encoded = encoder.bytes();
      // Transfer a self-owned buffer (not the encoder's mutable internal view).
      const output = new Uint8Array(encoded.length);
      output.set(encoded);
      scope.postMessage({ type: 'complete', buffer: output.buffer }, [output.buffer]);
      encoder = null;
    }
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    encoder = null;
  }
};
