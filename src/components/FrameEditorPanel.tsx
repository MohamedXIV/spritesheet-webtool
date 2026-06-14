'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Paintbrush, Eraser, Pipette, PaintBucket, Layers, Eye } from 'lucide-react';
import { useEditorContext } from '@/contexts/EditorContext';
import styles from './FrameEditorPanel.module.css';

// Hex to RGBA helper for flood fill
function hexToRgba(hex: string, alphaPercent: number = 100): { r: number; g: number; b: number; a: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
    a: Math.round((alphaPercent / 100) * 255)
  };
}

// Flood Fill Algorithm
function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColor: { r: number; g: number; b: number; a: number }
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const getPixel = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
      a: data[idx + 3]
    };
  };

  const setPixel = (x: number, y: number, color: { r: number; g: number; b: number; a: number }) => {
    const idx = (y * width + x) * 4;
    data[idx] = color.r;
    data[idx + 1] = color.g;
    data[idx + 2] = color.b;
    data[idx + 3] = color.a;
  };

  const startPixel = getPixel(startX, startY);

  if (
    startPixel.r === fillColor.r &&
    startPixel.g === fillColor.g &&
    startPixel.b === fillColor.b &&
    startPixel.a === fillColor.a
  ) {
    return;
  }

  const matchColor = (c1: typeof startPixel, c2: typeof startPixel) => {
    return Math.abs(c1.r - c2.r) < 15 &&
           Math.abs(c1.g - c2.g) < 15 &&
           Math.abs(c1.b - c2.b) < 15 &&
           Math.abs(c1.a - c2.a) < 15;
  };

  const queue: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    const idx = cy * width + cx;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const currentPixel = getPixel(cx, cy);
    if (matchColor(currentPixel, startPixel)) {
      setPixel(cx, cy, fillColor);

      if (cx > 0) queue.push([cx - 1, cy]);
      if (cx < width - 1) queue.push([cx + 1, cy]);
      if (cy > 0) queue.push([cx, cy - 1]);
      if (cy < height - 1) queue.push([cx, cy + 1]);
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

export function FrameEditorPanel() {
  const {
    frameState,
    orderedFrames = [],
    currentFrame = 0,
    globalLayers = [],
    activeLayerId = '',
    updateFrameLayer = async () => {},
    
    // Brush Settings
    activeTool = 'brush',
    setActiveTool = () => {},
    brushColor = '#8b5cf6',
    setBrushColor = () => {},
    brushSize = 8,
    setBrushSize = () => {},
    brushOpacity = 1.0,
    setBrushOpacity = () => {},
    brushHardness = 0.8,
    setBrushHardness = () => {},

    // Onion Skin Settings
    onionSkinEnabled = false,
    setOnionSkinEnabled = () => {},
    onionSkinPrevFrames = 1,
    setOnionSkinPrevFrames = () => {},
    onionSkinNextFrames = 0,
    setOnionSkinNextFrames = () => {},
    onionSkinOpacity = 0.4,
    setOnionSkinOpacity = () => {},
  } = useEditorContext();

  const containerRef = useRef<HTMLDivElement>(null);
  const underlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const activeFrameData = orderedFrames[currentFrame];

  // Draw passive layers (underlay/overlay) and onion skins
  const drawPassiveLayers = useCallback(async () => {
    const underlay = underlayCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!underlay || !overlay || !activeFrameData) return;

    const uCtx = underlay.getContext('2d')!;
    const oCtx = overlay.getContext('2d')!;
    const W = underlay.width;
    const H = underlay.height;

    uCtx.clearRect(0, 0, W, H);
    oCtx.clearRect(0, 0, W, H);

    // 1. Draw Onion Skins (behind everything, in underlay)
    if (onionSkinEnabled && frameState) {
      // Previous Frames
      uCtx.globalAlpha = onionSkinOpacity * 0.6;
      for (let i = 1; i <= onionSkinPrevFrames; i++) {
        const prevIdx = currentFrame - i;
        if (prevIdx >= 0 && orderedFrames[prevIdx]) {
          const prevFrame = orderedFrames[prevIdx];
          uCtx.drawImage(prevFrame.bitmap, 0, 0, W, H);
        }
      }

      // Next Frames
      uCtx.globalAlpha = onionSkinOpacity * 0.3;
      for (let i = 1; i <= onionSkinNextFrames; i++) {
        const nextIdx = currentFrame + i;
        if (nextIdx < orderedFrames.length && orderedFrames[nextIdx]) {
          const nextFrame = orderedFrames[nextIdx];
          uCtx.drawImage(nextFrame.bitmap, 0, 0, W, H);
        }
      }
      uCtx.globalAlpha = 1.0; // Reset
    }

    // 2. Draw layers below and above active layer
    let passedActive = false;
    for (const layer of globalLayers) {
      if (layer.id === activeLayerId) {
        passedActive = true;
        continue;
      }
      if (!layer.visible) continue;

      const layerBmp = activeFrameData.layerContents?.[layer.id];
      if (layerBmp) {
        const ctx = passedActive ? oCtx : uCtx;
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode;
        ctx.drawImage(layerBmp, 0, 0, W, H);
      }
    }

    // Reset alpha/blend modes
    uCtx.globalAlpha = 1.0;
    uCtx.globalCompositeOperation = 'source-over';
    oCtx.globalAlpha = 1.0;
    oCtx.globalCompositeOperation = 'source-over';
  }, [activeFrameData, globalLayers, activeLayerId, onionSkinEnabled, onionSkinPrevFrames, onionSkinNextFrames, onionSkinOpacity, frameState, currentFrame, orderedFrames]);

  // Load active layer into interactive paint canvas
  useEffect(() => {
    const paint = paintCanvasRef.current;
    const underlay = underlayCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!paint || !underlay || !overlay || !activeFrameData) return;

    const W = activeFrameData.bitmap.width;
    const H = activeFrameData.bitmap.height;

    // Match resolutions
    paint.width = W;
    paint.height = H;
    underlay.width = W;
    underlay.height = H;
    overlay.width = W;
    overlay.height = H;

    const pCtx = paint.getContext('2d')!;
    pCtx.clearRect(0, 0, W, H);

    const activeBmp = activeFrameData.layerContents?.[activeLayerId];
    if (activeBmp) {
      pCtx.drawImage(activeBmp, 0, 0);
    }

    drawPassiveLayers();
  }, [activeFrameData, activeLayerId, drawPassiveLayers]);

  // Handle color picking
  const pickColor = (x: number, y: number) => {
    const paint = paintCanvasRef.current;
    if (!paint) return;
    const ctx = paint.getContext('2d')!;
    
    // Eyedrop from the paint canvas (or we can combine if needed, active layer is preferred)
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    if (pixel[3] > 0) {
      const hex = '#' + Array.from(pixel.slice(0, 3)).map(b => b.toString(16).padStart(2, '0')).join('');
      setBrushColor(hex);
    }
  };

  // Canvas Mouse Coordinates Helper
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const paint = paintCanvasRef.current;
    if (!paint) return null;
    const rect = paint.getBoundingClientRect();
    
    // Scale mapping because CSS dimensions differ from canvas coordinates resolution
    const x = Math.round(((e.clientX - rect.left) / rect.width) * paint.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * paint.height);
    return { x, y };
  };

  // Draw brush stroke on canvas
  const drawStroke = (x1: number, y1: number, x2: number, y2: number) => {
    const paint = paintCanvasRef.current;
    if (!paint) return;
    const ctx = paint.getContext('2d')!;

    ctx.save();
    
    if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = brushColor;
    }

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = brushOpacity;

    // Hardness mapping
    if (brushHardness < 0.95 && activeTool !== 'eraser') {
      // Soft brush emulation via shadowBlur
      ctx.shadowColor = brushColor;
      ctx.shadowBlur = (1 - brushHardness) * brushSize * 0.5;
    }

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.restore();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeFrameData) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (activeTool === 'eyedropper') {
      pickColor(coords.x, coords.y);
      setActiveTool('brush');
      return;
    }

    if (activeTool === 'bucket') {
      const paint = paintCanvasRef.current;
      if (!paint) return;
      const ctx = paint.getContext('2d')!;
      const rgba = hexToRgba(brushColor, brushOpacity * 100);
      floodFill(ctx, coords.x, coords.y, rgba);
      // Trigger save of state
      updateFrameLayer(activeFrameData.id, activeLayerId, paint);
      return;
    }

    setIsDrawing(true);
    lastPosRef.current = coords;

    // Single click dot
    drawStroke(coords.x, coords.y, coords.x, coords.y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPosRef.current) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;

    drawStroke(lastPosRef.current.x, lastPosRef.current.y, coords.x, coords.y);
    lastPosRef.current = coords;
  };

  const handleMouseUpOrLeave = () => {
    if (!isDrawing || !activeFrameData) return;
    setIsDrawing(false);
    lastPosRef.current = null;

    // Save changes to project state
    const paint = paintCanvasRef.current;
    if (paint) {
      updateFrameLayer(activeFrameData.id, activeLayerId, paint);
    }
  };

  const handleClearLayer = () => {
    const paint = paintCanvasRef.current;
    if (!paint || !activeFrameData) return;
    const ctx = paint.getContext('2d')!;
    ctx.clearRect(0, 0, paint.width, paint.height);
    updateFrameLayer(activeFrameData.id, activeLayerId, paint);
  };

  return (
    <div className={styles.container} ref={containerRef}>
      {/* Editor Panel Header / Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolGroup}>
          <button
            className={`${styles.toolButton} ${activeTool === 'brush' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('brush')}
            title="Brush Tool"
          >
            <Paintbrush size={14} />
          </button>
          <button
            className={`${styles.toolButton} ${activeTool === 'eraser' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('eraser')}
            title="Eraser Tool"
          >
            <Eraser size={14} />
          </button>
          <button
            className={`${styles.toolButton} ${activeTool === 'eyedropper' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('eyedropper')}
            title="Color Picker"
          >
            <Pipette size={14} />
          </button>
          <button
            className={`${styles.toolButton} ${activeTool === 'bucket' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('bucket')}
            title="Fill Bucket"
          >
            <PaintBucket size={14} />
          </button>
        </div>

        <div className={styles.divider} />

        {/* Brush Settings */}
        <div className={styles.settingsGroup}>
          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>Color</span>
            <input
              type="color"
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className={styles.colorPicker}
            />
          </div>

          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>Size</span>
            <input
              type="range"
              min="1"
              max="100"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className={styles.slider}
            />
            <span className={styles.valueDisplay}>{brushSize}px</span>
          </div>

          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>Opacity</span>
            <input
              type="range"
              min="1"
              max="100"
              value={Math.round(brushOpacity * 100)}
              onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
              className={styles.slider}
            />
            <span className={styles.valueDisplay}>{Math.round(brushOpacity * 100)}%</span>
          </div>

          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>Hardness</span>
            <input
              type="range"
              min="1"
              max="100"
              value={Math.round(brushHardness * 100)}
              onChange={(e) => setBrushHardness(Number(e.target.value) / 100)}
              className={styles.slider}
            />
            <span className={styles.valueDisplay}>{Math.round(brushHardness * 100)}%</span>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Onion Skinning */}
        <div className={styles.settingsGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={onionSkinEnabled}
              onChange={(e) => setOnionSkinEnabled(e.target.checked)}
            />
            <span>Onion Skin</span>
          </label>

          {onionSkinEnabled && (
            <>
              <div className={styles.settingItem}>
                <span className={styles.settingLabel}>Prev</span>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={onionSkinPrevFrames}
                  onChange={(e) => setOnionSkinPrevFrames(Math.max(0, Number(e.target.value)))}
                  className={styles.numberInput}
                />
              </div>
              <div className={styles.settingItem}>
                <span className={styles.settingLabel}>Next</span>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={onionSkinNextFrames}
                  onChange={(e) => setOnionSkinNextFrames(Math.max(0, Number(e.target.value)))}
                  className={styles.numberInput}
                />
              </div>
            </>
          )}
        </div>

        <div className={styles.divider} />

        <button className={styles.clearButton} onClick={handleClearLayer} title="Clear Current Layer">
          Clear
        </button>
      </div>

      {/* Editor Canvas Canvas Viewport */}
      <div className={styles.viewport}>
        {activeFrameData ? (
          <div className={styles.canvasWrapper}>
            <canvas ref={underlayCanvasRef} className={`${styles.canvas} ${styles.underlay}`} />
            <canvas
              ref={paintCanvasRef}
              className={`${styles.canvas} ${styles.paint}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
            />
            <canvas ref={overlayCanvasRef} className={`${styles.canvas} ${styles.overlay}`} />
          </div>
        ) : (
          <div className={styles.noFrameSelected}>
            <span>No frame loaded. Import media files to begin painting.</span>
          </div>
        )}
      </div>
    </div>
  );
}
