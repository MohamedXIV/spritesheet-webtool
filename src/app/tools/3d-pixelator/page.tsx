'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjectSave } from '@/hooks/useProjectSave';
import { DbProjectFrame } from '@/lib/projectDatabase';
import { PixelatorOptions, DEFAULT_PIXELATOR_OPTIONS, pixelateImage, hexToRgb } from '@/lib/pixelator';
import { ThreePainterProvider, PaintingLayer, BrushTool } from '@/contexts/ThreePainterContext';
import { ShadingMode, LightingSettings, LIGHTING_PRESETS, DEFAULT_LIGHTING_PRESET_ID } from '@/lib/lightingPresets';
import { ThreePainterDockLayout, ThreePainterDockLayoutRef } from '@/components/ThreePainterDockLayout';
import { ThreePainterMenuBar } from '@/components/ThreePainterMenuBar';
import { ThreePainter } from '@/lib/threePainter';
import { TextureSourceSlot } from '@/types';
import styles from './page.module.css';

export default function ThreePainterPage() {
  const [projectId,   setProjectId]   = useState<string>('');
  const [projectName, setProjectName] = useState<string>('Untitled 3D Paint Project');
  const [isDirty,     setIsDirty]     = useState(false);

  const [loadedModelName, setLoadedModelName] = useState<string | null>(null);
  const [loadedModelSize, setLoadedModelSize] = useState<number | null>(null);
  const [isLoadingModel,  setIsLoadingModel]  = useState(false);
  const [loadProgress,    setLoadProgress]    = useState(0);

  const [painter,      setPainter]      = useState<ThreePainter | null>(null);
  const [psxEnabled,   setPsxEnabled]   = useState(false);
  const [isPaintMode,  setIsPaintMode]  = useState(true);

  const [shadingMode,             setShadingMode]             = useState<ShadingMode>('unlit');
  const [activeLightingPresetId,  setActiveLightingPresetId]  = useState<string>(DEFAULT_LIGHTING_PRESET_ID);
  const [lightingSettings,        setLightingSettings]        = useState<LightingSettings>(
    LIGHTING_PRESETS.find(p => p.id === DEFAULT_LIGHTING_PRESET_ID)!.settings
  );

  const [layers,        setLayers]        = useState<PaintingLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>('');

  const [activeTool,    setActiveTool]    = useState<BrushTool>('brush');
  const [brushColor,    setBrushColor]    = useState('#8b5cf6');
  const [brushSize,     setBrushSize]     = useState(8);
  const [brushOpacity,  setBrushOpacity]  = useState(1.0);
  const [brushHardness, setBrushHardness] = useState(0.8);

  const [pixelatorOptions, setPixelatorOptions] = useState<PixelatorOptions>({
    ...DEFAULT_PIXELATOR_OPTIONS,
    enabled: true,
    pixelSize: 4,
    palette: 'none',
  });

  const [textureSlots, setTextureSlots] = useState<TextureSourceSlot[]>([]);
  const [smartMaps, setSmartMaps] = useState<{
    edges: HTMLCanvasElement | null;
    cavities: HTMLCanvasElement | null;
    height: HTMLCanvasElement | null;
  } | null>(null);

  const [pbrMaps, setPbrMaps] = useState<Record<string, { url: string | null; name: string | null }>>({});
  
  const setPbrMap = useCallback((slot: string, url: string | null, name: string | null) => {
    setPbrMaps(prev => ({ ...prev, [slot]: { url, name } }));
  }, []);

  const [canvasResolution, setCanvasResolutionState] = useState<number>(512);
  const [textureTiling, setTextureTilingState] = useState<number>(1.0);
  const [materialResolution, setMaterialResolution] = useState<'1k' | '2k' | '4k'>('2k');



  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(new Set([
    '3d-preview', '2d-preview', 'brush-panel', 'layers-panel', 'lighting-panel',
    'texture-maps', 'pixelate-panel', 'export-panel', 'ai-generation', 'material-merger',
  ]));

  const dockLayoutRef     = useRef<ThreePainterDockLayoutRef>(null);
  const undoStackRef      = useRef<Array<Array<{ id: string; imgData: ImageData; maskImgData?: ImageData }>>>([]);
  const redoStackRef      = useRef<Array<Array<{ id: string; imgData: ImageData; maskImgData?: ImageData }>>>([]);
  const modelFileBlobRef  = useRef<Blob | null>(null);
  const isModelLoaded     = !!loadedModelName;

  useEffect(() => {
    if (!projectId) {
      setProjectId(`3d-painter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    }
  }, [projectId]);

  // Quadratic Curve LUT mapping helper
  const getQuadraticCurveLut = (y0: number, x1: number, y1: number, y2: number): Uint8Array => {
    const lut = new Uint8Array(256);
    const c = y0;
    const W = 255;
    const denom = W * W - W * x1;
    if (Math.abs(denom) < 0.001 || x1 < 2 || x1 > 253) {
      for (let x = 0; x <= 255; x++) {
        if (x <= x1) {
          const t = x / x1;
          lut[x] = Math.max(0, Math.min(255, Math.round(y0 + t * (y1 - y0))));
        } else {
          const t = (x - x1) / (255 - x1);
          lut[x] = Math.max(0, Math.min(255, Math.round(y1 + t * (y2 - y1))));
        }
      }
      return lut;
    }
    const a = ((y2 - y0) - (y1 - y0) * (W / x1)) / (W * W - W * x1);
    const b = ((y1 - y0) - a * x1 * x1) / x1;
    for (let x = 0; x <= 255; x++) {
      const val = a * x * x + b * x + c;
      lut[x] = Math.max(0, Math.min(255, Math.round(val)));
    }
    return lut;
  };

  const compositeAndPixelate = useCallback(async () => {
    const compositeCanvas = document.getElementById('three-painter-composite-canvas') as HTMLCanvasElement;
    const ctx = compositeCanvas?.getContext('2d');
    if (!compositeCanvas || !ctx) return;
    const W = compositeCanvas.width;
    const H = compositeCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = W;
    tempCanvas.height = H;
    const tempCtx = tempCanvas.getContext('2d')!;

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer.visible) continue;
      const layerCanvas = document.getElementById(`layer-canvas-${layer.id}`) as HTMLCanvasElement;
      if (!layerCanvas) continue;

      tempCtx.clearRect(0, 0, W, H);

      // Apply CSS Filters (Hue, Saturation, Brightness, Contrast)
      let filterStr = '';
      if (layer.filters) {
        const { hue, saturation, brightness, contrast } = layer.filters;
        if (hue !== 0) filterStr += `hue-rotate(${hue}deg) `;
        if (saturation !== 1) filterStr += `saturate(${saturation}) `;
        if (brightness !== 1) filterStr += `brightness(${brightness}) `;
        if (contrast !== 1) filterStr += `contrast(${contrast}) `;
      }
      tempCtx.filter = filterStr.trim() || 'none';
      tempCtx.drawImage(layerCanvas, 0, 0, W, H);
      tempCtx.filter = 'none';

      // Apply Curves, Smart Masks, Shadow Tint, and Quantization
      const hasSmartMask = layer.smartMaskType && smartMaps && smartMaps[layer.smartMaskType];
      const hasMask = layer.maskCanvas && layer.maskVisible !== false;
      const hasCurves = layer.filters && (
        layer.filters.curvesPoints[0] !== 0 ||
        layer.filters.curvesPoints[1] !== 128 ||
        layer.filters.curvesPoints[2] !== 128 ||
        layer.filters.curvesPoints[3] !== 255
      );
      const needsPixelLoop = hasMask || hasCurves || hasSmartMask || layer.quantizeColorsEnabled || layer.shadowTintEnabled;

      if (needsPixelLoop) {
        const imgData = tempCtx.getImageData(0, 0, W, H);
        const pixels = imgData.data;

        let maskPixels: Uint8ClampedArray | null = null;
        if (hasMask) {
          const mCanvas = document.getElementById(`layer-mask-canvas-${layer.id}`) as HTMLCanvasElement;
          if (mCanvas) {
            const mCtx = mCanvas.getContext('2d')!;
            maskPixels = mCtx.getImageData(0, 0, W, H).data;
          }
        }

        let smartMaskPixels: Uint8ClampedArray | null = null;
        if (hasSmartMask) {
          const sCanvas = smartMaps[layer.smartMaskType!];
          if (sCanvas) {
            const sCtx = sCanvas.getContext('2d')!;
            smartMaskPixels = sCtx.getImageData(0, 0, W, H).data;
          }
        }

        const lut = hasCurves && layer.filters
          ? getQuadraticCurveLut(
              layer.filters.curvesPoints[0],
              layer.filters.curvesPoints[1],
              layer.filters.curvesPoints[2],
              layer.filters.curvesPoints[3]
            )
          : null;

        const contrast = layer.smartMaskContrast !== undefined ? layer.smartMaskContrast : 1.0;
        const threshold = layer.smartMaskThreshold !== undefined ? layer.smartMaskThreshold : 0.5;
        const intensity = layer.smartMaskIntensity !== undefined ? layer.smartMaskIntensity : 1.0;
        const invert = !!layer.smartMaskInvert;

        let shadowR = 0, shadowG = 0, shadowB = 0;
        if (layer.shadowTintEnabled && layer.shadowTintColor) {
          const hex = layer.shadowTintColor.replace('#', '');
          shadowR = parseInt(hex.substring(0, 2), 16) || 0;
          shadowG = parseInt(hex.substring(2, 4), 16) || 0;
          shadowB = parseInt(hex.substring(4, 6), 16) || 0;
        }

        const quantizeCount = layer.quantizeColorCount !== undefined ? layer.quantizeColorCount : 8;

        for (let j = 0; j < pixels.length; j += 4) {
          if (lut) {
            pixels[j]   = lut[pixels[j]];
            pixels[j+1] = lut[pixels[j+1]];
            pixels[j+2] = lut[pixels[j+2]];
          }

          let smartMaskVal = 1.0;
          if (smartMaskPixels) {
            const raw = smartMaskPixels[j] / 255.0;
            let val = (raw - threshold) * contrast + 0.5;
            val = Math.max(0.0, Math.min(1.0, val));
            if (invert) val = 1.0 - val;
            smartMaskVal = val * intensity;
          }

          if (layer.shadowTintEnabled && layer.smartMaskType === 'cavities') {
            pixels[j]     = pixels[j]     * (1.0 - smartMaskVal) + shadowR * smartMaskVal;
            pixels[j+1]   = pixels[j+1]   * (1.0 - smartMaskVal) + shadowG * smartMaskVal;
            pixels[j+2]   = pixels[j+2]   * (1.0 - smartMaskVal) + shadowB * smartMaskVal;
          }

          if (layer.quantizeColorsEnabled && quantizeCount > 1) {
            pixels[j]     = Math.round(pixels[j] / (255 / (quantizeCount - 1))) * (255 / (quantizeCount - 1));
            pixels[j+1]   = Math.round(pixels[j+1] / (255 / (quantizeCount - 1))) * (255 / (quantizeCount - 1));
            pixels[j+2]   = Math.round(pixels[j+2] / (255 / (quantizeCount - 1))) * (255 / (quantizeCount - 1));
          }

          let maskVal = 1.0;
          if (hasMask && maskPixels) {
            maskVal = maskPixels[j] / 255;
          }

          if (smartMaskPixels && (!layer.shadowTintEnabled || layer.smartMaskType !== 'cavities')) {
            maskVal *= smartMaskVal;
          }

          pixels[j+3] = pixels[j+3] * maskVal;
        }
        tempCtx.putImageData(imgData, 0, 0);
      }

      ctx.save();
      ctx.globalAlpha = layer.opacity;
      if      (layer.blendMode === 'multiply') ctx.globalCompositeOperation = 'multiply';
      else if (layer.blendMode === 'screen')   ctx.globalCompositeOperation = 'screen';
      else if (layer.blendMode === 'overlay')  ctx.globalCompositeOperation = 'overlay';
      else                                     ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.restore();
    }

    if (pixelatorOptions.enabled) {
      try {
        const bitmap  = await createImageBitmap(compositeCanvas);
        const processed = await pixelateImage(bitmap, pixelatorOptions);
        ctx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
        ctx.drawImage(processed, 0, 0);
        bitmap.close(); processed.close();
      } catch (err) { console.warn('Canvas pixelation skip:', err); }
    }
    if (painter) painter.updateTexture();
  }, [layers, pixelatorOptions, painter, smartMaps]);

  const compositeAndPixelateRef = useRef(compositeAndPixelate);
  useEffect(() => {
    compositeAndPixelateRef.current = compositeAndPixelate;
  }, [compositeAndPixelate]);

  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const setTextureTiling = useCallback((tiling: number) => {
    setTextureTilingState(tiling);
  }, []);

  useEffect(() => {
    if (painter) {
      painter.setTextureTiling(textureTiling);
    }
  }, [painter, textureTiling]);

  // Redraw all fill layers when textureTiling changes without triggering React re-renders
  useEffect(() => {
    layersRef.current.forEach(l => {
      if (l.type !== 'fill' || !l.fillTextureUrl) return;
      const canvas = document.getElementById(`layer-canvas-${l.id}`) as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const img = new Image();
        img.src = l.fillTextureUrl;
        img.onload = () => {
          if (textureTiling > 1.0) {
            const pattern = ctx.createPattern(img, 'repeat');
            if (pattern) {
              const matrix = new DOMMatrix();
              const scaleX = (canvas.width / textureTiling) / img.width;
              const scaleY = (canvas.height / textureTiling) / img.height;
              matrix.scaleSelf(scaleX, scaleY);
              pattern.setTransform(matrix);
              ctx.fillStyle = pattern;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
          } else {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
          compositeAndPixelateRef.current();
        };
      }
    });
  }, [textureTiling]);

  const setCanvasResolution = useCallback((newRes: number) => {
    setCanvasResolutionState(newRes);
    setLayers(prev => {
      const updatedLayers = prev.map(layer => {
        if (!layer.canvas) return layer;
        
        // Copy old content
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = layer.canvas.width;
        tempCanvas.height = layer.canvas.height;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.drawImage(layer.canvas, 0, 0);

        // Resize
        layer.canvas.width = newRes;
        layer.canvas.height = newRes;
        const ctx = layer.canvas.getContext('2d')!;
        ctx.drawImage(tempCanvas, 0, 0, newRes, newRes);

        // Repeat for mask
        if (layer.maskCanvas) {
          const tempMask = document.createElement('canvas');
          tempMask.width = layer.maskCanvas.width;
          tempMask.height = layer.maskCanvas.height;
          const tempMaskCtx = tempMask.getContext('2d')!;
          tempMaskCtx.drawImage(layer.maskCanvas, 0, 0);

          layer.maskCanvas.width = newRes;
          layer.maskCanvas.height = newRes;
          const maskCtx = layer.maskCanvas.getContext('2d')!;
          maskCtx.drawImage(tempMask, 0, 0, newRes, newRes);
        }

        return layer;
      });

      // Delay compositing slightly so DOM canvas updates are processed
      setTimeout(() => {
        compositeAndPixelate();
      }, 50);

      return updatedLayers;
    });
  }, [compositeAndPixelate]);

  useEffect(() => { if (layers.length > 0) compositeAndPixelate(); }, [layers, pixelatorOptions, compositeAndPixelate]);

  const captureHistorySnapshot = useCallback((): Array<{ id: string; imgData: ImageData; maskImgData?: ImageData }> => {
    return layers.map(layer => {
      const canvas  = document.getElementById(`layer-canvas-${layer.id}`) as HTMLCanvasElement;
      const ctx     = canvas?.getContext('2d');
      const imgData = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : new ImageData(256, 256);
      
      let maskImgData: ImageData | undefined;
      const mCanvas = document.getElementById(`layer-mask-canvas-${layer.id}`) as HTMLCanvasElement;
      const mCtx = mCanvas?.getContext('2d');
      if (mCanvas && mCtx) {
        maskImgData = mCtx.getImageData(0, 0, mCanvas.width, mCanvas.height);
      }

      return { id: layer.id, imgData, maskImgData };
    });
  }, [layers]);

  const applyHistorySnapshot = useCallback((snapshot: Array<{ id: string; imgData: ImageData; maskImgData?: ImageData }>) => {
    snapshot.forEach(snap => {
      const canvas = document.getElementById(`layer-canvas-${snap.id}`) as HTMLCanvasElement;
      const ctx    = canvas?.getContext('2d');
      if (ctx) ctx.putImageData(snap.imgData, 0, 0);

      if (snap.maskImgData) {
        const mCanvas = document.getElementById(`layer-mask-canvas-${snap.id}`) as HTMLCanvasElement;
        const mCtx = mCanvas?.getContext('2d');
        if (mCtx) mCtx.putImageData(snap.maskImgData, 0, 0);
      }
    });
    compositeAndPixelate();
  }, [layers, compositeAndPixelate]);

  const undo = useCallback(() => {
    if (!undoStackRef.current.length) return;
    redoStackRef.current.push(captureHistorySnapshot());
    applyHistorySnapshot(undoStackRef.current.pop()!);
    setIsDirty(true);
  }, [captureHistorySnapshot, applyHistorySnapshot]);

  const redo = useCallback(() => {
    if (!redoStackRef.current.length) return;
    undoStackRef.current.push(captureHistorySnapshot());
    applyHistorySnapshot(redoStackRef.current.pop()!);
    setIsDirty(true);
  }, [captureHistorySnapshot, applyHistorySnapshot]);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  const customFramesSerializer = useCallback(async (): Promise<DbProjectFrame[]> => {
    const dbFrames: DbProjectFrame[] = [];
    if (modelFileBlobRef.current)
      dbFrames.push({ id: 'mesh-model-3d', index: 0, timestamp: Date.now(), sourceId: 'model-3d', sourceColor: '#8b5cf6', blob: modelFileBlobRef.current });
    
    for (let i = 0; i < layers.length; i++) {
      const layer  = layers[i];
      const canvas = document.getElementById(`layer-canvas-${layer.id}`) as HTMLCanvasElement;
      if (canvas) {
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
        if (blob) {
          dbFrames.push({
            id: `layer-snap-${layer.id}`,
            index: 2 * i + 1,
            timestamp: Date.now(),
            sourceId: `layer-${layer.id}`,
            sourceColor: '#10b981',
            blob
          });
        }
      }

      const mCanvas = document.getElementById(`layer-mask-canvas-${layer.id}`) as HTMLCanvasElement;
      if (mCanvas) {
        const blob = await new Promise<Blob | null>((res) => mCanvas.toBlob((b) => res(b), 'image/png'));
        if (blob) {
          dbFrames.push({
            id: `layer-mask-snap-${layer.id}`,
            index: 2 * i + 2,
            timestamp: Date.now(),
            sourceId: `layer-mask-${layer.id}`,
            sourceColor: '#6b7280',
            blob
          });
        }
      }
    }
    return dbFrames;
  }, [layers]);

  const { triggerSave, triggerSaveAs, isSaving, autosaveNotification } = useProjectSave({
    projectId, setProjectId, projectName, setProjectName,
    type: '3d-painter', frameState: null, customFrames: customFramesSerializer,
    threePainterOptions: { 
      loadedModelName, 
      loadedModelSize, 
      psxEnabled, 
      pixelatorOptions,
      layers: layers.map(l => ({ 
        id: l.id, 
        name: l.name, 
        type: l.type,
        opacity: l.opacity, 
        visible: l.visible, 
        blendMode: l.blendMode,
        fillColor: l.fillColor,
        fillTextureName: l.fillTextureName,
        maskVisible: l.maskVisible,
        maskActive: l.maskActive,
        filters: l.filters
      })) 
    },
    fps: 12, loopMode: 'normal', isDirty, markSaved: () => setIsDirty(false),
  });

  const loadNewModel = async (file: File) => {
    setIsLoadingModel(true); setLoadProgress(0);
    setLoadedModelName(file.name); setLoadedModelSize(file.size);
    modelFileBlobRef.current = file;
    setPbrMaps({});
    try {
      const data = await file.arrayBuffer();
      if (painter) {
        await painter.loadModel(data, file.name);
        initializeLayerCanvases(undefined, painter.getLoadedOriginalTextureImage());
        
        // Analyze model for materials/UDIMs
        const slots = painter.analyzeModel();
        setTextureSlots(slots);

        // Bake smart maps
        try {
          const maps = painter.bakeSmartMaps(canvasResolution, canvasResolution);
          if (maps) {
            setSmartMaps(maps);
          }
        } catch (bakeErr) {
          console.warn('Smart maps baking failed:', bakeErr);
        }

        setIsDirty(true);
        setTimeout(() => { painter.handleResize(); painter.frameModel(); }, 80);
      }
      setIsLoadingModel(false);
    } catch (e) {
      console.error(e);
      alert('Failed to parse 3D model.');
      resetWorkspace();
      setIsLoadingModel(false);
    }
  };

  const initializeLayerCanvases = (
    restoredLayers?: PaintingLayer[],
    originalImage?: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null
  ) => {
    document.querySelectorAll('[id^="layer-canvas-"]').forEach(el => el.remove());
    document.querySelectorAll('[id^="layer-mask-canvas-"]').forEach(el => el.remove());

    if (restoredLayers?.length) {
      restoredLayers.forEach(l => {
        const canvas = document.createElement('canvas');
        canvas.id = `layer-canvas-${l.id}`;
        canvas.width = canvas.height = canvasResolution;
        document.body.appendChild(canvas);
        canvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
        l.canvas = canvas;

        if (l.maskVisible !== undefined) {
          const mCanvas = document.createElement('canvas');
          mCanvas.id = `layer-mask-canvas-${l.id}`;
          mCanvas.width = mCanvas.height = canvasResolution;
          document.body.appendChild(mCanvas);
          mCanvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
          l.maskCanvas = mCanvas;
        }
      });
      setLayers(restoredLayers);
      setActiveLayerId(restoredLayers[restoredLayers.length - 1].id);
      return;
    }
    const baseId  = `layer-${Date.now()}-base`;
    const paintId = `layer-${Date.now()}-paint`;
    const make = (id: string) => {
      const c = document.createElement('canvas');
      c.id = `layer-canvas-${id}`; c.width = c.height = canvasResolution;
      document.body.appendChild(c);
      c.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
      return c;
    };
    const baseCanvas  = make(baseId);
    const baseCtx     = baseCanvas.getContext('2d')!;
    if (originalImage) {
      baseCtx.drawImage(originalImage, 0, 0, canvasResolution, canvasResolution);
    } else {
      baseCtx.fillStyle = '#e4e4e7'; baseCtx.fillRect(0, 0, canvasResolution, canvasResolution);
      baseCtx.strokeStyle = '#a1a1aa'; baseCtx.strokeRect(0, 0, canvasResolution, canvasResolution);
    }
    const paintCanvas = make(paintId);
    setLayers([
      { 
        id: baseId, 
        name: 'Base Texture', 
        type: 'fill', 
        opacity: 1, 
        visible: true, 
        blendMode: 'normal', 
        canvas: baseCanvas,
        fillColor: originalImage ? undefined : '#e4e4e7'
      },
      { 
        id: paintId, 
        name: 'Paint layer 1', 
        type: 'paint', 
        opacity: 1, 
        visible: true, 
        blendMode: 'normal', 
        canvas: paintCanvas 
      },
    ]);
    setActiveLayerId(paintId);
  };

  const resetWorkspace = () => {
    setLoadedModelName(null); setLoadedModelSize(null);
    setLayers([]); setActiveLayerId('');
    setTextureSlots([]);
    setSmartMaps(null);
    setPbrMaps({});
    setCanvasResolutionState(512);
    setTextureTilingState(1.0);
    setMaterialResolution('2k');
    modelFileBlobRef.current = null;
    undoStackRef.current = []; redoStackRef.current = [];
    setIsDirty(false);
    if (painter) painter.clearLoadedModel();
  };

  const analyzeLoadedModel = useCallback(() => {
    if (painter) {
      const slots = painter.analyzeModel();
      setTextureSlots(slots);
    }
  }, [painter]);

  const applyTextureAtlas = useCallback(async (atlasSize: number) => {
    if (!painter) return;
    try {
      const atlasCanvas = await painter.repackAndAtlas(textureSlots, atlasSize);
      
      const baseLayer = layers.find(l => l.name === 'Base Texture' || l.type === 'fill') || layers[0];
      if (baseLayer) {
        const canvas = document.getElementById(`layer-canvas-${baseLayer.id}`) as HTMLCanvasElement;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          canvas.width = atlasSize;
          canvas.height = atlasSize;
          ctx.clearRect(0, 0, atlasSize, atlasSize);
          ctx.drawImage(atlasCanvas, 0, 0, atlasSize, atlasSize);
        }
        
        layers.forEach(layer => {
          const lCanvas = document.getElementById(`layer-canvas-${layer.id}`) as HTMLCanvasElement;
          if (lCanvas && lCanvas !== canvas) {
            const temp = document.createElement('canvas');
            temp.width = lCanvas.width;
            temp.height = lCanvas.height;
            const tempCtx = temp.getContext('2d');
            if (tempCtx) {
              tempCtx.drawImage(lCanvas, 0, 0);
            }
            
            lCanvas.width = atlasSize;
            lCanvas.height = atlasSize;
            const newCtx = lCanvas.getContext('2d');
            if (newCtx) {
              newCtx.drawImage(temp, 0, 0, atlasSize, atlasSize);
            }
          }
          
          if (layer.maskCanvas) {
            const mCanvas = document.getElementById(`layer-mask-canvas-${layer.id}`) as HTMLCanvasElement;
            if (mCanvas) {
              const temp = document.createElement('canvas');
              temp.width = mCanvas.width;
              temp.height = mCanvas.height;
              const tempCtx = temp.getContext('2d');
              if (tempCtx) {
                tempCtx.drawImage(mCanvas, 0, 0);
              }
              
              mCanvas.width = atlasSize;
              mCanvas.height = atlasSize;
              const newCtx = mCanvas.getContext('2d');
              if (newCtx) {
                newCtx.drawImage(temp, 0, 0, atlasSize, atlasSize);
              }
            }
          }
        });

        const compositeCanvas = document.getElementById('three-painter-composite-canvas') as HTMLCanvasElement;
        if (compositeCanvas) {
          compositeCanvas.width = atlasSize;
          compositeCanvas.height = atlasSize;
        }

        setIsDirty(true);
        await compositeAndPixelate();
        
        setTextureSlots(painter.analyzeModel());
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to repack and apply texture atlas.');
    }
  }, [painter, textureSlots, layers, compositeAndPixelate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('project');
    if (!id) return;
    setIsLoadingModel(true); setLoadProgress(10);
    import('@/lib/projectDatabase').then(async ({ getProject }) => {
      try {
        const project = await getProject(id);
        if (!project) { alert('Local project not found.'); setIsLoadingModel(false); return; }
        setProjectId(project.id); setProjectName(project.name);
        const opts = project.metadata.threePainterOptions;
        if (opts) {
          setLoadedModelName(opts.loadedModelName); setLoadedModelSize(opts.loadedModelSize);
          setPsxEnabled(opts.psxEnabled);
          if (opts.pixelatorOptions) setPixelatorOptions(opts.pixelatorOptions);
        }
        const modelFrame = project.frames.find((f: DbProjectFrame) => f.index === 0);
        if (modelFrame) {
          modelFileBlobRef.current = modelFrame.blob;
          if (painter) await painter.loadModel(await modelFrame.blob.arrayBuffer(), opts?.loadedModelName || 'model.glb');
        }
        const restoredLayers: PaintingLayer[] = [];
        const layerMeta = opts?.layers || [];
        for (let i = 0; i < layerMeta.length; i++) {
          const meta  = layerMeta[i];
          const frame = project.frames.find((f: DbProjectFrame) => f.id === `layer-snap-${meta.id}` || f.index === 2 * i + 1 || f.index === i + 1);
          if (frame) {
            const canvas = document.createElement('canvas');
            canvas.id = `layer-canvas-${meta.id}`; canvas.width = canvas.height = 512;
            document.body.appendChild(canvas);
            canvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
            const ctx2d = canvas.getContext('2d')!;
            const img   = new Image();
            img.src = URL.createObjectURL(frame.blob);
            await new Promise((resolve) => { img.onload = () => { ctx2d.drawImage(img, 0, 0); URL.revokeObjectURL(img.src); resolve(null); }; });

            let maskCanvas: HTMLCanvasElement | null = null;
            const maskFrame = project.frames.find((f: DbProjectFrame) => f.id === `layer-mask-snap-${meta.id}` || f.index === 2 * i + 2);
            if (maskFrame) {
              maskCanvas = document.createElement('canvas');
              maskCanvas.id = `layer-mask-canvas-${meta.id}`;
              maskCanvas.width = maskCanvas.height = 512;
              document.body.appendChild(maskCanvas);
              maskCanvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
              const mCtx2d = maskCanvas.getContext('2d')!;
              const mImg   = new Image();
              mImg.src = URL.createObjectURL(maskFrame.blob);
              await new Promise((resolve) => { mImg.onload = () => { mCtx2d.drawImage(mImg, 0, 0); URL.revokeObjectURL(mImg.src); resolve(null); }; });
            }

            restoredLayers.push({ 
              id: meta.id, 
              name: meta.name, 
              type: meta.type || 'paint',
              opacity: meta.opacity, 
              visible: true, 
              blendMode: meta.blendMode, 
              fillColor: meta.fillColor,
              fillTextureName: meta.fillTextureName,
              maskVisible: meta.maskVisible,
              maskActive: meta.maskActive,
              filters: meta.filters,
              canvas,
              maskCanvas
            });
          }
        }
        if (restoredLayers.length) initializeLayerCanvases(restoredLayers);
        setIsDirty(false); setIsLoadingModel(false);
        if (painter) setTimeout(() => { painter.handleResize(); painter.frameModel(); }, 80);
      } catch (err) {
        console.error('Failed to restore project:', err);
        alert('Failed to load project.');
        setIsLoadingModel(false);
      }
    });
  }, [painter]);

  const handleThreePaintStroke = useCallback((u: number, v: number, isStart: boolean, isEnd: boolean) => {
    if (isEnd) { setIsDirty(true); return; }
    const activeLayer = layers.find(l => l.id === activeLayerId);
    if (!activeLayer || !activeLayer.visible) return;

    const isEditingMask = activeLayer.maskActive && activeLayer.maskCanvas;

    // Block painting on Fill Layers when not editing mask
    if (!isEditingMask && activeLayer.type === 'fill') {
      return;
    }

    const canvas = document.getElementById(
      isEditingMask ? `layer-mask-canvas-${activeLayerId}` : `layer-canvas-${activeLayerId}`
    ) as HTMLCanvasElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const x = Math.floor(u * canvas.width);
    const y = Math.floor((1 - v) * canvas.height);
    if (isStart) { undoStackRef.current.push(captureHistorySnapshot()); redoStackRef.current.length = 0; }

    // Grayscale conversion for masks
    let drawColor = brushColor;
    if (isEditingMask) {
      const rgb = hexToRgb(brushColor);
      const gray = Math.round(0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]);
      drawColor = `rgb(${gray},${gray},${gray})`;
    }

    ctx.save();
    if (activeTool === 'bucket') {
      floodFill(ctx, x, y, drawColor);
    } else if (activeTool === 'island-bucket') {
      if (painter) {
        const tris = painter.getUVIslandTrianglesAt(u, v);
        if (tris) {
          ctx.fillStyle = drawColor;
          ctx.beginPath();
          tris.forEach(tri => {
            ctx.moveTo(tri.a.x * canvas.width, (1 - tri.a.y) * canvas.height);
            ctx.lineTo(tri.b.x * canvas.width, (1 - tri.b.y) * canvas.height);
            ctx.lineTo(tri.c.x * canvas.width, (1 - tri.c.y) * canvas.height);
            ctx.closePath();
          });
          ctx.fill();
        }
      }
    } else {
      ctx.lineWidth = brushSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (activeTool === 'eraser') {
        if (isEditingMask) {
          // Erasing on mask draws black (hiding)
          ctx.fillStyle = '#000000';
          ctx.beginPath(); ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.globalCompositeOperation = 'destination-out';
          const rg  = ctx.createRadialGradient(x, y, 0, x, y, brushSize / 2);
          rg.addColorStop(0,            'rgba(0,0,0,1)');
          rg.addColorStop(brushHardness,'rgba(0,0,0,1)');
          rg.addColorStop(1,            'rgba(0,0,0,0)');
          ctx.fillStyle = rg;
          ctx.beginPath(); ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        const rg  = ctx.createRadialGradient(x, y, 0, x, y, brushSize / 2);
        const rgb = isEditingMask ? hexToRgb(drawColor) : hexToRgb(brushColor);
        rg.addColorStop(0,            `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${brushOpacity})`);
        rg.addColorStop(brushHardness,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${brushOpacity})`);
        rg.addColorStop(1,            `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    compositeAndPixelate();
  }, [layers, activeLayerId, activeTool, brushColor, brushSize, brushOpacity, brushHardness, compositeAndPixelate, captureHistorySnapshot, painter]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__threePaintStrokeDispatcher = handleThreePaintStroke;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__threePaintStrokeDispatcher;
    };
  }, [handleThreePaintStroke]);

  const floodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColor: string) => {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const imgData = ctx.getImageData(0, 0, W, H), data = imgData.data;
    const rgb   = hexToRgb(fillColor);
    const si    = (startY * W + startX) * 4;
    const [sR, sG, sB, sA] = [data[si], data[si+1], data[si+2], data[si+3]];
    if (sR === rgb[0] && sG === rgb[1] && sB === rgb[2] && sA === 255) return;
    const queue: [number, number][] = [[startX, startY]];
    const visited = new Set<string>();
    while (queue.length) {
      const [x, y] = queue.shift()!;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const i = (y * W + x) * 4;
      data[i]=rgb[0]; data[i+1]=rgb[1]; data[i+2]=rgb[2]; data[i+3]=255;
      for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
        if (nx>=0 && nx<W && ny>=0 && ny<H) {
          const ni = (ny*W+nx)*4;
          if (Math.abs(data[ni]-sR)<15&&Math.abs(data[ni+1]-sG)<15&&Math.abs(data[ni+2]-sB)<15&&Math.abs(data[ni+3]-sA)<15)
            queue.push([nx,ny]);
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  useEffect(() => {
    return () => {
      document.querySelectorAll('[id^="layer-canvas-"]').forEach(el => el.remove());
      document.querySelectorAll('[id^="layer-mask-canvas-"]').forEach(el => el.remove());
      document.getElementById('three-painter-composite-canvas')?.remove();
    };
  }, []);

  const handleAddLayer = (type: 'paint' | 'fill' = 'paint') => {
    if (layers.length >= 5) return;
    const newId  = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const canvas = document.createElement('canvas');
    canvas.id = `layer-canvas-${newId}`; canvas.width = canvas.height = canvasResolution;
    document.body.appendChild(canvas);
    canvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px';

    if (type === 'fill') {
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#e4e4e7';
      ctx.fillRect(0, 0, canvasResolution, canvasResolution);
    }

    undoStackRef.current.push(captureHistorySnapshot());
    setLayers([...layers, { 
      id: newId, 
      name: `${type === 'fill' ? 'Fill' : 'Paint'} layer ${layers.length}`, 
      type,
      opacity: 1, 
      visible: true, 
      blendMode: 'normal', 
      canvas,
      fillColor: type === 'fill' ? '#e4e4e7' : undefined
    }]);
    setActiveLayerId(newId); setIsDirty(true);
  };

  const handleDeleteLayer = (id: string) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx <= 0) return;
    undoStackRef.current.push(captureHistorySnapshot());
    document.getElementById(`layer-canvas-${id}`)?.remove();
    document.getElementById(`layer-mask-canvas-${id}`)?.remove();
    const remaining = layers.filter(l => l.id !== id);
    setLayers(remaining);
    if (activeLayerId === id) setActiveLayerId(remaining[remaining.length - 1].id);
    setIsDirty(true);
  };

  const updateLayerFillSettings = useCallback((layerId: string, settings: Partial<Pick<PaintingLayer, 'fillColor' | 'fillTextureName' | 'fillTextureUrl'>>) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId) return l;
      const updated = { ...l, ...settings };
      const canvas = document.getElementById(`layer-canvas-${layerId}`) as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (updated.fillTextureUrl) {
          const img = new Image();
          img.src = updated.fillTextureUrl;
          img.onload = () => {
            if (textureTiling > 1.0) {
              const pattern = ctx.createPattern(img, 'repeat');
              if (pattern) {
                const matrix = new DOMMatrix();
                const scaleX = (canvas.width / textureTiling) / img.width;
                const scaleY = (canvas.height / textureTiling) / img.height;
                matrix.scaleSelf(scaleX, scaleY);
                pattern.setTransform(matrix);
                ctx.fillStyle = pattern;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
              } else {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              }
            } else {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
            compositeAndPixelate();
          };
        } else {
          ctx.fillStyle = updated.fillColor || '#e4e4e7';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      return updated;
    }));
    setIsDirty(true);
    compositeAndPixelate();
  }, [compositeAndPixelate, textureTiling]);



  const updateLayerFilters = useCallback((layerId: string, filterOpts: Partial<NonNullable<PaintingLayer['filters']>>) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId) return l;
      const defaultFilters: NonNullable<PaintingLayer['filters']> = { hue: 0, saturation: 1, brightness: 1, contrast: 1, curvesPoints: [0, 128, 128, 255] };
      const filters = l.filters || defaultFilters;
      return { ...l, filters: { ...filters, ...filterOpts } };
    }));
    setIsDirty(true);
    compositeAndPixelate();
  }, [compositeAndPixelate]);

  const toggleMask = useCallback((layerId: string) => {
    undoStackRef.current.push(captureHistorySnapshot());
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId) return l;
      const hasMask = !!l.maskCanvas;
      if (hasMask) {
        document.getElementById(`layer-mask-canvas-${layerId}`)?.remove();
        return { ...l, maskCanvas: null, maskVisible: undefined, maskActive: undefined };
      } else {
        const mCanvas = document.createElement('canvas');
        mCanvas.id = `layer-mask-canvas-${layerId}`;
        mCanvas.width = mCanvas.height = canvasResolution;
        document.body.appendChild(mCanvas);
        mCanvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
        const mCtx = mCanvas.getContext('2d')!;
        mCtx.fillStyle = '#ffffff';
        mCtx.fillRect(0, 0, canvasResolution, canvasResolution);
        return { ...l, maskCanvas: mCanvas, maskVisible: true, maskActive: true };
      }
    }));
    setIsDirty(true);
    compositeAndPixelate();
  }, [captureHistorySnapshot, compositeAndPixelate]);

  const setMaskVisible = useCallback((layerId: string, visible: boolean) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, maskVisible: visible } : l));
    compositeAndPixelate();
  }, [compositeAndPixelate]);

  const setMaskActive = useCallback((layerId: string, active: boolean) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, maskActive: active } : l));
  }, []);

  const handleImportImageToLayer = useCallback((file: File, layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.type === 'fill') {
      const url = URL.createObjectURL(file);
      updateLayerFillSettings(layerId, {
        fillTextureName: file.name,
        fillTextureUrl: url
      });
      return;
    }

    const canvas = document.getElementById(`layer-canvas-${layerId}`) as HTMLCanvasElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      setIsDirty(true);
      compositeAndPixelate();
    };
  }, [layers, updateLayerFillSettings, compositeAndPixelate]);

  const handleClearLayer = useCallback((layerId: string) => {
    const canvas = document.getElementById(`layer-canvas-${layerId}`) as HTMLCanvasElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.type === 'fill') {
      ctx.fillStyle = layer.fillColor || '#e4e4e7';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      const baseLayer = layers[0];
      if (layerId === baseLayer?.id) {
        ctx.fillStyle = '#e4e4e7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#a1a1aa'; ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }
    }
    setIsDirty(true);
    compositeAndPixelate();
  }, [layers, compositeAndPixelate]);

  const bakeModelSmartMaps = useCallback(async () => {
    if (!painter) return;
    try {
      const maps = painter.bakeSmartMaps(canvasResolution, canvasResolution);
      if (maps) {
        setSmartMaps(maps);
      }
    } catch (e) {
      console.warn('Failed to bake smart maps:', e);
    }
  }, [painter, canvasResolution]);

  const applySmartMaterialPreset = useCallback((presetId: string) => {
    undoStackRef.current.push(captureHistorySnapshot());
    
    document.querySelectorAll('[id^="layer-canvas-"]').forEach(el => el.remove());
    document.querySelectorAll('[id^="layer-mask-canvas-"]').forEach(el => el.remove());

    const now = Date.now();
    let newLayers: PaintingLayer[] = [];

    const createLayerCanvas = (id: string, width = canvasResolution, height = canvasResolution) => {
      const c = document.createElement('canvas');
      c.id = `layer-canvas-${id}`;
      c.width = width;
      c.height = height;
      c.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
      document.body.appendChild(c);
      return c;
    };

    if (presetId === 'hand-painted') {
      const baseId = `layer-${now}-base`;
      const baseC = createLayerCanvas(baseId);
      const baseCtx = baseC.getContext('2d')!;
      baseCtx.fillStyle = '#7f8899';
      baseCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      const aoId = `layer-${now}-ao`;
      const aoC = createLayerCanvas(aoId);
      const aoCtx = aoC.getContext('2d')!;
      aoCtx.fillStyle = '#261b30';
      aoCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      const heightId = `layer-${now}-height`;
      const heightC = createLayerCanvas(heightId);
      const heightCtx = heightC.getContext('2d')!;
      heightCtx.fillStyle = '#ffffff';
      heightCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      const edgeId = `layer-${now}-edges`;
      const edgeC = createLayerCanvas(edgeId);
      const edgeCtx = edgeC.getContext('2d')!;
      edgeCtx.fillStyle = '#ebf0ff';
      edgeCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      newLayers = [
        {
          id: baseId,
          name: 'Base Tone',
          type: 'fill',
          opacity: 1.0,
          visible: true,
          blendMode: 'normal',
          canvas: baseC,
          fillColor: '#7f8899',
        },
        {
          id: aoId,
          name: 'Ambient Crevices',
          type: 'fill',
          opacity: 0.8,
          visible: true,
          blendMode: 'multiply',
          canvas: aoC,
          fillColor: '#261b30',
          smartMaskType: 'cavities',
          smartMaskIntensity: 0.85,
          smartMaskThreshold: 0.2,
          smartMaskContrast: 1.6,
          shadowTintEnabled: true,
          shadowTintColor: '#261b30',
        },
        {
          id: heightId,
          name: 'Height Ambient',
          type: 'fill',
          opacity: 0.35,
          visible: true,
          blendMode: 'overlay',
          canvas: heightC,
          fillColor: '#ffffff',
          smartMaskType: 'height',
          smartMaskIntensity: 0.5,
          smartMaskThreshold: 0.0,
          smartMaskContrast: 1.0,
        },
        {
          id: edgeId,
          name: 'Stylized Edge Highlights',
          type: 'fill',
          opacity: 0.75,
          visible: true,
          blendMode: 'normal',
          canvas: edgeC,
          fillColor: '#ebf0ff',
          smartMaskType: 'edges',
          smartMaskIntensity: 0.75,
          smartMaskThreshold: 0.35,
          smartMaskContrast: 2.2,
        }
      ];
    } else if (presetId === 'scratched-metal') {
      const baseId = `layer-${now}-base`;
      const baseC = createLayerCanvas(baseId);
      const baseCtx = baseC.getContext('2d')!;
      baseCtx.fillStyle = '#3f444a';
      baseCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      const dirtId = `layer-${now}-dirt`;
      const dirtC = createLayerCanvas(dirtId);
      const dirtCtx = dirtC.getContext('2d')!;
      dirtCtx.fillStyle = '#382a20';
      dirtCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      const scratchesId = `layer-${now}-scratches`;
      const scratchesC = createLayerCanvas(scratchesId);
      const scratchesCtx = scratchesC.getContext('2d')!;
      scratchesCtx.fillStyle = '#e5e7eb';
      scratchesCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      newLayers = [
        {
          id: baseId,
          name: 'Gunmetal Base',
          type: 'fill',
          opacity: 1.0,
          visible: true,
          blendMode: 'normal',
          canvas: baseC,
          fillColor: '#3f444a',
        },
        {
          id: dirtId,
          name: 'Cavity Rust & Dirt',
          type: 'fill',
          opacity: 0.75,
          visible: true,
          blendMode: 'multiply',
          canvas: dirtC,
          fillColor: '#382a20',
          smartMaskType: 'cavities',
          smartMaskIntensity: 0.8,
          smartMaskThreshold: 0.15,
          smartMaskContrast: 1.5,
        },
        {
          id: scratchesId,
          name: 'Worn Edges (Scratches)',
          type: 'fill',
          opacity: 0.9,
          visible: true,
          blendMode: 'normal',
          canvas: scratchesC,
          fillColor: '#e5e7eb',
          smartMaskType: 'edges',
          smartMaskIntensity: 0.9,
          smartMaskThreshold: 0.4,
          smartMaskContrast: 3.0,
        }
      ];
    } else if (presetId === 'ancient-stone') {
      const baseId = `layer-${now}-base`;
      const baseC = createLayerCanvas(baseId);
      const baseCtx = baseC.getContext('2d')!;
      baseCtx.fillStyle = '#5c636e';
      baseCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      const mossId = `layer-${now}-moss`;
      const mossC = createLayerCanvas(mossId);
      const mossCtx = mossC.getContext('2d')!;
      mossCtx.fillStyle = '#2f4233';
      mossCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      const edgeId = `layer-${now}-edges`;
      const edgeC = createLayerCanvas(edgeId);
      const edgeCtx = edgeC.getContext('2d')!;
      edgeCtx.fillStyle = '#c5cad4';
      edgeCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      newLayers = [
        {
          id: baseId,
          name: 'Stone Base',
          type: 'fill',
          opacity: 1.0,
          visible: true,
          blendMode: 'normal',
          canvas: baseC,
          fillColor: '#5c636e',
        },
        {
          id: mossId,
          name: 'Crevice Moss & Grime',
          type: 'fill',
          opacity: 0.8,
          visible: true,
          blendMode: 'normal',
          canvas: mossC,
          fillColor: '#2f4233',
          smartMaskType: 'cavities',
          smartMaskIntensity: 0.8,
          smartMaskThreshold: 0.25,
          smartMaskContrast: 1.4,
        },
        {
          id: edgeId,
          name: 'Stone Highlights',
          type: 'fill',
          opacity: 0.7,
          visible: true,
          blendMode: 'normal',
          canvas: edgeC,
          fillColor: '#c5cad4',
          smartMaskType: 'edges',
          smartMaskIntensity: 0.7,
          smartMaskThreshold: 0.35,
          smartMaskContrast: 1.8,
        }
      ];
    } else if (presetId === 'cel-shaded') {
      const baseId = `layer-${now}-base`;
      const baseC = createLayerCanvas(baseId);
      const baseCtx = baseC.getContext('2d')!;
      baseCtx.fillStyle = '#e23c52';
      baseCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      const shadowId = `layer-${now}-shadow`;
      const shadowC = createLayerCanvas(shadowId);
      const shadowCtx = shadowC.getContext('2d')!;
      shadowCtx.fillStyle = '#7a1728';
      shadowCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      const highlightId = `layer-${now}-highlight`;
      const highlightC = createLayerCanvas(highlightId);
      const highlightCtx = highlightC.getContext('2d')!;
      highlightCtx.fillStyle = '#ffd2d7';
      highlightCtx.fillRect(0, 0, canvasResolution, canvasResolution);

      newLayers = [
        {
          id: baseId,
          name: 'Flat Base Tone',
          type: 'fill',
          opacity: 1.0,
          visible: true,
          blendMode: 'normal',
          canvas: baseC,
          fillColor: '#e23c52',
        },
        {
          id: shadowId,
          name: 'Banded Shadows',
          type: 'fill',
          opacity: 0.95,
          visible: true,
          blendMode: 'normal',
          canvas: shadowC,
          fillColor: '#7a1728',
          smartMaskType: 'cavities',
          smartMaskIntensity: 0.9,
          smartMaskThreshold: 0.2,
          smartMaskContrast: 8.0,
          quantizeColorsEnabled: true,
          quantizeColorCount: 2,
        },
        {
          id: highlightId,
          name: 'Banded Highlights',
          type: 'fill',
          opacity: 0.75,
          visible: true,
          blendMode: 'normal',
          canvas: highlightC,
          fillColor: '#ffd2d7',
          smartMaskType: 'edges',
          smartMaskIntensity: 0.75,
          smartMaskThreshold: 0.45,
          smartMaskContrast: 8.0,
          quantizeColorsEnabled: true,
          quantizeColorCount: 2,
        }
      ];
    } else {
      return;
    }

    setLayers(newLayers);
    setActiveLayerId(newLayers[newLayers.length - 1].id);
    setIsDirty(true);
    setTimeout(() => compositeAndPixelate(), 0);
  }, [captureHistorySnapshot, compositeAndPixelate]);

  const updateLayerSmartMaskSettings = useCallback((
    layerId: string,
    settings: Partial<Pick<PaintingLayer, 'smartMaskType' | 'smartMaskContrast' | 'smartMaskThreshold' | 'smartMaskIntensity' | 'smartMaskInvert' | 'shadowTintEnabled' | 'shadowTintColor' | 'quantizeColorsEnabled' | 'quantizeColorCount'>>
  ) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId) return l;
      return { ...l, ...settings };
    }));
    setIsDirty(true);
    setTimeout(() => compositeAndPixelate(), 0);
  }, [compositeAndPixelate]);

  const handleUpdateLightingSettings = (settings: Partial<LightingSettings>) => {
    setLightingSettings(prev => ({ ...prev, ...settings } as LightingSettings));
  };

  const togglePanel = useCallback((panelId: string) => {
    const next = new Set(visiblePanels);
    if (next.has(panelId)) { next.delete(panelId); dockLayoutRef.current?.removeTab(panelId); }
    else                   { next.add(panelId);    dockLayoutRef.current?.addTab(panelId); }
    setVisiblePanels(next);
  }, [visiblePanels]);

  const resetLayout = useCallback(() => {
    dockLayoutRef.current?.resetLayout();
    setVisiblePanels(new Set(['3d-preview','2d-preview','brush-panel','layers-panel','lighting-panel','texture-maps','pixelate-panel','export-panel','ai-generation']));
  }, []);

  const contextValue = useMemo(() => ({
    projectId, projectName, setProjectName, isSaving, autosaveNotification,
    loadedModelName, loadedModelSize, isModelLoaded, loadNewModel, resetWorkspace, isLoadingModel, loadProgress,
    layers, activeLayerId, setActiveLayerId,
    addLayer: handleAddLayer,
    deleteLayer: handleDeleteLayer,
    toggleLayerVisibility: (id: string) => setLayers(prev => prev.map(l => l.id===id ? {...l, visible: !l.visible} : l)),
    setLayerOpacity:   (id: string, opacity: number)                      => setLayers(prev => prev.map(l => l.id===id ? {...l, opacity}    : l)),
    setLayerBlendMode: (id: string, blendMode: PaintingLayer['blendMode']) => setLayers(prev => prev.map(l => l.id===id ? {...l, blendMode} : l)),
    reorderLayers: (from: number, to: number) => {
      if (from===0||to===0) return;
      undoStackRef.current.push(captureHistorySnapshot());
      const arr = [...layers]; const [m] = arr.splice(from,1); arr.splice(to,0,m);
      setLayers(arr); setIsDirty(true);
    },
    importImageToLayer: handleImportImageToLayer,
    clearLayer: handleClearLayer,
    toggleMask,
    setMaskVisible,
    setMaskActive,
    updateLayerFillSettings,
    updateLayerFilters,
    updateLayerSmartMaskSettings,
    activeTool, setActiveTool, brushColor, setBrushColor,
    brushSize, setBrushSize, brushOpacity, setBrushOpacity, brushHardness, setBrushHardness,
    pixelatorOptions,
    updatePixelatorOptions: (opts: Partial<PixelatorOptions>) => setPixelatorOptions(prev => ({...prev,...opts})),
    psxEnabled, setPsxEnabled, isPaintMode, setIsPaintMode,
    shadingMode, setShadingMode,
    activeLightingPresetId, setActiveLightingPresetId,
    lightingSettings, updateLightingSettings: handleUpdateLightingSettings,
    painter, setPainterInstance: setPainter,
    undo, redo, canUndo, canRedo, isDirty, triggerSave, triggerSaveAs,
    visiblePanels, togglePanel, resetLayout,
    textureSlots, setTextureSlots, analyzeLoadedModel, applyTextureAtlas,
    pbrMaps, setPbrMap,
    canvasResolution, setCanvasResolution,
    textureTiling, setTextureTiling,
    materialResolution, setMaterialResolution,
  }), [
    projectId, projectName, setProjectName, isSaving, autosaveNotification,
    loadedModelName, loadedModelSize, isModelLoaded, loadNewModel, resetWorkspace, isLoadingModel, loadProgress,
    layers, activeLayerId, setActiveLayerId,
    handleAddLayer, handleDeleteLayer, captureHistorySnapshot,
    handleImportImageToLayer, handleClearLayer,
    toggleMask, setMaskVisible, setMaskActive, updateLayerFillSettings, updateLayerFilters, updateLayerSmartMaskSettings,
    activeTool, setActiveTool, brushColor, setBrushColor,
    brushSize, setBrushSize, brushOpacity, setBrushOpacity, brushHardness, setBrushHardness,
    pixelatorOptions, psxEnabled, setPsxEnabled, isPaintMode, setIsPaintMode,
    shadingMode, setShadingMode, activeLightingPresetId, setActiveLightingPresetId,
    lightingSettings, handleUpdateLightingSettings, painter, setPainter,
    undo, redo, canUndo, canRedo, isDirty, triggerSave, triggerSaveAs,
    visiblePanels, togglePanel, resetLayout,
    textureSlots, analyzeLoadedModel, applyTextureAtlas,
    smartMaps, bakeModelSmartMaps, applySmartMaterialPreset,
    pbrMaps, setPbrMap,
    canvasResolution, setCanvasResolution,
    textureTiling, setTextureTiling,
    materialResolution, setMaterialResolution,
  ]);

  return (
    <ThreePainterProvider value={contextValue}>
      <div className={styles.dockContainer}>
        <header className={styles.header}>
          <ThreePainterMenuBar />
          <div className={styles.headerInfo}>
            {isModelLoaded && (
              <span className={styles.modelTag}>
                📦 {loadedModelName} ({(loadedModelSize! / 1024 / 1024).toFixed(2)} MB)
              </span>
            )}
          </div>
        </header>
        <ThreePainterDockLayout ref={dockLayoutRef} onVisiblePanelsChange={setVisiblePanels} />
      </div>
    </ThreePainterProvider>
  );
}
