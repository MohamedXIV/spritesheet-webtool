'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Layers, ZoomIn, ZoomOut, RotateCcw, Paintbrush, Eye, EyeOff } from 'lucide-react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import styles from './ThreePainter2DPreview.module.css';

export function ThreePainter2DPreview() {
  const {
    painter,
    isModelLoaded,
    isLoadingModel,
    isPaintMode,
    setIsPaintMode,
    brushSize,
    brushColor,
  } = useThreePainterContext();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uvCacheCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport states
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [showUVs, setShowUVs] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mouseInCanvas, setMouseInCanvas] = useState(false);

  const panStartRef = useRef({ x: 0, y: 0 });

  // Center the 2D texture map when loaded or mounted
  const resetZoom = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const nextZoom = Math.min((rect.width - 80) / 512, (rect.height - 80) / 512, 2.5);
      setZoom(Math.max(0.2, nextZoom));
      setPan({
        x: (rect.width - 512 * nextZoom) / 2,
        y: (rect.height - 512 * nextZoom) / 2
      });
    }
  }, []);

  useEffect(() => {
    resetZoom();
  }, [isModelLoaded, resetZoom]);

  // Bake the UV layout wireframe exactly once at high resolution to avoid performance lag
  const bakeUVLayout = useCallback(() => {
    if (!painter) {
      uvCacheCanvasRef.current = null;
      return;
    }
    const meshes = painter.getPaintableMeshes();
    if (!meshes.length) {
      uvCacheCanvasRef.current = null;
      return;
    }

    const cacheCanvas = document.createElement('canvas');
    cacheCanvas.width = 2048;
    cacheCanvas.height = 2048;
    const ctx = cacheCanvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = 'rgba(52, 211, 153, 0.65)'; // Nice semi-transparent emerald
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    meshes.forEach(mesh => {
      const uvAttr = mesh.geometry.attributes.uv;
      const indexAttr = mesh.geometry.index;
      if (!uvAttr) return;

      if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i += 3) {
          const idx0 = indexAttr.getX(i);
          const idx1 = indexAttr.getX(i + 1);
          const idx2 = indexAttr.getX(i + 2);

          const u0 = uvAttr.getX(idx0) * 2048;
          const v0 = (1 - uvAttr.getY(idx0)) * 2048;
          const u1 = uvAttr.getX(idx1) * 2048;
          const v1 = (1 - uvAttr.getY(idx1)) * 2048;
          const u2 = uvAttr.getX(idx2) * 2048;
          const v2 = (1 - uvAttr.getY(idx2)) * 2048;

          ctx.moveTo(u0, v0);
          ctx.lineTo(u1, v1);
          ctx.lineTo(u2, v2);
          ctx.closePath();
        }
      } else {
        for (let i = 0; i < uvAttr.count; i += 3) {
          const u0 = uvAttr.getX(i) * 2048;
          const v0 = (1 - uvAttr.getY(i)) * 2048;
          const u1 = uvAttr.getX(i + 1) * 2048;
          const v1 = (1 - uvAttr.getY(i + 1)) * 2048;
          const u2 = uvAttr.getX(i + 2) * 2048;
          const v2 = (1 - uvAttr.getY(i + 2)) * 2048;

          ctx.moveTo(u0, v0);
          ctx.lineTo(u1, v1);
          ctx.lineTo(u2, v2);
          ctx.closePath();
        }
      }
    });
    ctx.stroke();
    uvCacheCanvasRef.current = cacheCanvas;
  }, [painter]);

  useEffect(() => {
    if (!isLoadingModel && isModelLoaded) {
      bakeUVLayout();
    }
  }, [painter, isModelLoaded, isLoadingModel, bakeUVLayout]);

  // Translate client coordinates to texture UV space
  const getUVCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const textureX = (localX - pan.x) / zoom;
    const textureY = (localY - pan.y) / zoom;

    const u = textureX / 512;
    const v = 1 - (textureY / 512);

    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      return { u, v };
    }
    return null;
  }, [pan, zoom]);

  // Main draw loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Clear background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // 1. Draw checkerboard transparency grid
    const gridSz = 16;
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#272730';
    for (let y = 0; y < 512; y += gridSz * 2) {
      for (let x = 0; x < 512; x += gridSz * 2) {
        ctx.fillRect(x, y, gridSz, gridSz);
        ctx.fillRect(x + gridSz, y + gridSz, gridSz, gridSz);
      }
    }

    // 2. Draw composite painter canvas
    const compositeCanvas = document.getElementById('three-painter-composite-canvas') as HTMLCanvasElement;
    if (compositeCanvas) {
      ctx.drawImage(compositeCanvas, 0, 0, 512, 512);
    }

    // 3. Draw UV wireframe overlay if enabled
    if (showUVs && uvCacheCanvasRef.current) {
      ctx.drawImage(uvCacheCanvasRef.current, 0, 0, 512, 512);
    }

    ctx.restore();
  }, [pan, zoom, showUVs]);

  // Bind animation loop
  useEffect(() => {
    let animId: number;
    const renderLoop = () => {
      const canvas = canvasRef.current;
      if (canvas && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
      }
      draw();
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [draw]);

  // Event handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.12;
    const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.max(0.15, Math.min(25, nextZoom)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const isPanAction = e.button === 1 || e.button === 2 || !isPaintMode || e.shiftKey;
    if (isPanAction) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    } else if (e.button === 0 && isPaintMode) {
      setIsPainting(true);
      const uv = getUVCoords(e.clientX, e.clientY);
      if (uv) {
        (window as any).__threePaintStrokeDispatcher?.(uv.u, uv.v, true, false);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      });
    } else if (isPainting) {
      const uv = getUVCoords(e.clientX, e.clientY);
      if (uv) {
        (window as any).__threePaintStrokeDispatcher?.(uv.u, uv.v, false, false);
      }
    }
  };

  const handleMouseUp = () => {
    if (isPanning) setIsPanning(false);
    if (isPainting) {
      setIsPainting(false);
      (window as any).__threePaintStrokeDispatcher?.(0, 0, false, true);
    }
  };

  return (
    <div className={styles.container} ref={containerRef}>
      {/* 2D Header controls HUD */}
      <div className={styles.controlHeader}>
        <div className={styles.hudLeft}>
          <button
            className={`${styles.hudBtn} ${isPaintMode ? styles.active : ''}`}
            onClick={() => setIsPaintMode(!isPaintMode)}
            title="Toggle Brush Paint"
          >
            <Paintbrush size={11} /> Paint Mode
          </button>
          <button
            className={`${styles.hudBtn} ${showUVs ? styles.active : ''}`}
            onClick={() => setShowUVs(!showUVs)}
            title="Toggle UV Islands wireframe"
          >
            {showUVs ? <Eye size={11} /> : <EyeOff size={11} />} UV Layout
          </button>
        </div>

        <div className={styles.hudRight}>
          <button className={styles.hudBtn} onClick={() => setZoom(z => Math.min(25, z * 1.25))} title="Zoom In">
            <ZoomIn size={11} />
          </button>
          <span className={styles.zoomTag}>{(zoom * 100).toFixed(0)}%</span>
          <button className={styles.hudBtn} onClick={() => setZoom(z => Math.max(0.15, z / 1.25))} title="Zoom Out">
            <ZoomOut size={11} />
          </button>
          <button className={styles.hudBtn} onClick={resetZoom} title="Reset Position">
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      {/* Main 2D Canvas viewport */}
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${isPanning ? styles.panning : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setMouseInCanvas(false);
        }}
        onMouseEnter={() => setMouseInCanvas(true)}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Custom brush overlay cursor */}
      {mouseInCanvas && isPaintMode && !isPanning && (
        <div
          className={styles.brushCursor}
          style={{
            left: mousePos.x,
            top: mousePos.y,
            width: brushSize * zoom,
            height: brushSize * zoom,
            borderColor: brushColor,
          }}
        />
      )}
    </div>
  );
}
