/**
 * layerCompositor.ts - Photoshop-grade layer stack compositor and pixel/mask helpers.
 * Pure math/stack helpers stay DOM-free for Node unit testing.
 */

import type {
  LayerAdjustmentConfig,
  LayerBlendMode,
  LayerFillConfig,
  LayerPixelData,
  ProjectLayer,
} from '@/types';

export const DEFAULT_ADJUSTMENT_CONFIG: LayerAdjustmentConfig = {
  hue: 0,
  saturation: 0,
  brightness: 0,
  contrast: 0,
  invert: false,
  posterize: 0,
  levels: { black: 0, gamma: 1.0, white: 255 },
  curvesPoints: [0, 128, 128, 255],
};

export const DEFAULT_FILL_CONFIG: LayerFillConfig = {
  kind: 'solid',
  color: '#7c3aed',
  gradientEnd: '#06b6d4',
  gradientType: 'linear',
  angle: 90,
};

export function createBaseProjectLayer(): ProjectLayer {
  return {
    id: 'layer-base',
    name: 'Base Frame',
    type: 'raster',
    parentId: null,
    scope: 'per-frame',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    alphaLocked: false,
    clipped: false,
    maskEnabled: true,
    maskInverted: false,
  };
}

export const BLEND_MODE_OPTIONS: Array<{ value: LayerBlendMode; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
];

export function blendModeToCompositeOp(mode: LayerBlendMode): GlobalCompositeOperation {
  return mode === 'normal' ? 'source-over' : mode;
}

/**
 * Resolve top-level or group-scoped render nodes, grouping consecutive clipped
 * siblings onto their immediate non-clipped base sibling.
 */
export interface RenderUnit {
  base: ProjectLayer;
  clippedChain: ProjectLayer[];
}

export function buildRenderUnits(
  layers: readonly ProjectLayer[],
  parentId: string | null = null
): RenderUnit[] {
  const siblings = layers.filter(l => (l.parentId ?? null) === parentId);
  const units: RenderUnit[] = [];

  for (const layer of siblings) {
    if (layer.clipped && units.length > 0 && units[units.length - 1].base.type !== 'group') {
      units[units.length - 1].clippedChain.push(layer);
    } else {
      units.push({ base: layer, clippedChain: [] });
    }
  }
  return units;
}

/**
 * Build a 256-entry tonal LUT combining Levels, Curves, Brightness, Contrast, Invert & Posterize.
 */
export function buildAdjustmentLut(cfg: LayerAdjustmentConfig): Uint8Array {
  const lut = new Uint8Array(256);
  const levels = cfg.levels ?? { black: 0, gamma: 1.0, white: 255 };
  const black = Math.max(0, Math.min(254, levels.black));
  const white = Math.max(black + 1, Math.min(255, levels.white));
  const gamma = Math.max(0.1, Math.min(3.0, levels.gamma));
  const invGamma = 1 / gamma;

  const [y0, x1Raw, y1, y2] = cfg.curvesPoints ?? [0, 128, 128, 255];
  const x1 = Math.max(2, Math.min(253, x1Raw));
  const W = 255;
  const denom = W * W - W * x1;
  const curveLut = new Uint8Array(256);
  if (Math.abs(denom) < 0.001) {
    for (let x = 0; x <= 255; x++) {
      const t = x <= x1 ? x / x1 : (x - x1) / (255 - x1);
      const val = x <= x1 ? y0 + t * (y1 - y0) : y1 + t * (y2 - y1);
      curveLut[x] = clampByte(val);
    }
  } else {
    const a = ((y2 - y0) - (y1 - y0) * (W / x1)) / denom;
    const b = ((y1 - y0) - a * x1 * x1) / x1;
    for (let x = 0; x <= 255; x++) {
      curveLut[x] = clampByte(a * x * x + b * x + y0);
    }
  }

  // Contrast factor (-100..100)
  const cVal = (cfg.contrast / 100) * 255;
  const contrastFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));
  const brightnessOffset = (cfg.brightness / 100) * 255;

  for (let i = 0; i < 256; i++) {
    // 1. Levels
    let v = (i - black) / (white - black);
    v = Math.max(0, Math.min(1, v));
    v = Math.pow(v, invGamma) * 255;

    // 2. Curves
    v = curveLut[clampByte(v)];

    // 3. Brightness & Contrast
    v = contrastFactor * (v - 128) + 128 + brightnessOffset;
    v = clampByte(v);

    // 4. Posterize
    if (cfg.posterize && cfg.posterize >= 2) {
      const steps = cfg.posterize - 1;
      v = Math.round((Math.round((v / 255) * steps) / steps) * 255);
    }

    // 5. Invert
    if (cfg.invert) {
      v = 255 - v;
    }

    lut[i] = clampByte(v);
  }
  return lut;
}

export function applyAdjustmentToRgba(
  data: Uint8ClampedArray,
  cfg: LayerAdjustmentConfig
): void {
  const lut = buildAdjustmentLut(cfg);
  const doHsl = cfg.hue !== 0 || cfg.saturation !== 0;
  const hueShift = cfg.hue / 360;
  const satScale = 1 + cfg.saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = lut[data[i]];
    let g = lut[data[i + 1]];
    let b = lut[data[i + 2]];

    if (doHsl) {
      const [h, s, l] = rgbToHsl(r, g, b);
      const nh = ((h + hueShift) % 1 + 1) % 1;
      const ns = Math.max(0, Math.min(1, s * satScale));
      [r, g, b] = hslToRgb(nh, ns, l);
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    case bn:
      h = (rn - gn) / d + 4;
      break;
  }
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = clampByte(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [
    clampByte(hue2rgb(h + 1 / 3) * 255),
    clampByte(hue2rgb(h) * 255),
    clampByte(hue2rgb(h - 1 / 3) * 255),
  ];
}

// ---------------------------------------------------------------------------
// Canvas Compositor (Browser-only via DOM Canvas + ImageBitmap)
// ---------------------------------------------------------------------------

export interface LiveLayerOverride {
  layerId: string;
  target: 'layer' | 'mask';
  canvas: HTMLCanvasElement;
  offsetX?: number;
  offsetY?: number;
}

export function resolveLayerPixelData(
  layer: ProjectLayer,
  frameLayers: Record<string, LayerPixelData> | undefined
): LayerPixelData | undefined {
  return layer.scope === 'shared' ? layer.sharedData : frameLayers?.[layer.id];
}

/**
 * Apply an opaque grayscale mask (R=G=B luminance 0..255) onto a target canvas's alpha channel.
 */
export function applyGrayscaleMaskToCanvas(
  targetCanvas: HTMLCanvasElement,
  maskSource: ImageBitmap | HTMLCanvasElement,
  inverted = false
): void {
  const w = targetCanvas.width;
  const h = targetCanvas.height;
  if (w === 0 || h === 0) return;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mCtx = maskCanvas.getContext('2d')!;
  mCtx.fillStyle = '#ffffff';
  mCtx.fillRect(0, 0, w, h);
  mCtx.drawImage(maskSource, 0, 0, w, h);

  const maskImg = mCtx.getImageData(0, 0, w, h);
  const mData = maskImg.data;
  const tCtx = targetCanvas.getContext('2d')!;
  const targetImg = tCtx.getImageData(0, 0, w, h);
  const tData = targetImg.data;

  for (let i = 0; i < tData.length; i += 4) {
    // Luminance from R channel (grayscale mask) modulated by mask alpha
    const lum = (mData[i] * 0.299 + mData[i + 1] * 0.587 + mData[i + 2] * 0.114) * (mData[i + 3] / 255);
    const factor = (inverted ? 255 - lum : lum) / 255;
    tData[i + 3] = Math.round(tData[i + 3] * factor);
  }
  tCtx.putImageData(targetImg, 0, 0);
}

function drawFillLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cfg: LayerFillConfig
): void {
  if (cfg.kind === 'gradient') {
    const endColor = cfg.gradientEnd ?? '#000000';
    let grad: CanvasGradient;
    if (cfg.gradientType === 'radial') {
      grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
    } else {
      const rad = ((cfg.angle ?? 90) * Math.PI) / 180;
      const cx = w / 2;
      const cy = h / 2;
      const halfLen = Math.hypot(w, h) / 2;
      grad = ctx.createLinearGradient(
        cx - Math.cos(rad) * halfLen,
        cy - Math.sin(rad) * halfLen,
        cx + Math.cos(rad) * halfLen,
        cy + Math.sin(rad) * halfLen
      );
    }
    grad.addColorStop(0, cfg.color);
    grad.addColorStop(1, endColor);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = cfg.color;
  }
  ctx.fillRect(0, 0, w, h);
}

function renderSingleLayerCanvas(
  layer: ProjectLayer,
  frameLayers: Record<string, LayerPixelData> | undefined,
  underlayCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  override?: LiveLayerOverride
): HTMLCanvasElement | null {
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = width;
  layerCanvas.height = height;
  const lCtx = layerCanvas.getContext('2d')!;

  const pixelData = resolveLayerPixelData(layer, frameLayers);
  const useLayerOverride = override && override.layerId === layer.id && override.target === 'layer';
  const useMaskOverride = override && override.layerId === layer.id && override.target === 'mask';

  if (layer.type === 'fill') {
    drawFillLayer(lCtx, width, height, layer.fillConfig ?? DEFAULT_FILL_CONFIG);
  } else if (layer.type === 'adjustment') {
    const uCtx = underlayCanvas.getContext('2d')!;
    const snapshot = uCtx.getImageData(0, 0, width, height);
    applyAdjustmentToRgba(snapshot.data, layer.adjustmentConfig ?? DEFAULT_ADJUSTMENT_CONFIG);
    lCtx.putImageData(snapshot, 0, 0);
  } else if (layer.type === 'raster') {
    const src = useLayerOverride ? override.canvas : pixelData?.bitmap;
    if (!src) return null;
    const ox = useLayerOverride ? (override.offsetX ?? pixelData?.offsetX ?? 0) : (pixelData?.offsetX ?? 0);
    const oy = useLayerOverride ? (override.offsetY ?? pixelData?.offsetY ?? 0) : (pixelData?.offsetY ?? 0);
    lCtx.drawImage(src, ox, oy);
  }

  const maskSrc = useMaskOverride ? override.canvas : pixelData?.maskBitmap;
  if (maskSrc && layer.maskEnabled !== false) {
    applyGrayscaleMaskToCanvas(layerCanvas, maskSrc, Boolean(layer.maskInverted));
  }

  return layerCanvas;
}

/**
 * Render an ordered layer subtree into targetCanvas (used recursively for groups and top-level stack).
 */
export function renderLayerTreeToCanvas(
  targetCanvas: HTMLCanvasElement,
  globalLayers: readonly ProjectLayer[],
  frameLayers: Record<string, LayerPixelData> | undefined,
  parentId: string | null = null,
  override?: LiveLayerOverride
): void {
  const width = targetCanvas.width;
  const height = targetCanvas.height;
  const ctx = targetCanvas.getContext('2d')!;
  const units = buildRenderUnits(globalLayers, parentId);

  for (const unit of units) {
    const { base, clippedChain } = unit;
    if (!base.visible || base.opacity <= 0) continue;

    if (base.type === 'group') {
      const groupCanvas = document.createElement('canvas');
      groupCanvas.width = width;
      groupCanvas.height = height;
      renderLayerTreeToCanvas(groupCanvas, globalLayers, frameLayers, base.id, override);

      const pixelData = resolveLayerPixelData(base, frameLayers);
      const useMaskOverride = override && override.layerId === base.id && override.target === 'mask';
      const maskSrc = useMaskOverride ? override.canvas : pixelData?.maskBitmap;
      if (maskSrc && base.maskEnabled !== false) {
        applyGrayscaleMaskToCanvas(groupCanvas, maskSrc, Boolean(base.maskInverted));
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, base.opacity));
      ctx.globalCompositeOperation = blendModeToCompositeOp(base.blendMode);
      ctx.drawImage(groupCanvas, 0, 0);
      ctx.restore();
      continue;
    }

    const visibleClipped = clippedChain.filter(c => c.visible && c.opacity > 0);
    if (visibleClipped.length === 0) {
      const single = renderSingleLayerCanvas(base, frameLayers, targetCanvas, width, height, override);
      if (!single) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, base.opacity));
      ctx.globalCompositeOperation = blendModeToCompositeOp(base.blendMode);
      ctx.drawImage(single, 0, 0);
      ctx.restore();
      continue;
    }

    // Clipping mask chain: render base into isolated buffer, draw clipped layers atop,
    // clip combined result to base's alpha, then blend onto targetCanvas.
    const baseCanvas = renderSingleLayerCanvas(base, frameLayers, targetCanvas, width, height, override);
    if (!baseCanvas) continue;

    const clipBuffer = document.createElement('canvas');
    clipBuffer.width = width;
    clipBuffer.height = height;
    const cCtx = clipBuffer.getContext('2d')!;
    cCtx.drawImage(baseCanvas, 0, 0);

    for (const clippedLayer of visibleClipped) {
      const childCanvas = renderSingleLayerCanvas(clippedLayer, frameLayers, clipBuffer, width, height, override);
      if (!childCanvas) continue;
      // Clip child to base alpha before blending
      const maskedChild = document.createElement('canvas');
      maskedChild.width = width;
      maskedChild.height = height;
      const mcCtx = maskedChild.getContext('2d')!;
      mcCtx.drawImage(childCanvas, 0, 0);
      mcCtx.globalCompositeOperation = 'destination-in';
      mcCtx.drawImage(baseCanvas, 0, 0);

      cCtx.save();
      cCtx.globalAlpha = Math.max(0, Math.min(1, clippedLayer.opacity));
      cCtx.globalCompositeOperation = blendModeToCompositeOp(clippedLayer.blendMode);
      cCtx.drawImage(maskedChild, 0, 0);
      cCtx.restore();
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, base.opacity));
    ctx.globalCompositeOperation = blendModeToCompositeOp(base.blendMode);
    ctx.drawImage(clipBuffer, 0, 0);
    ctx.restore();
  }
}

export async function compositeFrameLayers(
  frameLayers: Record<string, LayerPixelData> | undefined,
  globalLayers: readonly ProjectLayer[],
  width: number,
  height: number
): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  renderLayerTreeToCanvas(canvas, globalLayers, frameLayers, null);
  return await createImageBitmap(canvas);
}

export async function createSolidMaskBitmap(
  width: number,
  height: number,
  fill: 'white' | 'black' = 'white'
): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = fill === 'white' ? '#ffffff' : '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return await createImageBitmap(canvas);
}

/**
 * Convert an RGBA bitmap's alpha channel into an opaque grayscale mask (R=G=B=alpha, A=255).
 */
export async function alphaBitmapToGrayscaleMask(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    d[i] = a;
    d[i + 1] = a;
    d[i + 2] = a;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return await createImageBitmap(canvas);
}

export async function invertGrayscaleMaskBitmap(mask: ImageBitmap): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(mask, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return await createImageBitmap(canvas);
}

/**
 * Materialize an independent frame-sized bitmap for a layer (useful for Copy-on-Write
 * when a layer shares a full spritesheet bitmap with an offset, or when applying a mask).
 */
export async function materializeLayerCanvas(
  layer: ProjectLayer,
  data: LayerPixelData | undefined,
  width: number,
  height: number,
  includeMask = false
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (layer.type === 'fill') {
    drawFillLayer(ctx, width, height, layer.fillConfig ?? DEFAULT_FILL_CONFIG);
  } else if (data?.bitmap) {
    ctx.drawImage(data.bitmap, data.offsetX ?? 0, data.offsetY ?? 0);
  }
  if (includeMask && data?.maskBitmap && layer.maskEnabled !== false) {
    applyGrayscaleMaskToCanvas(canvas, data.maskBitmap, Boolean(layer.maskInverted));
  }
  return canvas;
}

export async function cloneLayerPixelData(data: LayerPixelData | undefined): Promise<LayerPixelData> {
  if (!data) return { bitmap: null, maskBitmap: null, offsetX: 0, offsetY: 0 };
  const bitmap = data.bitmap ? await createImageBitmap(data.bitmap) : null;
  const maskBitmap = data.maskBitmap ? await createImageBitmap(data.maskBitmap) : null;
  return {
    bitmap,
    maskBitmap,
    offsetX: data.offsetX ?? 0,
    offsetY: data.offsetY ?? 0,
  };
}
