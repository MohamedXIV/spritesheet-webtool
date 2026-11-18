'use client';

/**
 * PreviewPlayer - Dual-mode Preview & Photoshop-grade Canvas Editor.
 * - Preview mode: Real-time animation playback with loop modes, live outline/pixelation cache,
 *   background modes, and smart auto-sleep.
 * - Edit mode: Full Photoshop-inspired canvas suite with layers, masks, Copy-on-Write editing,
 *   selections, move/transform, pixel grid, onion skinning, zoom/pan, and 30-step Undo/Redo.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { FrameData, LayerPixelData, ProjectLayer } from '@/types';
import { LoopMode } from './Timeline';
import { addOutline, OutlineOptions } from '@/lib/outlineGenerator';
import { pixelateImage, PixelatorOptions } from '@/lib/pixelator';
import { resolveFrameDurationMs } from '@/lib/gifTiming';
import { useOptionalEditorContext } from '@/contexts/EditorContext';
import {
  DEFAULT_FILL_CONFIG,
  LiveLayerOverride,
  renderLayerTreeToCanvas,
  resolveLayerPixelData,
} from '@/lib/layerCompositor';
import {
  DEFAULT_TOOL_SETTINGS,
  EditorToolId,
  SelectionMask,
  createMagicWandSelection,
  createPolygonSelection,
  createRectSelection,
  drawBrushSegment,
  drawCloneSegment,
  drawGradientOverlay,
  drawShapePreview,
  enforceSelectionClip,
  floodFillCanvas,
  invertSelectionMask,
  rasterizeTextToCanvas,
  renderSelectionMarchingAnts,
  rgbaToHex,
} from '@/lib/canvasTools';
import { EditorToolRail } from './EditorToolRail';
import { EditorOptionsBar } from './EditorOptionsBar';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import styles from './PreviewPlayer.module.css';

export type BackgroundMode = 'none' | 'checkerboard' | 'color';

interface PreviewPlayerProps {
  frames: FrameData[];
  fps: number;
  currentFrame: number;
  onFrameChange: (index: number) => void;
  loopMode: LoopMode;
  outlineOptions?: Partial<OutlineOptions>;
  backgroundMode?: BackgroundMode;
  backgroundColor?: string;
  onBackgroundModeChange?: (mode: BackgroundMode) => void;
  onBackgroundColorChange?: (color: string) => void;
  pixelatorOptions?: PixelatorOptions;
}

interface FloatingTransformState {
  frameId: string;
  layerId: string;
  baseCanvas: HTMLCanvasElement;
  floatCanvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragHandleId = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

function isBitmapValid(bitmap: ImageBitmap | null | undefined): bitmap is ImageBitmap {
  if (!bitmap) return false;
  try {
    return bitmap.width > 0 && bitmap.height > 0;
  } catch {
    return false;
  }
}

function fillScratchSync(
  layer: ProjectLayer,
  pixelData: LayerPixelData | undefined,
  target: 'layer' | 'mask',
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d')!;
  if (target === 'mask') {
    if (isBitmapValid(pixelData?.maskBitmap)) {
      ctx.drawImage(pixelData.maskBitmap, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return canvas;
  }

  if (layer.type === 'fill') {
    ctx.fillStyle = (layer.fillConfig ?? DEFAULT_FILL_CONFIG).color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (isBitmapValid(pixelData?.bitmap)) {
    ctx.drawImage(pixelData.bitmap, pixelData?.offsetX ?? 0, pixelData?.offsetY ?? 0);
  }
  return canvas;
}

export function PreviewPlayer({
  frames,
  fps,
  currentFrame,
  onFrameChange,
  loopMode,
  outlineOptions,
  backgroundMode = 'none',
  backgroundColor = '#1a1a2e',
  onBackgroundModeChange,
  onBackgroundColorChange,
  pixelatorOptions,
}: PreviewPlayerProps) {
  const editorCtx = useOptionalEditorContext();

  // Bind Edit Mode + Layers + Tools cleanly to EditorContext with safe fallbacks
  const [localEditMode, setLocalEditMode] = useState(false);
  const editMode = editorCtx?.editMode ?? localEditMode;
  const setEditMode = editorCtx?.setEditMode ?? setLocalEditMode;

  const [localToolSettings, setLocalToolSettings] = useState(DEFAULT_TOOL_SETTINGS);
  const toolSettings = editorCtx?.toolSettings ?? localToolSettings;
  const setToolSettings = editorCtx?.setToolSettings ?? setLocalToolSettings;

  const [localSelectionMask, setLocalSelectionMask] = useState<SelectionMask | null>(null);
  const selectionMask = editorCtx?.selectionMask !== undefined ? editorCtx.selectionMask : localSelectionMask;
  const setSelectionMask = editorCtx?.setSelectionMask ?? setLocalSelectionMask;

  const editTarget = editorCtx?.editTarget ?? 'layer';
  const maskSoloLayerId = editorCtx?.maskSoloLayerId ?? null;
  const setMaskSoloLayerId = editorCtx?.setMaskSoloLayerId ?? (() => {});
  const globalLayers = useMemo(() => editorCtx?.globalLayers ?? [], [editorCtx?.globalLayers]);
  const activeLayerId = editorCtx?.activeLayerId ?? '';

  const onionSkinEnabled = editorCtx?.onionSkinEnabled ?? false;
  const setOnionSkinEnabled = editorCtx?.setOnionSkinEnabled ?? (() => {});
  const onionSkinPrevFrames = editorCtx?.onionSkinPrevFrames ?? 1;
  const setOnionSkinPrevFrames = editorCtx?.setOnionSkinPrevFrames ?? (() => {});
  const onionSkinNextFrames = editorCtx?.onionSkinNextFrames ?? 0;
  const setOnionSkinNextFrames = editorCtx?.setOnionSkinNextFrames ?? (() => {});
  const onionSkinOpacity = editorCtx?.onionSkinOpacity ?? 0.4;
  const setOnionSkinOpacity = editorCtx?.setOnionSkinOpacity ?? (() => {});

  const commitFrameLayerEdit = editorCtx?.commitFrameLayerEdit;
  const commitLayerOffset = editorCtx?.commitLayerOffset;
  const maskFromSelection = editorCtx?.maskFromSelection;

  const activeLayer = useMemo(
    () => globalLayers.find(l => l.id === activeLayerId) ?? globalLayers[0],
    [globalLayers, activeLayerId]
  );

  // Playback refs & states
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const directionRef = useRef<1 | -1>(1);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // Live Preview & Auto-Sleep states
  const [livePreviewEnabled, setLivePreviewEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pixelator-live-preview');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });
  const [autoSleepEnabled, setAutoSleepEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pixelator-live-preview-autosleep');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });
  const [isAsleep, setIsAsleep] = useState<boolean>(false);
  const lastTweakTimeRef = useRef<number>(0);
  const processedCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
  const currentOptionsHashRef = useRef<string>('');

  // Edit Mode viewport & canvas refs
  const viewportRef = useRef<HTMLDivElement>(null);
  const editDisplayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [zoom, setZoom] = useState<number>(4);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showPixelGrid, setShowPixelGrid] = useState(true);
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [liveRenderTick, setLiveRenderTick] = useState(0);
  const [editWarning, setEditWarning] = useState<string | null>(null);

  // Tool interaction refs
  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ clientX: 0, clientY: 0, panX: 0, panY: 0 });
  const lastImgPtRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartImgPtRef = useRef<{ x: number; y: number } | null>(null);
  const lassoPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const preStrokeSnapshotRef = useRef<ImageData | null>(null);
  const liveOverrideRef = useRef<LiveLayerOverride | undefined>(undefined);
  const activeStrokeTargetRef = useRef<'layer' | 'mask'>('layer');
  const activeStrokeOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeOffsetDragRef = useRef<{ startOx: number; startOy: number; curOx: number; curOy: number } | null>(null);

  // Clone Stamp state
  const [cloneSource, setCloneSource] = useState<{ x: number; y: number } | null>(null);
  const cloneSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const cloneOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Floating selection Transform state
  const [transformState, setTransformState] = useState<FloatingTransformState | null>(null);
  const transformDragRef = useRef<{
    handle: DragHandleId;
    startPt: { x: number; y: number };
    initX: number;
    initY: number;
    initW: number;
    initH: number;
  } | null>(null);

  // Inline Text input overlay
  const [textInputState, setTextInputState] = useState<{
    imgX: number;
    imgY: number;
    value: string;
  } | null>(null);

  // Marching ants animation phase
  const dashOffsetRef = useRef(0);

  const safeIndex = Math.max(0, Math.min(currentFrame, Math.max(0, frames.length - 1)));
  const currentFrameObj = frames[safeIndex];
  const frameWidth = currentFrameObj && isBitmapValid(currentFrameObj.bitmap) ? currentFrameObj.bitmap.width : 0;
  const frameHeight = currentFrameObj && isBitmapValid(currentFrameObj.bitmap) ? currentFrameObj.bitmap.height : 0;

  // Pause playback automatically when entering Edit Mode
  const handleModeSwitch = useCallback((toEdit: boolean) => {
    if (toEdit) {
      setIsPlaying(false);
    }
    setEditMode(toEdit);
  }, [setEditMode]);

  // Fit frame cleanly into viewport
  const fitToViewport = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || frameWidth === 0 || frameHeight === 0) return;
    const rect = vp.getBoundingClientRect();
    const availW = Math.max(40, rect.width - 48);
    const availH = Math.max(40, rect.height - 48);
    const fitZoom = Math.max(0.5, Math.min(24, Math.min(availW / frameWidth, availH / frameHeight)));
    setZoom(Number(fitZoom.toFixed(2)));
    setPan({ x: 0, y: 0 });
  }, [frameWidth, frameHeight]);

  // Auto-fit when entering editMode or first loading frame dimensions
  const prevFitDimsRef = useRef<string>('');
  useEffect(() => {
    if (!editMode || frameWidth === 0 || frameHeight === 0) return;
    const key = `${frameWidth}x${frameHeight}`;
    if (prevFitDimsRef.current !== key) {
      prevFitDimsRef.current = key;
      const timer = setTimeout(fitToViewport, 20);
      return () => clearTimeout(timer);
    }
  }, [editMode, frameWidth, frameHeight, fitToViewport]);

  // --- Preview Mode Cache & Playback ---
  const clearProcessedCache = useCallback(() => {
    processedCacheRef.current.forEach(bitmap => {
      try { bitmap.close(); } catch {}
    });
    processedCacheRef.current.clear();
  }, []);

  useEffect(() => {
    const hash = `${JSON.stringify(outlineOptions || {})}|${JSON.stringify(pixelatorOptions || {})}`;
    if (currentOptionsHashRef.current !== hash) {
      clearProcessedCache();
      currentOptionsHashRef.current = hash;
    }
    lastTweakTimeRef.current = Date.now();
    const timer = setTimeout(() => setIsAsleep(false), 0);
    return () => clearTimeout(timer);
  }, [outlineOptions, pixelatorOptions, clearProcessedCache]);

  useEffect(() => {
    if (!autoSleepEnabled) {
      return;
    }
    const interval = setInterval(() => {
      if (Date.now() - lastTweakTimeRef.current > 4000) {
        setIsAsleep(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [autoSleepEnabled]);

  useEffect(() => {
    return () => {
      clearProcessedCache();
    };
  }, [frames, clearProcessedCache]);

  const handleToggleLivePreview = (val: boolean) => {
    setLivePreviewEnabled(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pixelator-live-preview', val ? 'true' : 'false');
    }
    if (!val) clearProcessedCache();
  };

  const handleToggleAutoSleep = (val: boolean) => {
    setAutoSleepEnabled(val);
    if (!val) {
      setIsAsleep(false);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('pixelator-live-preview-autosleep', val ? 'true' : 'false');
    }
    if (!val) setIsAsleep(false);
  };

  const drawCheckerboard = (ctx: CanvasRenderingContext2D, width: number, height: number, tileSize = 16) => {
    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        ctx.fillStyle = ((x / tileSize + y / tileSize) % 2) ? '#e0e0e0' : '#ffffff';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  };

  // Render Preview Mode Canvas
  useEffect(() => {
    if (editMode) return;
    const drawFrame = async () => {
      const canvas = canvasRef.current;
      if (!canvas || frames.length === 0) return;
      const frame = frames[safeIndex];
      if (!frame?.bitmap || !isBitmapValid(frame.bitmap)) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        if (canvas.width !== frame.bitmap.width || canvas.height !== frame.bitmap.height) {
          canvas.width = frame.bitmap.width;
          canvas.height = frame.bitmap.height;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (backgroundMode === 'checkerboard') {
          drawCheckerboard(ctx, canvas.width, canvas.height);
        } else if (backgroundMode === 'color') {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        let displayBitmap = frame.bitmap;
        let outlineBitmap: ImageBitmap | null = null;
        let pixelatedBitmap: ImageBitmap | null = null;

        const isRealTime = livePreviewEnabled && (!isAsleep || processedCacheRef.current.has(frame.id));
        if (isRealTime) {
          const cached = processedCacheRef.current.get(frame.id);
          if (cached && isBitmapValid(cached)) {
            displayBitmap = cached;
          } else {
            if (outlineOptions?.enabled) {
              displayBitmap = await addOutline(frame.bitmap, outlineOptions);
              outlineBitmap = displayBitmap;
            }
            if (pixelatorOptions?.enabled) {
              displayBitmap = await pixelateImage(displayBitmap, pixelatorOptions);
              pixelatedBitmap = displayBitmap;
            }
            if (isBitmapValid(displayBitmap)) {
              try {
                const cacheCanvas = document.createElement('canvas');
                cacheCanvas.width = displayBitmap.width;
                cacheCanvas.height = displayBitmap.height;
                const cacheCtx = cacheCanvas.getContext('2d')!;
                cacheCtx.drawImage(displayBitmap, 0, 0);
                const cacheClone = await createImageBitmap(cacheCanvas);
                processedCacheRef.current.set(frame.id, cacheClone);
              } catch (e) {
                console.warn('Failed to cache pre-rendered frame:', frame.id, e);
              }
            }
          }
        }

        ctx.drawImage(displayBitmap, 0, 0);
        if (outlineBitmap) {
          try { outlineBitmap.close(); } catch {}
        }
        if (pixelatedBitmap) {
          try { pixelatedBitmap.close(); } catch {}
        }
      } catch (error) {
        console.debug('Frame bitmap drawing unavailable:', error);
      }
    };
    drawFrame();
  }, [editMode, frames, safeIndex, outlineOptions, backgroundMode, backgroundColor, pixelatorOptions, livePreviewEnabled, isAsleep]);

  // Animation playback loop
  const playingFrameDurationMs = resolveFrameDurationMs(frames[safeIndex], fps);
  useEffect(() => {
    if (!isPlaying || editMode || frames.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const frameInterval = playingFrameDurationMs;
    const animate = (timestamp: number) => {
      const elapsed = timestamp - lastFrameTimeRef.current;
      if (elapsed >= frameInterval) {
        lastFrameTimeRef.current = timestamp - (elapsed % frameInterval);
        let nextFrame: number;
        switch (loopMode) {
          case 'reverse':
            nextFrame = safeIndex - 1;
            if (nextFrame < 0) nextFrame = frames.length - 1;
            break;
          case 'pingpong':
            nextFrame = safeIndex + directionRef.current;
            if (nextFrame >= frames.length) {
              directionRef.current = -1;
              nextFrame = frames.length - 2;
            } else if (nextFrame < 0) {
              directionRef.current = 1;
              nextFrame = 1;
            }
            if (nextFrame < 0) nextFrame = 0;
            if (nextFrame >= frames.length) nextFrame = frames.length - 1;
            break;
          case 'normal':
          default:
            nextFrame = (safeIndex + 1) % frames.length;
            break;
        }
        onFrameChange(nextFrame);
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    lastFrameTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, editMode, fps, frames.length, safeIndex, onFrameChange, loopMode, playingFrameDurationMs]);

  // --- Edit Mode Compositor Render ---
  useEffect(() => {
    if (!editMode || !currentFrameObj || frameWidth === 0 || frameHeight === 0) return;
    const canvas = editDisplayCanvasRef.current;
    if (!canvas) return;

    if (canvas.width !== frameWidth || canvas.height !== frameHeight) {
      canvas.width = frameWidth;
      canvas.height = frameHeight;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, frameWidth, frameHeight);

    // Mask Solo View (Alt+Click mask thumbnail)
    if (maskSoloLayerId) {
      const soloLayer = globalLayers.find(l => l.id === maskSoloLayerId);
      const override = liveOverrideRef.current;
      const useOverride = override && override.layerId === maskSoloLayerId && override.target === 'mask';
      if (useOverride) {
        ctx.save();
        if (soloLayer?.maskInverted) ctx.filter = 'invert(1)';
        ctx.drawImage(override.canvas, 0, 0, frameWidth, frameHeight);
        ctx.restore();
        return;
      }
      const pData = soloLayer ? resolveLayerPixelData(soloLayer, currentFrameObj.layers) : undefined;
      if (isBitmapValid(pData?.maskBitmap)) {
        ctx.save();
        if (soloLayer?.maskInverted) ctx.filter = 'invert(1)';
        ctx.drawImage(pData.maskBitmap, 0, 0, frameWidth, frameHeight);
        ctx.restore();
        return;
      }
    }

    // Onion skinning (Previous & Next frames behind current layer tree)
    if (onionSkinEnabled) {
      for (let i = 1; i <= onionSkinPrevFrames; i++) {
        const pf = frames[safeIndex - i];
        if (pf && isBitmapValid(pf.bitmap)) {
          ctx.save();
          ctx.globalAlpha = onionSkinOpacity / i;
          ctx.drawImage(pf.bitmap, 0, 0, frameWidth, frameHeight);
          // subtle red tint for prev
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.fillRect(0, 0, frameWidth, frameHeight);
          ctx.restore();
        }
      }
      for (let i = 1; i <= onionSkinNextFrames; i++) {
        const nf = frames[safeIndex + i];
        if (nf && isBitmapValid(nf.bitmap)) {
          ctx.save();
          ctx.globalAlpha = onionSkinOpacity / i;
          ctx.drawImage(nf.bitmap, 0, 0, frameWidth, frameHeight);
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
          ctx.fillRect(0, 0, frameWidth, frameHeight);
          ctx.restore();
        }
      }
    }

    // Build effective LiveLayerOverride (combining active stroke OR active floating transform OR active offset move)
    let effectiveOverride = liveOverrideRef.current;
    if (
      !effectiveOverride &&
      transformState &&
      transformState.frameId === currentFrameObj.id
    ) {
      const compCanvas = document.createElement('canvas');
      compCanvas.width = frameWidth;
      compCanvas.height = frameHeight;
      const cCtx = compCanvas.getContext('2d')!;
      cCtx.drawImage(transformState.baseCanvas, 0, 0);
      cCtx.imageSmoothingEnabled = false;
      cCtx.drawImage(
        transformState.floatCanvas,
        transformState.x,
        transformState.y,
        transformState.w,
        transformState.h
      );
      effectiveOverride = {
        layerId: transformState.layerId,
        target: 'layer',
        canvas: compCanvas,
        offsetX: 0,
        offsetY: 0,
      };
    }

    if (globalLayers.length > 0 && currentFrameObj.layers) {
      renderLayerTreeToCanvas(canvas, globalLayers, currentFrameObj.layers, null, effectiveOverride);
    } else if (isBitmapValid(currentFrameObj.bitmap)) {
      ctx.drawImage(currentFrameObj.bitmap, 0, 0);
    }
  }, [
    editMode,
    currentFrameObj,
    frameWidth,
    frameHeight,
    globalLayers,
    maskSoloLayerId,
    onionSkinEnabled,
    onionSkinPrevFrames,
    onionSkinNextFrames,
    onionSkinOpacity,
    frames,
    safeIndex,
    transformState,
    liveRenderTick,
  ]);

  // Commit or Cancel floating transform helpers
  const handleCommitTransform = useCallback(async () => {
    if (!transformState || !commitFrameLayerEdit) return;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = transformState.baseCanvas.width;
    outCanvas.height = transformState.baseCanvas.height;
    const ctx = outCanvas.getContext('2d')!;
    ctx.drawImage(transformState.baseCanvas, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      transformState.floatCanvas,
      transformState.x,
      transformState.y,
      transformState.w,
      transformState.h
    );
    await commitFrameLayerEdit(transformState.frameId, transformState.layerId, 'layer', outCanvas, 0, 0);
    // Update selection bounds to match transformed rect
    if (selectionMask) {
      setSelectionMask(
        createRectSelection(
          outCanvas.width,
          outCanvas.height,
          transformState.x,
          transformState.y,
          transformState.w,
          transformState.h
        )
      );
    }
    setTransformState(null);
  }, [transformState, commitFrameLayerEdit, selectionMask, setSelectionMask]);

  const handleCancelTransform = useCallback(() => {
    setTransformState(null);
  }, []);

  // Auto-commit pending transform if user switches frame
  const prevFrameIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prevId = prevFrameIdRef.current;
    prevFrameIdRef.current = currentFrameObj?.id;
    if (prevId && prevId !== currentFrameObj?.id) {
      const timer = setTimeout(() => {
        if (transformState) {
          void handleCommitTransform();
        }
        setTextInputState(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentFrameObj?.id, transformState, handleCommitTransform]);

  // --- Overlay Render Loop (Marching Ants, Pixel Grid, Cursor Ring, Transform Box, Drag Preview) ---
  useEffect(() => {
    if (!editMode) return;
    let rafId = 0;

    const drawOverlay = () => {
      const overlay = overlayCanvasRef.current;
      const vp = viewportRef.current;
      if (overlay && vp && frameWidth > 0 && frameHeight > 0) {
        const rect = vp.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        if (overlay.width !== w || overlay.height !== h) {
          overlay.width = w;
          overlay.height = h;
        }
        const ctx = overlay.getContext('2d')!;
        ctx.clearRect(0, 0, w, h);

        const dispW = frameWidth * zoom;
        const dispH = frameHeight * zoom;
        const originX = w / 2 + pan.x - dispW / 2;
        const originY = h / 2 + pan.y - dispH / 2;

        // 1. Crisp Pixel Grid when zoom >= 6
        if (showPixelGrid && zoom >= 6) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let px = 1; px < frameWidth; px++) {
            const sx = Math.round(originX + px * zoom) + 0.5;
            ctx.moveTo(sx, originY);
            ctx.lineTo(sx, originY + dispH);
          }
          for (let py = 1; py < frameHeight; py++) {
            const sy = Math.round(originY + py * zoom) + 0.5;
            ctx.moveTo(originX, sy);
            ctx.lineTo(originX + dispW, sy);
          }
          ctx.stroke();
          ctx.restore();
        }

        // 2. Selection Marching Ants
        if (selectionMask?.bounds) {
          ctx.save();
          ctx.translate(originX, originY);
          renderSelectionMarchingAnts(ctx, selectionMask, zoom, zoom, dashOffsetRef.current);
          ctx.restore();
        }

        // 3. Live Marquee / Lasso drag preview
        if (isDrawingRef.current && dragStartImgPtRef.current && lastImgPtRef.current) {
          if (toolSettings.tool === 'marquee') {
            const x0 = Math.min(dragStartImgPtRef.current.x, lastImgPtRef.current.x);
            const y0 = Math.min(dragStartImgPtRef.current.y, lastImgPtRef.current.y);
            const rw = Math.abs(lastImgPtRef.current.x - dragStartImgPtRef.current.x);
            const rh = Math.abs(lastImgPtRef.current.y - dragStartImgPtRef.current.y);
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(originX + x0 * zoom, originY + y0 * zoom, rw * zoom, rh * zoom);
            ctx.restore();
          } else if (toolSettings.tool === 'lasso' && lassoPointsRef.current.length > 1) {
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.25;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            lassoPointsRef.current.forEach((pt, idx) => {
              const sx = originX + pt.x * zoom;
              const sy = originY + pt.y * zoom;
              if (idx === 0) ctx.moveTo(sx, sy);
              else ctx.lineTo(sx, sy);
            });
            ctx.stroke();
            ctx.restore();
          }
        }

        // 4. Floating Transform Bounding Box & 8 handles
        if (transformState) {
          const bx = originX + transformState.x * zoom;
          const by = originY + transformState.y * zoom;
          const bw = transformState.w * zoom;
          const bh = transformState.h * zoom;

          ctx.save();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(bx, by, bw, bh);

          const handles = [
            [bx, by],
            [bx + bw / 2, by],
            [bx + bw, by],
            [bx + bw, by + bh / 2],
            [bx + bw, by + bh],
            [bx + bw / 2, by + bh],
            [bx, by + bh],
            [bx, by + bh / 2],
          ];
          handles.forEach(([hx, hy]) => {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#0284c7';
            ctx.fillRect(hx - 4, hy - 4, 8, 8);
            ctx.strokeRect(hx - 4, hy - 4, 8, 8);
          });
          ctx.restore();
        }

        // 5. Brush / Eraser / Clone cursor outline
        if (
          cursorCoords &&
          (toolSettings.tool === 'brush' || toolSettings.tool === 'eraser' || toolSettings.tool === 'clone')
        ) {
          const cx = originX + (cursorCoords.x + 0.5) * zoom;
          const cy = originY + (cursorCoords.y + 0.5) * zoom;
          const radius = (toolSettings.brushSize * zoom) / 2;
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1;
          if (toolSettings.pixelPerfect && toolSettings.tool !== 'clone') {
            const boxSize = Math.max(zoom, toolSettings.brushSize * zoom);
            const half = Math.floor(toolSettings.brushSize / 2);
            const sx = originX + (cursorCoords.x - half) * zoom;
            const sy = originY + (cursorCoords.y - half) * zoom;
            ctx.strokeRect(sx, sy, boxSize, boxSize);
          } else {
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(2, radius), 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        // 6. Clone source crosshair indicator
        if (toolSettings.tool === 'clone' && cloneSource) {
          const sx = originX + cloneSource.x * zoom;
          const sy = originY + cloneSource.y * zoom;
          ctx.save();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, 6, 0, Math.PI * 2);
          ctx.moveTo(sx - 9, sy);
          ctx.lineTo(sx + 9, sy);
          ctx.moveTo(sx, sy - 9);
          ctx.lineTo(sx, sy + 9);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (selectionMask?.bounds) {
        dashOffsetRef.current = (dashOffsetRef.current + 0.25) % 16;
      }
      rafId = requestAnimationFrame(drawOverlay);
    };

    rafId = requestAnimationFrame(drawOverlay);
    return () => cancelAnimationFrame(rafId);
  }, [editMode, frameWidth, frameHeight, zoom, pan, showPixelGrid, selectionMask, transformState, cursorCoords, toolSettings, cloneSource]);

  // --- Coordinate Mapping ---
  const clientToImage = useCallback((clientX: number, clientY: number) => {
    const vp = viewportRef.current;
    if (!vp || frameWidth === 0 || frameHeight === 0) return { x: 0, y: 0 };
    const rect = vp.getBoundingClientRect();
    const dispW = frameWidth * zoom;
    const dispH = frameHeight * zoom;
    const originX = rect.left + rect.width / 2 + pan.x - dispW / 2;
    const originY = rect.top + rect.height / 2 + pan.y - dispH / 2;
    return {
      x: Math.floor((clientX - originX) / zoom),
      y: Math.floor((clientY - originY) / zoom),
    };
  }, [frameWidth, frameHeight, zoom, pan]);

  const hitTransformHandle = useCallback((imgPt: { x: number; y: number }): DragHandleId | null => {
    if (!transformState) return null;
    const tol = Math.max(2, 7 / zoom);
    const { x, y, w, h } = transformState;
    const pts: Array<{ id: DragHandleId; hx: number; hy: number }> = [
      { id: 'nw', hx: x, hy: y },
      { id: 'n', hx: x + w / 2, hy: y },
      { id: 'ne', hx: x + w, hy: y },
      { id: 'e', hx: x + w, hy: y + h / 2 },
      { id: 'se', hx: x + w, hy: y + h },
      { id: 's', hx: x + w / 2, hy: y + h },
      { id: 'sw', hx: x, hy: y + h },
      { id: 'w', hx: x, hy: y + h / 2 },
    ];
    for (const p of pts) {
      if (Math.abs(imgPt.x - p.hx) <= tol && Math.abs(imgPt.y - p.hy) <= tol) return p.id;
    }
    if (imgPt.x >= x && imgPt.x <= x + w && imgPt.y >= y && imgPt.y <= y + h) return 'move';
    return null;
  }, [transformState, zoom]);

  const flashWarning = useCallback((msg: string) => {
    setEditWarning(msg);
    setTimeout(() => setEditWarning(prev => (prev === msg ? null : prev)), 2200);
  }, []);

  const canPaintActive = useCallback((): boolean => {
    if (!activeLayer) return false;
    if (activeLayer.locked) {
      flashWarning(`Layer "${activeLayer.name}" is locked.`);
      return false;
    }
    if (editTarget === 'layer' && activeLayer.type !== 'raster') {
      flashWarning(`Cannot paint directly on ${activeLayer.type} layer. Select a Raster layer or its Mask.`);
      return false;
    }
    return true;
  }, [activeLayer, editTarget, flashWarning]);

  // --- Delete selected pixels helper ---
  const clearSelectionPixels = useCallback(async () => {
    if (!selectionMask?.bounds || !currentFrameObj || !activeLayer || !commitFrameLayerEdit) return;
    if (!canPaintActive()) return;
    const target = maskSoloLayerId === activeLayer.id ? 'mask' : editTarget;
    const pData = resolveLayerPixelData(activeLayer, currentFrameObj.layers);
    const canvas = fillScratchSync(activeLayer, pData, target, frameWidth, frameHeight);
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, frameWidth, frameHeight);
    const d = imgData.data;
    const sel = selectionMask.data;
    for (let i = 0; i < sel.length; i++) {
      if (sel[i] > 0) {
        const o = i * 4;
        if (target === 'mask') {
          d[o] = 0;
          d[o + 1] = 0;
          d[o + 2] = 0;
          d[o + 3] = 255;
        } else {
          d[o + 3] = 0;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    await commitFrameLayerEdit(currentFrameObj.id, activeLayer.id, target, canvas, 0, 0);
  }, [selectionMask, currentFrameObj, activeLayer, commitFrameLayerEdit, canPaintActive, maskSoloLayerId, editTarget, frameWidth, frameHeight]);

  // --- Pointer Interactions in Edit Mode ---
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editMode || !currentFrameObj || frameWidth === 0 || frameHeight === 0) return;

    // Middle mouse or Hand tool or Spacebar -> Pan viewport
    if (e.button === 1 || toolSettings.tool === 'hand' || spacePressed) {
      isPanningRef.current = true;
      panStartRef.current = { clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;
    const imgPt = clientToImage(e.clientX, e.clientY);

    // Zoom tool
    if (toolSettings.tool === 'zoom') {
      const factor = e.altKey ? 1 / 1.5 : 1.5;
      setZoom(z => Math.max(0.5, Math.min(32, Number((z * factor).toFixed(2)))));
      return;
    }

    // Eyedropper tool
    if (toolSettings.tool === 'eyedropper') {
      const disp = editDisplayCanvasRef.current;
      if (disp && imgPt.x >= 0 && imgPt.y >= 0 && imgPt.x < frameWidth && imgPt.y < frameHeight) {
        const px = disp.getContext('2d')!.getImageData(imgPt.x, imgPt.y, 1, 1).data;
        const hex = rgbaToHex(px[0], px[1], px[2]);
        setToolSettings(prev =>
          e.altKey ? { ...prev, backgroundColor: hex } : { ...prev, foregroundColor: hex }
        );
      }
      return;
    }

    // Text tool
    if (toolSettings.tool === 'text') {
      if (!canPaintActive()) return;
      setTextInputState({
        imgX: Math.max(0, Math.min(frameWidth - 1, imgPt.x)),
        imgY: Math.max(0, Math.min(frameHeight - 1, imgPt.y)),
        value: '',
      });
      return;
    }

    const selMode: 'replace' | 'add' | 'subtract' = e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace';

    // Marquee selection
    if (toolSettings.tool === 'marquee') {
      isDrawingRef.current = true;
      dragStartImgPtRef.current = imgPt;
      lastImgPtRef.current = imgPt;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Lasso selection
    if (toolSettings.tool === 'lasso') {
      isDrawingRef.current = true;
      dragStartImgPtRef.current = imgPt;
      lastImgPtRef.current = imgPt;
      lassoPointsRef.current = [imgPt];
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Magic Wand selection
    if (toolSettings.tool === 'wand') {
      const targetCanvas = activeLayer && activeLayer.type === 'raster'
        ? fillScratchSync(activeLayer, resolveLayerPixelData(activeLayer, currentFrameObj.layers), 'layer', frameWidth, frameHeight)
        : editDisplayCanvasRef.current;
      if (targetCanvas) {
        const nextSel = createMagicWandSelection(
          targetCanvas,
          imgPt.x,
          imgPt.y,
          toolSettings.tolerance,
          toolSettings.contiguous,
          selectionMask,
          selMode
        );
        setSelectionMask(nextSel.bounds ? nextSel : null);
      }
      return;
    }

    // Move / Transform tool
    if (toolSettings.tool === 'move') {
      if (!activeLayer || activeLayer.locked) {
        if (activeLayer?.locked) flashWarning(`Layer "${activeLayer.name}" is locked.`);
        return;
      }

      if (transformState) {
        const hit = hitTransformHandle(imgPt);
        if (hit) {
          transformDragRef.current = {
            handle: hit,
            startPt: imgPt,
            initX: transformState.x,
            initY: transformState.y,
            initW: transformState.w,
            initH: transformState.h,
          };
          isDrawingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        // Clicked outside box -> commit transform
        void handleCommitTransform();
        return;
      }

      // If selection active on raster layer -> float selected pixels into Transform
      if (selectionMask?.bounds && activeLayer.type === 'raster') {
        const b = selectionMask.bounds;
        const pData = resolveLayerPixelData(activeLayer, currentFrameObj.layers);
        const fullCanvas = fillScratchSync(activeLayer, pData, 'layer', frameWidth, frameHeight);
        const fCtx = fullCanvas.getContext('2d')!;
        const img = fCtx.getImageData(0, 0, frameWidth, frameHeight);

        const floatCanvas = document.createElement('canvas');
        floatCanvas.width = b.w;
        floatCanvas.height = b.h;
        const flCtx = floatCanvas.getContext('2d')!;
        const flImg = flCtx.createImageData(b.w, b.h);

        for (let y = 0; y < b.h; y++) {
          for (let x = 0; x < b.w; x++) {
            const gx = b.x + x;
            const gy = b.y + y;
            const gIdx = gy * frameWidth + gx;
            if (selectionMask.data[gIdx] > 0) {
              const go = gIdx * 4;
              const lo = (y * b.w + x) * 4;
              flImg.data[lo] = img.data[go];
              flImg.data[lo + 1] = img.data[go + 1];
              flImg.data[lo + 2] = img.data[go + 2];
              flImg.data[lo + 3] = img.data[go + 3];
              // Clear underlying
              img.data[go + 3] = 0;
            }
          }
        }
        fCtx.putImageData(img, 0, 0);
        flCtx.putImageData(flImg, 0, 0);

        const nextTf: FloatingTransformState = {
          frameId: currentFrameObj.id,
          layerId: activeLayer.id,
          baseCanvas: fullCanvas,
          floatCanvas,
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
        };
        setTransformState(nextTf);
        transformDragRef.current = {
          handle: 'move',
          startPt: imgPt,
          initX: b.x,
          initY: b.y,
          initW: b.w,
          initH: b.h,
        };
        isDrawingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      // Otherwise drag layer offsetX / offsetY directly (works cleanly even with shared sheet bitmap!)
      const pData = resolveLayerPixelData(activeLayer, currentFrameObj.layers);
      if (isBitmapValid(pData?.bitmap)) {
        const ox = pData?.offsetX ?? 0;
        const oy = pData?.offsetY ?? 0;
        dragStartImgPtRef.current = imgPt;
        activeOffsetDragRef.current = { startOx: ox, startOy: oy, curOx: ox, curOy: oy };
        isDrawingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }

    // Clone Stamp Alt+Click picks source anchor
    if (toolSettings.tool === 'clone' && e.altKey) {
      setCloneSource({ x: imgPt.x, y: imgPt.y });
      return;
    }

    // Painting / Drawing tools: Brush, Eraser, Clone, Bucket, Gradient, Shape
    if (!canPaintActive() || !activeLayer) return;

    const target: 'layer' | 'mask' = maskSoloLayerId === activeLayer.id ? 'mask' : editTarget;
    const pData = resolveLayerPixelData(activeLayer, currentFrameObj.layers);
    const scratch = fillScratchSync(activeLayer, pData, target, frameWidth, frameHeight);
    const sCtx = scratch.getContext('2d')!;

    scratchCanvasRef.current = scratch;
    preStrokeSnapshotRef.current = sCtx.getImageData(0, 0, frameWidth, frameHeight);
    activeStrokeTargetRef.current = target;
    activeStrokeOffsetRef.current = { x: 0, y: 0 };
    liveOverrideRef.current = {
      layerId: activeLayer.id,
      target,
      canvas: scratch,
      offsetX: 0,
      offsetY: 0,
    };

    if (toolSettings.tool === 'bucket') {
      const fillColor = target === 'mask'
        ? (toolSettings.foregroundColor.toLowerCase() === '#000000' ? '#000000' : toolSettings.foregroundColor)
        : toolSettings.foregroundColor;
      floodFillCanvas(
        sCtx,
        imgPt.x,
        imgPt.y,
        fillColor,
        toolSettings.brushOpacity,
        toolSettings.tolerance,
        toolSettings.contiguous,
        selectionMask
      );
      if (commitFrameLayerEdit) {
        void commitFrameLayerEdit(currentFrameObj.id, activeLayer.id, target, scratch, 0, 0);
      }
      liveOverrideRef.current = undefined;
      scratchCanvasRef.current = null;
      preStrokeSnapshotRef.current = null;
      setLiveRenderTick(t => t + 1);
      return;
    }

    if (toolSettings.tool === 'clone') {
      if (!cloneSource) {
        flashWarning('Alt+Click on the canvas first to set the Clone Stamp source.');
        liveOverrideRef.current = undefined;
        scratchCanvasRef.current = null;
        return;
      }
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = frameWidth;
      snapCanvas.height = frameHeight;
      snapCanvas.getContext('2d')!.drawImage(scratch, 0, 0);
      cloneSnapshotRef.current = snapCanvas;
      cloneOffsetRef.current = { x: cloneSource.x - imgPt.x, y: cloneSource.y - imgPt.y };
      drawCloneSegment(
        sCtx,
        snapCanvas,
        imgPt.x,
        imgPt.y,
        imgPt.x,
        imgPt.y,
        cloneOffsetRef.current.x,
        cloneOffsetRef.current.y,
        toolSettings.brushSize,
        toolSettings.brushOpacity
      );
      enforceSelectionClip(scratch, preStrokeSnapshotRef.current, selectionMask);
    } else if (toolSettings.tool === 'brush' || toolSettings.tool === 'eraser') {
      drawBrushSegment(sCtx, imgPt.x, imgPt.y, imgPt.x, imgPt.y, {
        mode: toolSettings.tool,
        color: toolSettings.foregroundColor,
        size: toolSettings.brushSize,
        opacity: toolSettings.brushOpacity,
        hardness: toolSettings.brushHardness,
        pixelPerfect: toolSettings.pixelPerfect,
        alphaLocked: activeLayer.alphaLocked,
        isMask: target === 'mask',
      });
      enforceSelectionClip(scratch, preStrokeSnapshotRef.current, selectionMask);
    }

    isDrawingRef.current = true;
    dragStartImgPtRef.current = imgPt;
    lastImgPtRef.current = imgPt;
    setLiveRenderTick(t => t + 1);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editMode) return;
    const imgPt = clientToImage(e.clientX, e.clientY);
    setCursorCoords(
      imgPt.x >= 0 && imgPt.y >= 0 && imgPt.x < frameWidth && imgPt.y < frameHeight
        ? imgPt
        : null
    );

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      return;
    }

    if (!isDrawingRef.current || !currentFrameObj) return;

    // Selection previews
    if (toolSettings.tool === 'marquee') {
      lastImgPtRef.current = imgPt;
      return;
    }
    if (toolSettings.tool === 'lasso') {
      lastImgPtRef.current = imgPt;
      const pts = lassoPointsRef.current;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(imgPt.x - last.x, imgPt.y - last.y) >= 1) {
        pts.push(imgPt);
      }
      return;
    }

    // Move / Transform drag
    if (toolSettings.tool === 'move') {
      if (transformDragRef.current && transformState) {
        const td = transformDragRef.current;
        const dx = imgPt.x - td.startPt.x;
        const dy = imgPt.y - td.startPt.y;
        setTransformState(prev => {
          if (!prev) return prev;
          let { initX: nx, initY: ny, initW: nw, initH: nh } = td;
          if (td.handle === 'move') {
            nx += dx;
            ny += dy;
          } else {
            if (td.handle.includes('e')) nw = Math.max(2, td.initW + dx);
            if (td.handle.includes('s')) nh = Math.max(2, td.initH + dy);
            if (td.handle.includes('w')) {
              const nextW = Math.max(2, td.initW - dx);
              nx = td.initX + (td.initW - nextW);
              nw = nextW;
            }
            if (td.handle.includes('n')) {
              const nextH = Math.max(2, td.initH - dy);
              ny = td.initY + (td.initH - nextH);
              nh = nextH;
            }
          }
          return { ...prev, x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) };
        });
        return;
      }

      if (activeOffsetDragRef.current && dragStartImgPtRef.current && activeLayer) {
        const pData = resolveLayerPixelData(activeLayer, currentFrameObj.layers);
        if (isBitmapValid(pData?.bitmap)) {
          const dx = imgPt.x - dragStartImgPtRef.current.x;
          const dy = imgPt.y - dragStartImgPtRef.current.y;
          const nextOx = activeOffsetDragRef.current.startOx + dx;
          const nextOy = activeOffsetDragRef.current.startOy + dy;
          activeOffsetDragRef.current.curOx = nextOx;
          activeOffsetDragRef.current.curOy = nextOy;

          const tmp = document.createElement('canvas');
          tmp.width = pData.bitmap.width;
          tmp.height = pData.bitmap.height;
          tmp.getContext('2d')!.drawImage(pData.bitmap, 0, 0);
          liveOverrideRef.current = {
            layerId: activeLayer.id,
            target: 'layer',
            canvas: tmp,
            offsetX: nextOx,
            offsetY: nextOy,
          };
          setLiveRenderTick(t => t + 1);
        }
      }
      return;
    }

    // Painting / Shape / Gradient
    const scratch = scratchCanvasRef.current;
    const pre = preStrokeSnapshotRef.current;
    if (!scratch || !pre || !activeLayer) return;
    const sCtx = scratch.getContext('2d')!;
    const prevPt = lastImgPtRef.current ?? imgPt;

    if (toolSettings.tool === 'brush' || toolSettings.tool === 'eraser') {
      drawBrushSegment(sCtx, prevPt.x, prevPt.y, imgPt.x, imgPt.y, {
        mode: toolSettings.tool,
        color: toolSettings.foregroundColor,
        size: toolSettings.brushSize,
        opacity: toolSettings.brushOpacity,
        hardness: toolSettings.brushHardness,
        pixelPerfect: toolSettings.pixelPerfect,
        alphaLocked: activeLayer.alphaLocked,
        isMask: activeStrokeTargetRef.current === 'mask',
      });
      enforceSelectionClip(scratch, pre, selectionMask);
    } else if (toolSettings.tool === 'clone' && cloneSnapshotRef.current) {
      drawCloneSegment(
        sCtx,
        cloneSnapshotRef.current,
        prevPt.x,
        prevPt.y,
        imgPt.x,
        imgPt.y,
        cloneOffsetRef.current.x,
        cloneOffsetRef.current.y,
        toolSettings.brushSize,
        toolSettings.brushOpacity
      );
      enforceSelectionClip(scratch, pre, selectionMask);
    } else if (toolSettings.tool === 'shape' && dragStartImgPtRef.current) {
      sCtx.putImageData(pre, 0, 0);
      drawShapePreview(sCtx, dragStartImgPtRef.current.x, dragStartImgPtRef.current.y, imgPt.x, imgPt.y, {
        kind: toolSettings.shapeKind,
        color: toolSettings.foregroundColor,
        filled: toolSettings.shapeFilled,
        strokeWidth: toolSettings.shapeStrokeWidth,
        opacity: toolSettings.brushOpacity,
        alphaLocked: activeLayer.alphaLocked,
      });
      enforceSelectionClip(scratch, pre, selectionMask);
    } else if (toolSettings.tool === 'gradient' && dragStartImgPtRef.current) {
      sCtx.putImageData(pre, 0, 0);
      drawGradientOverlay(sCtx, dragStartImgPtRef.current.x, dragStartImgPtRef.current.y, imgPt.x, imgPt.y, {
        kind: toolSettings.gradientKind,
        fgColor: toolSettings.foregroundColor,
        bgColor: toolSettings.backgroundColor,
        toTransparent: toolSettings.gradientToTransparent,
        opacity: toolSettings.brushOpacity,
      });
      enforceSelectionClip(scratch, pre, selectionMask);
    }

    lastImgPtRef.current = imgPt;
    setLiveRenderTick(t => t + 1);
  };

  const handlePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
      return;
    }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}

    const imgPt = clientToImage(e.clientX, e.clientY);
    const selMode: 'replace' | 'add' | 'subtract' = e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace';

    if (toolSettings.tool === 'marquee' && dragStartImgPtRef.current) {
      const rw = Math.abs(imgPt.x - dragStartImgPtRef.current.x);
      const rh = Math.abs(imgPt.y - dragStartImgPtRef.current.y);
      if (rw < 1 && rh < 1) {
        if (selMode === 'replace') setSelectionMask(null);
      } else {
        const nextSel = createRectSelection(
          frameWidth,
          frameHeight,
          dragStartImgPtRef.current.x,
          dragStartImgPtRef.current.y,
          imgPt.x - dragStartImgPtRef.current.x + (imgPt.x >= dragStartImgPtRef.current.x ? 1 : -1),
          imgPt.y - dragStartImgPtRef.current.y + (imgPt.y >= dragStartImgPtRef.current.y ? 1 : -1),
          selectionMask,
          selMode
        );
        setSelectionMask(nextSel.bounds ? nextSel : null);
      }
      dragStartImgPtRef.current = null;
      return;
    }

    if (toolSettings.tool === 'lasso') {
      const pts = lassoPointsRef.current;
      lassoPointsRef.current = [];
      dragStartImgPtRef.current = null;
      if (pts.length >= 3) {
        const nextSel = createPolygonSelection(frameWidth, frameHeight, pts, selectionMask, selMode);
        setSelectionMask(nextSel.bounds ? nextSel : null);
      } else if (selMode === 'replace') {
        setSelectionMask(null);
      }
      return;
    }

    if (toolSettings.tool === 'move') {
      if (transformDragRef.current) {
        transformDragRef.current = null;
        return;
      }
      if (activeOffsetDragRef.current && currentFrameObj && activeLayer && commitLayerOffset) {
        const { startOx, startOy, curOx, curOy } = activeOffsetDragRef.current;
        activeOffsetDragRef.current = null;
        liveOverrideRef.current = undefined;
        if (curOx !== startOx || curOy !== startOy) {
          await commitLayerOffset(currentFrameObj.id, activeLayer.id, curOx, curOy);
        }
        setLiveRenderTick(t => t + 1);
      }
      return;
    }

    // Commit Brush/Eraser/Clone/Shape/Gradient stroke
    const scratch = scratchCanvasRef.current;
    const target = activeStrokeTargetRef.current;
    scratchCanvasRef.current = null;
    preStrokeSnapshotRef.current = null;
    cloneSnapshotRef.current = null;
    dragStartImgPtRef.current = null;
    lastImgPtRef.current = null;
    liveOverrideRef.current = undefined;

    if (scratch && currentFrameObj && activeLayer && commitFrameLayerEdit) {
      await commitFrameLayerEdit(currentFrameObj.id, activeLayer.id, target, scratch, 0, 0);
    }
    setLiveRenderTick(t => t + 1);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!editMode) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom(z => Math.max(0.5, Math.min(32, Number((z * factor).toFixed(2)))));
  };

  // Commit floating inline Text input
  const commitTextInput = useCallback(async () => {
    if (!textInputState || !currentFrameObj || !activeLayer || !commitFrameLayerEdit) {
      setTextInputState(null);
      return;
    }
    const text = textInputState.value;
    if (!text.trim()) {
      setTextInputState(null);
      return;
    }
    const target: 'layer' | 'mask' = maskSoloLayerId === activeLayer.id ? 'mask' : editTarget;
    const pData = resolveLayerPixelData(activeLayer, currentFrameObj.layers);
    const scratch = fillScratchSync(activeLayer, pData, target, frameWidth, frameHeight);
    const sCtx = scratch.getContext('2d')!;
    const pre = sCtx.getImageData(0, 0, frameWidth, frameHeight);

    rasterizeTextToCanvas(sCtx, text, textInputState.imgX, textInputState.imgY, {
      color: toolSettings.foregroundColor,
      fontFamily: toolSettings.fontFamily,
      fontSize: toolSettings.fontSize,
      bold: toolSettings.fontBold,
      opacity: toolSettings.brushOpacity,
    });
    enforceSelectionClip(scratch, pre, selectionMask);
    setTextInputState(null);
    await commitFrameLayerEdit(currentFrameObj.id, activeLayer.id, target, scratch, 0, 0);
  }, [
    textInputState,
    currentFrameObj,
    activeLayer,
    commitFrameLayerEdit,
    maskSoloLayerId,
    editTarget,
    frameWidth,
    frameHeight,
    toolSettings,
    selectionMask,
  ]);

  // --- Edit Mode Photoshop Keyboard Shortcuts ---
  useEffect(() => {
    if (!editMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      const inInput =
        targetEl?.tagName === 'INPUT' ||
        targetEl?.tagName === 'TEXTAREA' ||
        targetEl?.tagName === 'SELECT' ||
        targetEl?.isContentEditable;

      if (e.code === 'Space' && !inInput) {
        e.preventDefault();
        setSpacePressed(true);
        return;
      }

      if (inInput) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'd') {
        e.preventDefault();
        setSelectionMask(null);
        return;
      }
      if (mod && key === '0') {
        e.preventDefault();
        fitToViewport();
        return;
      }
      if (transformState && e.key === 'Enter') {
        e.preventDefault();
        void handleCommitTransform();
        return;
      }
      if (transformState && e.key === 'Escape') {
        e.preventDefault();
        handleCancelTransform();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectionMask?.bounds) {
        e.preventDefault();
        void clearSelectionPixels();
        return;
      }
      if (mod) return;

      const map: Record<string, EditorToolId> = {
        v: 'move',
        m: 'marquee',
        l: 'lasso',
        w: 'wand',
        b: 'brush',
        e: 'eraser',
        s: 'clone',
        g: e.shiftKey ? 'gradient' : 'bucket',
        i: 'eyedropper',
        u: 'shape',
        t: 'text',
        h: 'hand',
        z: 'zoom',
      };
      if (map[key]) {
        e.preventDefault();
        if (transformState && map[key] !== 'move') {
          void handleCommitTransform();
        }
        setToolSettings(prev => ({ ...prev, tool: map[key] }));
        return;
      }

      if (key === 'x') {
        e.preventDefault();
        setToolSettings(prev => ({
          ...prev,
          foregroundColor: prev.backgroundColor,
          backgroundColor: prev.foregroundColor,
        }));
      } else if (key === 'd') {
        e.preventDefault();
        setToolSettings(prev => ({
          ...prev,
          foregroundColor: '#ffffff',
          backgroundColor: '#000000',
        }));
      } else if (e.key === '[') {
        setToolSettings(prev => ({ ...prev, brushSize: Math.max(1, prev.brushSize - 1) }));
      } else if (e.key === ']') {
        setToolSettings(prev => ({ ...prev, brushSize: Math.min(64, prev.brushSize + 1) }));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    editMode,
    setSelectionMask,
    fitToViewport,
    transformState,
    handleCommitTransform,
    handleCancelTransform,
    selectionMask?.bounds,
    clearSelectionPixels,
    setToolSettings,
  ]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const stepBack = () => onFrameChange(Math.max(0, safeIndex - 1));
  const stepForward = () => onFrameChange(Math.min(frames.length - 1, safeIndex + 1));
  const goToStart = () => onFrameChange(0);
  const goToEnd = () => onFrameChange(frames.length - 1);

  const hasFrames = frames.length > 0;
  const loopModeLabel = { normal: '→', pingpong: '↔', reverse: '←' }[loopMode];
  const activeLayerPixelData = activeLayer && currentFrameObj
    ? resolveLayerPixelData(activeLayer, currentFrameObj.layers)
    : undefined;
  const hasMaskOnActive = Boolean(activeLayerPixelData?.maskBitmap);

  // Viewport background style
  const viewportBgStyle = useMemo<React.CSSProperties>(() => {
    if (backgroundMode === 'checkerboard') {
      return {
        backgroundImage:
          'linear-gradient(45deg, #27272a 25%, transparent 25%), linear-gradient(-45deg, #27272a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #27272a 75%), linear-gradient(-45deg, transparent 75%, #27272a 75%)',
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        backgroundColor: '#18181b',
      };
    }
    if (backgroundMode === 'color') {
      return { backgroundColor };
    }
    return {};
  }, [backgroundMode, backgroundColor]);

  // Cursor style in Edit Mode
  const viewportCursor = useMemo(() => {
    if (spacePressed || toolSettings.tool === 'hand') return 'grab';
    if (toolSettings.tool === 'zoom') return 'zoom-in';
    if (toolSettings.tool === 'move') return 'move';
    if (toolSettings.tool === 'text') return 'text';
    return 'crosshair';
  }, [spacePressed, toolSettings.tool]);

  // Compute canvas-plane coordinates for floating text input
  const textInputStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!textInputState) return undefined;
    return {
      left: `${Math.max(0, textInputState.imgX * zoom)}px`,
      top: `${Math.max(0, textInputState.imgY * zoom)}px`,
      color: toolSettings.foregroundColor,
      fontFamily: toolSettings.fontFamily,
      fontSize: `${Math.max(12, Math.min(32, toolSettings.fontSize * zoom))}px`,
      fontWeight: toolSettings.fontBold ? 700 : 400,
    };
  }, [textInputState, zoom, toolSettings]);

  return (
    <div className={styles.container}>
      {/* Unified Header Bar: Preview | Edit Switch + Frame Index + Display Settings */}
      <div className={styles.modeHeader}>
        <div className={styles.modePill} role="tablist" aria-label="Canvas Workspace Mode">
          <button
            type="button"
            role="tab"
            aria-selected={!editMode}
            className={`${styles.modeBtn} ${!editMode ? styles.modeBtnActive : ''}`}
            onClick={() => handleModeSwitch(false)}
          >
            <Eye size={13} /> Preview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={editMode}
            className={`${styles.modeBtn} ${editMode ? styles.modeBtnActive : ''}`}
            onClick={() => handleModeSwitch(true)}
            disabled={!hasFrames}
          >
            <Pencil size={13} /> Edit Canvas
          </button>
        </div>

        <div className={styles.headerMeta}>
          {hasFrames && (
            <span className={styles.framePill}>
              Frame {safeIndex + 1} / {frames.length}
              {frameWidth > 0 && ` • ${frameWidth}×${frameHeight}`}
            </span>
          )}
          <button
            type="button"
            className={styles.settingsBtn}
            onClick={() => setShowSettingsMenu(s => !s)}
            title="Display & Performance settings"
            aria-label="Display & Performance settings"
          >
            ⚙️
          </button>
        </div>

        {showSettingsMenu && (
          <div className={styles.settingsMenu} onClick={e => e.stopPropagation()}>
            <div className={styles.settingsSection}>
              <div className={styles.settingsTitle}>Real-Time Preview</div>
              <div className={styles.toggleRow} onClick={() => handleToggleLivePreview(!livePreviewEnabled)}>
                <div className={styles.toggleLabel}>
                  <span>Live Preview</span>
                  <span className={styles.toggleDesc}>Process adjustments live</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={livePreviewEnabled}
                    onChange={e => handleToggleLivePreview(e.target.checked)}
                  />
                  <span className={styles.sliderRound} />
                </label>
              </div>
              <div className={styles.toggleRow} onClick={() => handleToggleAutoSleep(!autoSleepEnabled)}>
                <div className={styles.toggleLabel}>
                  <span>Auto-Sleep Mode</span>
                  <span className={styles.toggleDesc}>Save CPU when idle (4s)</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={autoSleepEnabled}
                    onChange={e => handleToggleAutoSleep(e.target.checked)}
                    disabled={!livePreviewEnabled}
                  />
                  <span className={styles.sliderRound} />
                </label>
              </div>
            </div>

            <div className={styles.settingsSection}>
              <div className={styles.settingsTitle}>Background Mode</div>
              <button
                type="button"
                className={`${styles.bgOption} ${backgroundMode === 'none' ? styles.active : ''}`}
                onClick={() => onBackgroundModeChange?.('none')}
              >
                None (Dark)
              </button>
              <button
                type="button"
                className={`${styles.bgOption} ${backgroundMode === 'checkerboard' ? styles.active : ''}`}
                onClick={() => onBackgroundModeChange?.('checkerboard')}
              >
                Checkerboard
              </button>
              <button
                type="button"
                className={`${styles.bgOption} ${backgroundMode === 'color' ? styles.active : ''}`}
                onClick={() => onBackgroundModeChange?.('color')}
              >
                Custom Color
              </button>
              {backgroundMode === 'color' && (
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={e => onBackgroundColorChange?.(e.target.value)}
                  className={styles.bgColorPicker}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit Mode Options Bar */}
      {editMode && hasFrames && (
        <EditorOptionsBar
          settings={toolSettings}
          onChange={setToolSettings}
          activeLayer={activeLayer}
          editTarget={editTarget}
          selectionMask={selectionMask}
          onDeselect={() => setSelectionMask(null)}
          onInvertSelection={() => {
            if (selectionMask) setSelectionMask(invertSelectionMask(selectionMask));
          }}
          onMaskFromSelection={() => {
            if (activeLayer && maskFromSelection) void maskFromSelection(activeLayer.id);
          }}
          showPixelGrid={showPixelGrid}
          onTogglePixelGrid={() => setShowPixelGrid(v => !v)}
          maskSoloActive={Boolean(maskSoloLayerId && activeLayer && maskSoloLayerId === activeLayer.id)}
          onToggleMaskSolo={() => {
            if (!activeLayer) return;
            setMaskSoloLayerId(maskSoloLayerId === activeLayer.id ? null : activeLayer.id);
          }}
          hasMaskOnActive={hasMaskOnActive}
          onionSkinEnabled={onionSkinEnabled}
          onToggleOnionSkin={setOnionSkinEnabled}
          onionPrev={onionSkinPrevFrames}
          onOnionPrevChange={setOnionSkinPrevFrames}
          onionNext={onionSkinNextFrames}
          onOnionNextChange={setOnionSkinNextFrames}
          onionOpacity={onionSkinOpacity}
          onOnionOpacityChange={setOnionSkinOpacity}
          hasActiveTransform={Boolean(transformState)}
          onCommitTransform={() => void handleCommitTransform()}
          onCancelTransform={handleCancelTransform}
          cloneSourceSet={Boolean(cloneSource)}
        />
      )}

      {/* Main Workspace Area */}
      {!editMode ? (
        <div className={styles.canvasContainer}>
          {hasFrames ? (
            <canvas ref={canvasRef} className={styles.canvas} />
          ) : (
            <div className={styles.placeholder}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <p>Load a video or spritesheet to preview</p>
            </div>
          )}
          {hasFrames && (
            <>
              <div className={styles.loopIndicator} title={`Loop: ${loopMode}`}>
                {loopModeLabel}
              </div>
              <div className={styles.statusIndicator}>
                <span
                  className={`${styles.statusDot} ${
                    !livePreviewEnabled ? styles.disabled : isAsleep ? styles.sleep : styles.active
                  }`}
                />
                <span>
                  {!livePreviewEnabled
                    ? 'Live Preview: OFF'
                    : isAsleep
                      ? 'Live Preview: Sleeping (Idle)'
                      : 'Live Preview: Active'}
                </span>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className={styles.editWorkspace}>
          <EditorToolRail settings={toolSettings} onChange={setToolSettings} />

          <div
            ref={viewportRef}
            className={styles.editViewport}
            style={{ cursor: viewportCursor }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={e => void handlePointerUp(e)}
            onWheel={handleWheel}
            onContextMenu={e => e.preventDefault()}
          >
            {hasFrames && frameWidth > 0 && frameHeight > 0 ? (
              <>
                <div
                  className={styles.editCanvasPlane}
                  style={{
                    width: `${frameWidth * zoom}px`,
                    height: `${frameHeight * zoom}px`,
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                    ...viewportBgStyle,
                  }}
                >
                  <canvas
                    ref={editDisplayCanvasRef}
                    className={styles.editDisplayCanvas}
                  />
                  {textInputState && textInputStyle && (
                    <div
                      className={styles.textInputWrapper}
                      style={textInputStyle}
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <textarea
                        autoFocus
                        rows={1}
                        value={textInputState.value}
                        placeholder="Type text..."
                        className={styles.floatingTextInput}
                        onChange={e => setTextInputState(prev => (prev ? { ...prev, value: e.target.value } : null))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void commitTextInput();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setTextInputState(null);
                          }
                        }}
                        onBlur={() => void commitTextInput()}
                      />
                    </div>
                  )}
                </div>
                <canvas ref={overlayCanvasRef} className={styles.overlayCanvas} />

                {maskSoloLayerId && (
                  <div className={styles.maskSoloBanner}>
                    Viewing Mask Solo — Alt+Click mask thumbnail or click &quot;Mask&quot; button to exit
                  </div>
                )}

                {editWarning && <div className={styles.editWarningToast}>{editWarning}</div>}
              </>
            ) : (
              <div className={styles.placeholder}>
                <p>Select or import a frame to edit</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Controls: Playback in Preview Mode, Frame Step + Zoom Status in Edit Mode */}
      {!editMode ? (
        <div className={styles.controls}>
          <button
            type="button"
            onClick={goToStart}
            className={styles.controlButton}
            disabled={!hasFrames}
            title="Go to start"
            aria-label="Go to start"
          >
            <SkipBack size={14} />
          </button>
          <button
            type="button"
            onClick={stepBack}
            className={styles.controlButton}
            disabled={!hasFrames}
            title="Previous frame"
            aria-label="Previous frame"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className={`${styles.controlButton} ${styles.playButton}`}
            disabled={!hasFrames}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" style={{ marginLeft: '2px' }} />
            )}
          </button>
          <button
            type="button"
            onClick={stepForward}
            className={styles.controlButton}
            disabled={!hasFrames}
            title="Next frame"
            aria-label="Next frame"
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={goToEnd}
            className={styles.controlButton}
            disabled={!hasFrames}
            title="Go to end"
            aria-label="Go to end"
          >
            <SkipForward size={14} />
          </button>
        </div>
      ) : (
        <div className={styles.editStatusBar}>
          <div className={styles.statusGroup}>
            <button
              type="button"
              className={styles.miniStepBtn}
              onClick={stepBack}
              disabled={safeIndex <= 0}
              title="Previous Frame"
            >
              <ChevronLeft size={13} />
            </button>
            <span className={styles.statusText}>
              {safeIndex + 1}/{frames.length}
            </span>
            <button
              type="button"
              className={styles.miniStepBtn}
              onClick={stepForward}
              disabled={safeIndex >= frames.length - 1}
              title="Next Frame"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          <div className={styles.statusGroup}>
            {cursorCoords && (
              <span className={styles.statusText}>
                X:{cursorCoords.x} Y:{cursorCoords.y}
              </span>
            )}
            {selectionMask?.bounds && (
              <span className={styles.statusText}>
                Sel: {selectionMask.bounds.w}×{selectionMask.bounds.h}
              </span>
            )}
          </div>

          <div className={styles.statusGroup}>
            <button
              type="button"
              className={styles.miniStepBtn}
              onClick={() => setZoom(z => Math.max(0.5, Number((z / 1.25).toFixed(2))))}
              title="Zoom Out"
            >
              <ZoomOut size={12} />
            </button>
            <span className={styles.statusText}>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className={styles.miniStepBtn}
              onClick={() => setZoom(z => Math.min(32, Number((z * 1.25).toFixed(2))))}
              title="Zoom In"
            >
              <ZoomIn size={12} />
            </button>
            <button
              type="button"
              className={styles.miniStepBtn}
              onClick={fitToViewport}
              title="Fit Frame (Ctrl+0)"
            >
              <Maximize2 size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
