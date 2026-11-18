/**
 * canvasTools.ts - Pure 2D canvas drawing, selection, transform, flood-fill,
 * gradient, clone-stamp, shape, and text algorithms for the unified Preview Editor.
 */

export type EditorToolId =
  | 'move'
  | 'marquee'
  | 'lasso'
  | 'wand'
  | 'brush'
  | 'eraser'
  | 'clone'
  | 'bucket'
  | 'gradient'
  | 'eyedropper'
  | 'shape'
  | 'text'
  | 'hand'
  | 'zoom';

export type ShapeKind = 'line' | 'rect' | 'ellipse';
export type GradientKind = 'linear' | 'radial';

export interface SelectionMask {
  width: number;
  height: number;
  /** 0 = unselected, 255 = selected */
  data: Uint8Array;
  bounds: { x: number; y: number; w: number; h: number } | null;
}

export interface ToolSettings {
  tool: EditorToolId;
  foregroundColor: string;
  backgroundColor: string;
  brushSize: number;
  brushOpacity: number;    // 0..1
  brushHardness: number;   // 0..1
  pixelPerfect: boolean;
  tolerance: number;       // 0..255 (Bucket & Wand)
  contiguous: boolean;     // Bucket & Wand
  shapeKind: ShapeKind;
  shapeFilled: boolean;
  shapeStrokeWidth: number;
  gradientKind: GradientKind;
  gradientToTransparent: boolean;
  fontFamily: string;
  fontSize: number;
  fontBold: boolean;
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  tool: 'brush',
  foregroundColor: '#8b5cf6',
  backgroundColor: '#000000',
  brushSize: 4,
  brushOpacity: 1.0,
  brushHardness: 1.0,
  pixelPerfect: true,
  tolerance: 24,
  contiguous: true,
  shapeKind: 'rect',
  shapeFilled: false,
  shapeStrokeWidth: 2,
  gradientKind: 'linear',
  gradientToTransparent: false,
  fontFamily: 'sans-serif',
  fontSize: 16,
  fontBold: false,
};

export function hexToRgba(hex: string, alpha01 = 1): [number, number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16) || 0;
  return [
    (num >> 16) & 255,
    (num >> 8) & 255,
    num & 255,
    Math.max(0, Math.min(255, Math.round(alpha01 * 255))),
  ];
}

export function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Selection Helpers
// ---------------------------------------------------------------------------

export function computeSelectionBounds(
  data: Uint8Array,
  width: number,
  height: number
): SelectionMask['bounds'] {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (data[rowOffset + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function createRectSelection(
  width: number,
  height: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  existing?: SelectionMask | null,
  mode: 'replace' | 'add' | 'subtract' = 'replace'
): SelectionMask {
  const data = existing && existing.width === width && existing.height === height && mode !== 'replace'
    ? new Uint8Array(existing.data)
    : new Uint8Array(width * height);

  const x0 = Math.max(0, Math.floor(Math.min(rx, rx + rw)));
  const y0 = Math.max(0, Math.floor(Math.min(ry, ry + rh)));
  const x1 = Math.min(width - 1, Math.floor(Math.max(rx, rx + rw)) - 1);
  const y1 = Math.min(height - 1, Math.floor(Math.max(ry, ry + rh)) - 1);

  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      data[row + x] = mode === 'subtract' ? 0 : 255;
    }
  }
  return { width, height, data, bounds: computeSelectionBounds(data, width, height) };
}

export function createPolygonSelection(
  width: number,
  height: number,
  points: Array<{ x: number; y: number }>,
  existing?: SelectionMask | null,
  mode: 'replace' | 'add' | 'subtract' = 'replace'
): SelectionMask {
  const data = existing && existing.width === width && existing.height === height && mode !== 'replace'
    ? new Uint8Array(existing.data)
    : new Uint8Array(width * height);

  if (points.length >= 3) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    const img = ctx.getImageData(0, 0, width, height).data;
    for (let i = 0; i < width * height; i++) {
      if (img[i * 4 + 3] > 127) {
        data[i] = mode === 'subtract' ? 0 : 255;
      }
    }
  }
  return { width, height, data, bounds: computeSelectionBounds(data, width, height) };
}

export function createMagicWandSelection(
  sourceCanvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  tolerance: number,
  contiguous: boolean,
  existing?: SelectionMask | null,
  mode: 'replace' | 'add' | 'subtract' = 'replace'
): SelectionMask {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const sx = Math.max(0, Math.min(w - 1, Math.floor(startX)));
  const sy = Math.max(0, Math.min(h - 1, Math.floor(startY)));

  const ctx = sourceCanvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, w, h).data;
  const data = existing && existing.width === w && existing.height === h && mode !== 'replace'
    ? new Uint8Array(existing.data)
    : new Uint8Array(w * h);

  const sIdx = (sy * w + sx) * 4;
  const sr = img[sIdx];
  const sg = img[sIdx + 1];
  const sb = img[sIdx + 2];
  const sa = img[sIdx + 3];

  const matches = (pIdx: number) => {
    const o = pIdx * 4;
    return (
      Math.abs(img[o] - sr) <= tolerance &&
      Math.abs(img[o + 1] - sg) <= tolerance &&
      Math.abs(img[o + 2] - sb) <= tolerance &&
      Math.abs(img[o + 3] - sa) <= tolerance
    );
  };

  if (!contiguous) {
    for (let i = 0; i < w * h; i++) {
      if (matches(i)) {
        data[i] = mode === 'subtract' ? 0 : 255;
      }
    }
  } else {
    const visited = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let sp = 0;
    stack[sp++] = sy * w + sx;

    while (sp > 0) {
      const idx = stack[--sp];
      if (visited[idx]) continue;
      visited[idx] = 1;
      if (!matches(idx)) continue;

      data[idx] = mode === 'subtract' ? 0 : 255;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0 && !visited[idx - 1]) stack[sp++] = idx - 1;
      if (x < w - 1 && !visited[idx + 1]) stack[sp++] = idx + 1;
      if (y > 0 && !visited[idx - w]) stack[sp++] = idx - w;
      if (y < h - 1 && !visited[idx + w]) stack[sp++] = idx + w;
    }
  }

  return { width: w, height: h, data, bounds: computeSelectionBounds(data, w, h) };
}

export function invertSelectionMask(sel: SelectionMask): SelectionMask {
  const next = new Uint8Array(sel.data.length);
  for (let i = 0; i < sel.data.length; i++) {
    next[i] = sel.data[i] > 0 ? 0 : 255;
  }
  return {
    width: sel.width,
    height: sel.height,
    data: next,
    bounds: computeSelectionBounds(next, sel.width, sel.height),
  };
}

export async function selectionToGrayscaleMaskBitmap(sel: SelectionMask): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = sel.width;
  canvas.height = sel.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(sel.width, sel.height);
  const d = img.data;
  for (let i = 0; i < sel.data.length; i++) {
    const v = sel.data[i];
    const o = i * 4;
    d[o] = v;
    d[o + 1] = v;
    d[o + 2] = v;
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return await createImageBitmap(canvas);
}

/**
 * Draw crisp animated marching ants outline for any SelectionMask onto an overlay canvas.
 */
export function renderSelectionMarchingAnts(
  ctx: CanvasRenderingContext2D,
  sel: SelectionMask,
  scaleX: number,
  scaleY: number,
  dashOffset: number
): void {
  if (!sel.bounds) return;
  const { width: w, height: h, data } = sel;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  const buildPath = () => {
    ctx.beginPath();
    for (let y = sel.bounds!.y; y < sel.bounds!.y + sel.bounds!.h; y++) {
      const row = y * w;
      for (let x = sel.bounds!.x; x < sel.bounds!.x + sel.bounds!.w; x++) {
        if (data[row + x] === 0) continue;
        // Top edge
        if (y === 0 || data[(y - 1) * w + x] === 0) {
          ctx.moveTo(x * scaleX, y * scaleY);
          ctx.lineTo((x + 1) * scaleX, y * scaleY);
        }
        // Bottom edge
        if (y === h - 1 || data[(y + 1) * w + x] === 0) {
          ctx.moveTo(x * scaleX, (y + 1) * scaleY);
          ctx.lineTo((x + 1) * scaleX, (y + 1) * scaleY);
        }
        // Left edge
        if (x === 0 || data[row + x - 1] === 0) {
          ctx.moveTo(x * scaleX, y * scaleY);
          ctx.lineTo(x * scaleX, (y + 1) * scaleY);
        }
        // Right edge
        if (x === w - 1 || data[row + x + 1] === 0) {
          ctx.moveTo((x + 1) * scaleX, y * scaleY);
          ctx.lineTo((x + 1) * scaleX, (y + 1) * scaleY);
        }
      }
    }
  };

  buildPath();
  ctx.strokeStyle = '#000000';
  ctx.lineDashOffset = dashOffset;
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineDashOffset = dashOffset + 4;
  ctx.stroke();
  ctx.restore();
}

/**
 * Apply selection clipping by restoring pixels outside selection from preStrokeSnapshot.
 */
export function enforceSelectionClip(
  targetCanvas: HTMLCanvasElement,
  preStrokeSnapshot: ImageData,
  selection: SelectionMask | null
): void {
  if (!selection) return;
  const w = targetCanvas.width;
  const h = targetCanvas.height;
  if (selection.width !== w || selection.height !== h) return;

  const ctx = targetCanvas.getContext('2d')!;
  const current = ctx.getImageData(0, 0, w, h);
  const cur = current.data;
  const prev = preStrokeSnapshot.data;
  const sel = selection.data;

  for (let i = 0; i < sel.length; i++) {
    if (sel[i] === 0) {
      const o = i * 4;
      cur[o] = prev[o];
      cur[o + 1] = prev[o + 1];
      cur[o + 2] = prev[o + 2];
      cur[o + 3] = prev[o + 3];
    }
  }
  ctx.putImageData(current, 0, 0);
}

// ---------------------------------------------------------------------------
// Brush, Eraser, Clone Stamp & Pixel-Perfect Stroke Drawing
// ---------------------------------------------------------------------------

export function drawBrushSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: {
    mode: 'brush' | 'eraser';
    color: string;
    size: number;
    opacity: number;
    hardness: number;
    pixelPerfect: boolean;
    alphaLocked?: boolean;
    isMask?: boolean;
  }
): void {
  const { mode, color, size, opacity, hardness, pixelPerfect, alphaLocked, isMask } = opts;

  if (pixelPerfect) {
    // Crisp pixel-art Bresenham dabbing with zero anti-aliasing
    const ix1 = Math.floor(x1);
    const iy1 = Math.floor(y1);
    const ix2 = Math.floor(x2);
    const iy2 = Math.floor(y2);
    const half = Math.floor(size / 2);

    ctx.save();
    if (mode === 'eraser' && !isMask) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${opacity})`;
    } else {
      ctx.globalCompositeOperation = alphaLocked && !isMask ? 'source-atop' : 'source-over';
      const [r, g, b] = mode === 'eraser' && isMask ? [0, 0, 0] : hexToRgba(color);
      ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`;
    }

    let cx = ix1;
    let cy = iy1;
    const dx = Math.abs(ix2 - ix1);
    const dy = Math.abs(iy2 - iy1);
    const sx = ix1 < ix2 ? 1 : -1;
    const sy = iy1 < iy2 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      ctx.fillRect(cx - half, cy - half, Math.max(1, size), Math.max(1, size));
      if (cx === ix2 && cy === iy2) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
    ctx.restore();
    return;
  }

  ctx.save();
  if (mode === 'eraser' && !isMask) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = alphaLocked && !isMask ? 'source-atop' : 'source-over';
    ctx.strokeStyle = mode === 'eraser' && isMask ? '#000000' : color;
  }
  ctx.lineWidth = Math.max(1, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = opacity;
  if (hardness < 0.95 && (mode !== 'eraser' || isMask)) {
    ctx.shadowColor = mode === 'eraser' && isMask ? '#000000' : color;
    ctx.shadowBlur = (1 - hardness) * size * 0.5;
  }
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

export function drawCloneSegment(
  ctx: CanvasRenderingContext2D,
  sourceSnapshot: HTMLCanvasElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  offsetX: number,
  offsetY: number,
  size: number,
  opacity: number
): void {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(dist));
  const r = Math.max(1, size / 2);

  ctx.save();
  ctx.globalAlpha = opacity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x1 + (x2 - x1) * t;
    const cy = y1 + (y2 - y1) * t;
    const sx = cx + offsetX;
    const sy = cy + offsetY;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      sourceSnapshot,
      sx - r, sy - r, size, size,
      cx - r, cy - r, size, size
    );
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Fast Scanline Flood Fill (O(W*H))
// ---------------------------------------------------------------------------

export function floodFillCanvas(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillHex: string,
  opacity01: number,
  tolerance: number,
  contiguous: boolean,
  selection?: SelectionMask | null
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  if (selection && selection.data[sy * w + sx] === 0) return;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const fill = hexToRgba(fillHex, opacity01);
  const sOff = (sy * w + sx) * 4;
  const sr = data[sOff];
  const sg = data[sOff + 1];
  const sb = data[sOff + 2];
  const sa = data[sOff + 3];

  if (sr === fill[0] && sg === fill[1] && sb === fill[2] && sa === fill[3]) return;

  const match = (pixelIdx: number) => {
    if (selection && selection.data[pixelIdx] === 0) return false;
    const o = pixelIdx * 4;
    return (
      Math.abs(data[o] - sr) <= tolerance &&
      Math.abs(data[o + 1] - sg) <= tolerance &&
      Math.abs(data[o + 2] - sb) <= tolerance &&
      Math.abs(data[o + 3] - sa) <= tolerance
    );
  };

  const paint = (pixelIdx: number) => {
    const o = pixelIdx * 4;
    data[o] = fill[0];
    data[o + 1] = fill[1];
    data[o + 2] = fill[2];
    data[o + 3] = fill[3];
  };

  if (!contiguous) {
    for (let i = 0; i < w * h; i++) {
      if (match(i)) paint(i);
    }
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  stack[sp++] = sy * w + sx;

  while (sp > 0) {
    const idx = stack[--sp];
    if (visited[idx] || !match(idx)) continue;

    const y = Math.floor(idx / w);
    let x = idx % w;

    // Move left to span start
    while (x > 0 && !visited[y * w + x - 1] && match(y * w + x - 1)) {
      x--;
    }

    let spanUp = false;
    let spanDown = false;
    while (x < w) {
      const curIdx = y * w + x;
      if (visited[curIdx] || !match(curIdx)) break;
      visited[curIdx] = 1;
      paint(curIdx);

      if (y > 0) {
        const upIdx = (y - 1) * w + x;
        const upOk = !visited[upIdx] && match(upIdx);
        if (!spanUp && upOk) {
          stack[sp++] = upIdx;
          spanUp = true;
        } else if (spanUp && !upOk) {
          spanUp = false;
        }
      }
      if (y < h - 1) {
        const downIdx = (y + 1) * w + x;
        const downOk = !visited[downIdx] && match(downIdx);
        if (!spanDown && downOk) {
          stack[sp++] = downIdx;
          spanDown = true;
        } else if (spanDown && !downOk) {
          spanDown = false;
        }
      }
      x++;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// ---------------------------------------------------------------------------
// Shapes, Gradient & Text
// ---------------------------------------------------------------------------

export function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: {
    kind: ShapeKind;
    color: string;
    filled: boolean;
    strokeWidth: number;
    opacity: number;
    alphaLocked?: boolean;
  }
): void {
  ctx.save();
  ctx.globalAlpha = opts.opacity;
  ctx.globalCompositeOperation = opts.alphaLocked ? 'source-atop' : 'source-over';
  ctx.strokeStyle = opts.color;
  ctx.fillStyle = opts.color;
  ctx.lineWidth = Math.max(1, opts.strokeWidth);

  const rx = Math.min(x1, x2);
  const ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1);
  const rh = Math.abs(y2 - y1);

  if (opts.kind === 'line') {
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else if (opts.kind === 'rect') {
    if (opts.filled) ctx.fillRect(rx, ry, rw, rh);
    else ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(1, rw), Math.max(1, rh));
  } else {
    ctx.beginPath();
    ctx.ellipse(rx + rw / 2, ry + rh / 2, Math.max(0.5, rw / 2), Math.max(0.5, rh / 2), 0, 0, Math.PI * 2);
    if (opts.filled) ctx.fill();
    else ctx.stroke();
  }
  ctx.restore();
}

export function drawGradientOverlay(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: {
    kind: GradientKind;
    fgColor: string;
    bgColor: string;
    toTransparent: boolean;
    opacity: number;
  }
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const [r, g, b] = hexToRgba(opts.fgColor);
  const startStyle = `rgba(${r},${g},${b},${opts.opacity})`;
  const endStyle = opts.toTransparent
    ? `rgba(${r},${g},${b},0)`
    : opts.bgColor;

  ctx.save();
  let grad: CanvasGradient;
  if (opts.kind === 'radial') {
    const radius = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
    grad = ctx.createRadialGradient(x1, y1, 0, x1, y1, radius);
  } else {
    grad = ctx.createLinearGradient(x1, y1, x2, y2);
  }
  grad.addColorStop(0, startStyle);
  grad.addColorStop(1, endStyle);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function rasterizeTextToCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    color: string;
    fontFamily: string;
    fontSize: number;
    bold: boolean;
    opacity: number;
  }
): void {
  if (!text.trim()) return;
  ctx.save();
  ctx.globalAlpha = opts.opacity;
  ctx.fillStyle = opts.color;
  ctx.textBaseline = 'top';
  ctx.font = `${opts.bold ? 'bold ' : ''}${Math.max(6, opts.fontSize)}px ${opts.fontFamily}`;
  const lines = text.split('\n');
  const lineHeight = Math.round(opts.fontSize * 1.2);
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * lineHeight);
  });
  ctx.restore();
}
