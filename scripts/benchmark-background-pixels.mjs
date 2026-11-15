/** Reproducible Color Key pixel-core microbenchmark. Not a browser/AI benchmark. */
import { performance } from 'node:perf_hooks';
import { applyChromaKeyToImageData } from '../src/lib/chromaKey.ts';

const options = {
  targetColor: { r: 0, g: 255, b: 0 },
  tolerance: 30,
  edgeSoftness: 5,
  spillSuppression: true,
  spillMethod: 'cap',
  spillAmount: 80,
};

function fixture(size) {
  const data = new Uint8ClampedArray(size * size * 4);
  const min = Math.floor(size / 4);
  const max = Math.ceil(size * 3 / 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const inside = x >= min && x < max && y >= min && y < max;
      data[index] = inside ? 210 : 0;
      data[index + 1] = inside ? 60 : 255;
      data[index + 2] = inside ? 35 : 0;
      data[index + 3] = 255;
    }
  }
  return { width: size, height: size, data, min, max };
}

function benchmark(size, repetitions = 15) {
  const source = fixture(size);
  const samples = [];
  for (let repeat = 0; repeat < repetitions + 3; repeat++) {
    const input = { width: size, height: size, data: new Uint8ClampedArray(source.data) };
    const start = performance.now();
    applyChromaKeyToImageData(input, options);
    const elapsed = performance.now() - start;
    if (repeat >= 3) samples.push(elapsed);
    if (repeat === 3) {
      let correct = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const expected = x >= source.min && x < source.max && y >= source.min && y < source.max;
          if ((input.data[(y * size + x) * 4 + 3] >= 128) === expected) correct++;
        }
      }
      if (correct !== size * size) throw new Error(`Synthetic mask regression at ${size}px`);
    }
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  return { size, medianMs: Number(median.toFixed(3)), megapixelsPerSecond: Number((size * size / median / 1000).toFixed(2)), runs: repetitions };
}

console.log(JSON.stringify({ environment: `Node ${process.version}`, scope: 'CPU pixel loop only (excludes Canvas, ImageBitmap, model, GPU, download)', results: [256, 512, 1024].map(size => benchmark(size)) }, null, 2));
