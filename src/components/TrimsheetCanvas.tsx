// src/components/TrimsheetCanvas.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { NormRect, Region } from '@/lib/trimsheetTypes';
import styles from './TrimsheetCanvas.module.css';

const VIEW = 512; // on-screen stage size in CSS px (square)
const SNAP = 1 / 16;

type DragMode =
  | { kind: 'draw'; startX: number; startY: number }
  | { kind: 'move'; id: string; grabDX: number; grabDY: number }
  | { kind: 'resize'; id: string; }
  | null;

function snap(v: number, alt: boolean): number {
  if (alt) return v;
  return Math.round(v / SNAP) * SNAP;
}
function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

export function TrimsheetCanvas() {
  const ctx = useTrimsheetContext();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const [draft, setDraft] = useState<NormRect | null>(null);

  // Paint the baker's albedo preview whenever bakeVersion changes.
  useEffect(() => {
    const baker = ctx.baker;
    const cvs = previewRef.current;
    if (!baker || !cvs) return;
    const src = baker.getPreviewCanvas();
    const c = cvs.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, cvs.width, cvs.height);
    // src is an OffscreenCanvas; drawImage accepts it.
    c.drawImage(src as unknown as CanvasImageSource, 0, 0, cvs.width, cvs.height);
  }, [ctx.baker, ctx.bakeVersion, ctx.resolution]);

  // Draw region outlines + handles overlay.
  const drawOverlay = useCallback(() => {
    const cvs = overlayRef.current;
    if (!cvs) return;
    const c = cvs.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, VIEW, VIEW);
    for (const r of ctx.regions) {
      const x = r.rect.x * VIEW, y = r.rect.y * VIEW, w = r.rect.w * VIEW, h = r.rect.h * VIEW;
      const active = r.id === ctx.selectedRegionId;
      c.lineWidth = active ? 2 : 1;
      c.strokeStyle = active ? '#3b82f6' : 'rgba(255,255,255,0.6)';
      c.strokeRect(x + 0.5, y + 0.5, w, h);
      c.fillStyle = active ? '#3b82f6' : 'rgba(255,255,255,0.6)';
      c.font = '11px sans-serif';
      c.fillText(r.name, x + 4, y + 14);
      if (active) {
        // bottom-right resize handle
        c.fillRect(x + w - 6, y + h - 6, 8, 8);
      }
    }
    if (draft) {
      c.strokeStyle = '#22c55e';
      c.setLineDash([4, 3]);
      c.strokeRect(draft.x * VIEW + 0.5, draft.y * VIEW + 0.5, draft.w * VIEW, draft.h * VIEW);
      c.setLineDash([]);
    }
  }, [ctx.regions, ctx.selectedRegionId, draft]);

  useEffect(() => { drawOverlay(); }, [drawOverlay]);

  const toNorm = (e: React.PointerEvent): { nx: number; ny: number } => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { nx: clamp01((e.clientX - rect.left) / rect.width), ny: clamp01((e.clientY - rect.top) / rect.height) };
  };

  const hitRegion = (nx: number, ny: number): Region | null => {
    // topmost last-drawn wins; iterate in reverse
    for (let i = ctx.regions.length - 1; i >= 0; i--) {
      const r = ctx.regions[i];
      if (nx >= r.rect.x && nx <= r.rect.x + r.rect.w && ny >= r.rect.y && ny <= r.rect.y + r.rect.h) return r;
    }
    return null;
  };

  const isOnResizeHandle = (r: Region, nx: number, ny: number): boolean => {
    const hx = r.rect.x + r.rect.w, hy = r.rect.y + r.rect.h;
    return Math.abs(nx - hx) < 0.02 && Math.abs(ny - hy) < 0.02;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    overlayRef.current!.setPointerCapture(e.pointerId);
    const { nx, ny } = toNorm(e);
    const sel = ctx.regions.find((r) => r.id === ctx.selectedRegionId) || null;
    if (sel && isOnResizeHandle(sel, nx, ny)) {
      setDrag({ kind: 'resize', id: sel.id });
      return;
    }
    const hit = hitRegion(nx, ny);
    if (hit) {
      ctx.selectRegion(hit.id);
      setDrag({ kind: 'move', id: hit.id, grabDX: nx - hit.rect.x, grabDY: ny - hit.rect.y });
    } else {
      setDrag({ kind: 'draw', startX: nx, startY: ny });
      setDraft({ x: nx, y: ny, w: 0, h: 0 });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { nx, ny } = toNorm(e);
    const alt = e.altKey;
    if (drag.kind === 'draw') {
      const x = Math.min(drag.startX, nx), y = Math.min(drag.startY, ny);
      const w = Math.abs(nx - drag.startX), h = Math.abs(ny - drag.startY);
      setDraft({ x: snap(x, alt), y: snap(y, alt), w: snap(w, alt), h: snap(h, alt) });
    } else if (drag.kind === 'move') {
      const r = ctx.regions.find((x) => x.id === drag.id);
      if (!r) return;
      const nxX = clamp01(snap(nx - drag.grabDX, alt));
      const nyY = clamp01(snap(ny - drag.grabDY, alt));
      ctx.updateRegionRect(drag.id, { ...r.rect, x: Math.min(nxX, 1 - r.rect.w), y: Math.min(nyY, 1 - r.rect.h) });
    } else if (drag.kind === 'resize') {
      const r = ctx.regions.find((x) => x.id === drag.id);
      if (!r) return;
      const w = clamp01(snap(nx, alt)) - r.rect.x;
      const h = clamp01(snap(ny, alt)) - r.rect.y;
      ctx.updateRegionRect(drag.id, { ...r.rect, w: Math.max(SNAP, w), h: Math.max(SNAP, h) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag?.kind === 'draw' && draft && draft.w > 0.02 && draft.h > 0.02) {
      ctx.addRegion(draft);
    }
    setDraft(null);
    setDrag(null);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.stage} style={{ width: VIEW, height: VIEW }}>
        <canvas ref={previewRef} className={styles.canvas} width={VIEW} height={VIEW} />
        <canvas
          ref={overlayRef}
          className={styles.overlay}
          width={VIEW}
          height={VIEW}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
    </div>
  );
}
