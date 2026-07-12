'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Layers, Loader2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useStylizerContext } from '@/contexts/StylizerContext';
import styles from './StylizerPreviewPanel.module.css';

export function StylizerPreviewPanel() {
  const { material, derived, wipePosition, setWipePosition, tiled, setTiled, isProcessing } = useStylizerContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const startPanRef = useRef({ x: 0, y: 0 });

  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const updateWipePosition = (clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = (clientX - rect.left) / zoom;
    const pct = Math.max(0, Math.min(100, Math.round((x / (rect.width / zoom)) * 100)));
    setWipePosition(pct);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tiled) return;

    // Middle click, or Left click + modifier keys (Shift, Ctrl, Alt) triggers Pan
    if (e.button === 1 || (e.button === 0 && (e.shiftKey || e.ctrlKey || e.altKey))) {
      e.preventDefault();
      isPanningRef.current = true;
      startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    if (e.button === 0) {
      isDraggingRef.current = true;
      updateWipePosition(e.clientX);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tiled) return;

    if (isPanningRef.current) {
      setPan({
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y,
      });
      return;
    }

    if (isDraggingRef.current) {
      updateWipePosition(e.clientX);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    isPanningRef.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (tiled) return;
    isDraggingRef.current = true;
    if (e.touches[0]) updateWipePosition(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (tiled) return;
    if (!isDraggingRef.current) return;
    if (e.touches[0]) updateWipePosition(e.touches[0].clientX);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (tiled) return;
    e.preventDefault();
    const zoomFactor = 1.12;
    const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const canvasX = (mouseX - pan.x) / zoom;
    const canvasY = (mouseY - pan.y) / zoom;

    const targetZoom = Math.max(0.2, Math.min(10, nextZoom));

    setPan({
      x: mouseX - canvasX * targetZoom,
      y: mouseY - canvasY * targetZoom,
    });
    setZoom(targetZoom);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const before = material.maps.albedo ?? null;
    const after = derived.stylizedAlbedo ?? before;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!before) return;

    const draw = (bmp: ImageBitmap, sx: number, sw: number) => {
      if (tiled) {
        const tw = canvas.width / 2, th = canvas.height / 2;
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
          ctx.drawImage(bmp, tx * tw, ty * th, tw, th);
        }
      } else {
        ctx.drawImage(bmp, sx, 0, sw, bmp.height, sx, 0, sw * (canvas.width / bmp.width), canvas.height);
      }
    };

    if (tiled) {
      if (after) draw(after, 0, after.width);
      return;
    }
    // before on left, after on right of wipe line
    const wipeX = (wipePosition / 100) * canvas.width;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, wipeX, canvas.height); ctx.clip();
    ctx.drawImage(before, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(wipeX, 0, canvas.width - wipeX, canvas.height); ctx.clip();
    if (after) ctx.drawImage(after, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    // wipe line
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(wipeX, 0); ctx.lineTo(wipeX, canvas.height); ctx.stroke();
  }, [material.maps.albedo, derived.stylizedAlbedo, wipePosition, tiled]);

  return (
    <div className={styles.panel}>
      <div className={styles.canvasContainer}>
        {/* Floating HUD */}
        <div className={styles.hudHeader}>
          <div className={styles.hudLeft}>
            <button
              className={`${styles.hudBtn} ${tiled ? styles.hudBtnActive : ''}`}
              onClick={() => {
                setTiled(!tiled);
                setZoom(1.0);
                setPan({ x: 0, y: 0 });
              }}
              title="Toggle Tile 2x2 Preview"
            >
              <Layers size={11} />
              <span>Tile 2×2</span>
            </button>
          </div>

          {!tiled && (
            <div className={styles.hudRight}>
              <button className={styles.hudBtn} onClick={() => setZoom(z => Math.min(10, z * 1.2))} title="Zoom In">
                <ZoomIn size={11} />
              </button>
              <span className={styles.zoomTag}>{(zoom * 100).toFixed(0)}%</span>
              <button className={styles.hudBtn} onClick={() => setZoom(z => Math.max(0.2, z / 1.2))} title="Zoom Out">
                <ZoomOut size={11} />
              </button>
              <button className={styles.hudBtn} onClick={() => { setZoom(1.0); setPan({ x: 0, y: 0 }); }} title="Reset Zoom & Pan">
                <RotateCcw size={11} />
              </button>
            </div>
          )}

          {isProcessing && tiled && (
            <div className={styles.hudRight}>
              <div className={styles.processingBadge}>
                <Loader2 size={11} className={styles.spinner} />
                <span>Processing</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.canvasWrap} onWheel={handleWheel}>
          {material.maps.albedo ? (
            <div
              ref={containerRef}
              className={`${styles.canvasInnerWrap} ${!tiled ? styles.draggable : ''}`}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
            >
              <canvas ref={canvasRef} width={512} height={512} className={styles.canvas} />

              {!tiled && (
                <div
                  className={styles.wipeLineOverlay}
                  style={{ left: `${wipePosition}%` }}
                >
                  <div className={styles.wipeHandle}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.85 }}>
                      <path d="M19 12H5M5 12L10 7M5 12L10 17M19 12L14 7M19 12L14 17" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.placeholder}>
              <div className={styles.placeholderContent}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={styles.placeholderIcon}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <p>Load an Albedo map in the maps panel first to preview.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
