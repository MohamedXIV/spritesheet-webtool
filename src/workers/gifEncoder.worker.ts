import gifenc from 'gifenc';
const { GIFEncoder } = gifenc;
import { toIndexedGifFrame } from '../lib/gifPalette';
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

      const { palette, index } = toIndexedGifFrame(rgba, colors);
      encoder.writeFrame(index, width, height, {
        palette,
        transparent: true,
        transparentIndex: 0,
        delay: gifCentisecondDelay(data.delay),
        repeat,
        dispose: 2, // Full canvas: restore transparent background every frame
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
