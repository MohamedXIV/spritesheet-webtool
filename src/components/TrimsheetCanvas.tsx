// src/components/TrimsheetCanvas.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { NormRect, Region } from '@/lib/trimsheetTypes';
import { loadPolyhavenMaterial } from '@/lib/trimsheetMaterials';
import styles from './TrimsheetCanvas.module.css';

const VIEW = 768;        // CSS px square
const SNAP = 1 / 16;
const HANDLE_PX = 8;    // handle square size
const HIT_PX = 12;      // hit detection radius in px
const ROT_OFFSET_PY = 26; // px above the N handle for rotate circle

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type DragMode =
  | { kind: 'draw'; startX: number; startY: number }
  | { kind: 'move'; ids: string[]; origRects: Record<string, NormRect>; startNX: number; startNY: number }
  | { kind: 'resize'; id: string; handle: Handle; origRect: NormRect }
  | null;

type HoverTarget = Handle | 'rotate' | 'move' | null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function snapV(v: number, free: boolean) {
  return free ? v : Math.round(v / SNAP) * SNAP;
}
function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

function getHandlePos(rect: NormRect, h: Handle): [number, number] {
  const { x, y, w, hgt } = { x: rect.x, y: rect.y, w: rect.w, hgt: rect.h };
  switch (h) {
    case 'nw': return [x, y];
    case 'n':  return [x + w / 2, y];
    case 'ne': return [x + w, y];
    case 'e':  return [x + w, y + hgt / 2];
    case 'se': return [x + w, y + hgt];
    case 's':  return [x + w / 2, y + hgt];
    case 'sw': return [x, y + hgt];
    case 'w':  return [x, y + hgt / 2];
  }
}

function getRotateHandlePos(rect: NormRect): [number, number] {
  const px = (rect.x + rect.w / 2) * VIEW;
  const py = Math.max(ROT_OFFSET_PY / 2, rect.y * VIEW - ROT_OFFSET_PY);
  return [px, py];
}

function getHandleCursor(h: Handle): string {
  switch (h) {
    case 'nw': case 'se': return 'nwse-resize';
    case 'ne': case 'sw': return 'nesw-resize';
    case 'n':  case 's':  return 'ns-resize';
    case 'e':  case 'w':  return 'ew-resize';
  }
}

function applyResize(h: Handle, orig: NormRect, nx: number, ny: number, free: boolean): NormRect {
  const sx = snapV(nx, free), sy = snapV(ny, free);
  const { x, y, w, h: oh } = orig;
  const x2 = x + w, y2 = y + oh;
  const MIN = SNAP;

  let nx_ = x, ny_ = y, nw = w, nh = oh;

  if (h === 'nw') {
    nx_ = clamp01(Math.min(sx, x2 - MIN)); ny_ = clamp01(Math.min(sy, y2 - MIN));
    nw = x2 - nx_; nh = y2 - ny_;
  } else if (h === 'n') {
    ny_ = clamp01(Math.min(sy, y2 - MIN)); nh = y2 - ny_;
  } else if (h === 'ne') {
    ny_ = clamp01(Math.min(sy, y2 - MIN));
    nw = clamp01(Math.max(sx - x, MIN));
    nh = y2 - ny_;
  } else if (h === 'e') {
    nw = clamp01(Math.max(sx - x, MIN));
  } else if (h === 'se') {
    nw = clamp01(Math.max(sx - x, MIN));
    nh = clamp01(Math.max(sy - y, MIN));
  } else if (h === 's') {
    nh = clamp01(Math.max(sy - y, MIN));
  } else if (h === 'sw') {
    nx_ = clamp01(Math.min(sx, x2 - MIN));
    nw = x2 - nx_;
    nh = clamp01(Math.max(sy - y, MIN));
  } else if (h === 'w') {
    nx_ = clamp01(Math.min(sx, x2 - MIN)); nw = x2 - nx_;
  }

  return { x: nx_, y: ny_, w: nw, h: nh };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TrimsheetCanvas() {
  const ctx = useTrimsheetContext();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const [draft, setDraft] = useState<NormRect | null>(null);
  const [hover, setHover] = useState<HoverTarget>(null);

  // Viewport transformation states
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const initializedPanRef = useRef(false);

  // Measure container and center canvas initially
  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setStageSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  // Center canvas when stage dimensions are first available
  useEffect(() => {
    if (stageSize.width > 0 && stageSize.height > 0 && !initializedPanRef.current) {
      setPan({
        x: (stageSize.width - VIEW) / 2,
        y: (stageSize.height - VIEW) / 2,
      });
      initializedPanRef.current = true;
    }
  }, [stageSize]);

  // Paint baker preview whenever bake version changes
  useEffect(() => {
    const baker = ctx.baker;
    const cvs = previewRef.current;
    if (!baker || !cvs) return;
    const src = baker.getPreviewCanvas();
    const c = cvs.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, cvs.width, cvs.height);
    c.drawImage(src as unknown as CanvasImageSource, 0, 0, cvs.width, cvs.height);
  }, [ctx.baker, ctx.bakeVersion, ctx.resolution]);

  // Primary color — matches CSS var
  const PRIMARY = '#7C3AED';
  const PRIMARY_DIM = 'rgba(124,58,237,0.5)';
  const PRIMARY_FILL = 'rgba(124,58,237,0.07)';
  const MULTI_STROKE = 'rgba(124,58,237,0.45)';

  // Draw region outlines + gizmo overlay
  const drawOverlay = useCallback(() => {
    const cvs = overlayRef.current;
    if (!cvs) return;
    const c = cvs.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, VIEW, VIEW);

    for (const r of ctx.regions) {
      const px = r.rect.x * VIEW, py = r.rect.y * VIEW;
      const pw = r.rect.w * VIEW, ph = r.rect.h * VIEW;
      const isPrimary = r.id === ctx.selectedRegionId;
      const isMulti   = ctx.selectedRegionIds.has(r.id) && !isPrimary;

      // Region fill
      if (isPrimary) {
        c.fillStyle = PRIMARY_FILL;
        c.fillRect(px, py, pw, ph);
      }

      // Region outline
      c.lineWidth = isPrimary ? 2 : 1;
      c.strokeStyle = isPrimary ? PRIMARY : isMulti ? MULTI_STROKE : 'rgba(255,255,255,0.45)';
      c.strokeRect(px + 0.5, py + 0.5, pw, ph);

      // Region label
      c.fillStyle = isPrimary ? PRIMARY : isMulti ? MULTI_STROKE : 'rgba(255,255,255,0.55)';
      c.font = 'bold 11px system-ui, sans-serif';
      c.fillText(r.name, px + 5, py + 14);

      // ── Gizmo for primary selected region ──
      if (isPrimary) {
        // 8 resize handles
        for (const handle of ALL_HANDLES) {
          const [hx, hy] = getHandlePos(r.rect, handle);
          const hpx = hx * VIEW, hpy = hy * VIEW;
          const hs = HANDLE_PX;
          c.fillStyle = '#ffffff';
          c.fillRect(hpx - hs / 2, hpy - hs / 2, hs, hs);
          c.strokeStyle = PRIMARY;
          c.lineWidth = 1.5;
          c.strokeRect(hpx - hs / 2, hpy - hs / 2, hs, hs);
        }

        // Rotate handle
        const [rhx, rhy] = getRotateHandlePos(r.rect);
        const nHX = (r.rect.x + r.rect.w / 2) * VIEW;
        const nHY = r.rect.y * VIEW;

        // Dashed line from N handle to rotate circle
        c.beginPath();
        c.setLineDash([3, 3]);
        c.strokeStyle = PRIMARY_DIM;
        c.lineWidth = 1;
        c.moveTo(nHX, nHY);
        c.lineTo(rhx, rhy);
        c.stroke();
        c.setLineDash([]);

        // Rotate circle
        c.beginPath();
        c.arc(rhx, rhy, 8, 0, Math.PI * 2);
        c.fillStyle = '#ffffff';
        c.fill();
        c.strokeStyle = PRIMARY;
        c.lineWidth = 1.5;
        c.stroke();

        // Rotation arrow arc inside circle
        c.beginPath();
        c.arc(rhx, rhy, 4, -Math.PI * 0.75, Math.PI * 0.6);
        c.strokeStyle = PRIMARY;
        c.lineWidth = 1.5;
        c.stroke();
        // Arrowhead tip
        const tipAngle = Math.PI * 0.6;
        const tx = rhx + 4 * Math.cos(tipAngle), ty = rhy + 4 * Math.sin(tipAngle);
        c.beginPath();
        c.moveTo(tx, ty);
        c.lineTo(tx - 3, ty - 2);
        c.moveTo(tx, ty);
        c.lineTo(tx + 1, ty - 3);
        c.strokeStyle = PRIMARY;
        c.lineWidth = 1.5;
        c.stroke();

        // Rotation label (current tiling rotation)
        if (r.tiling.rotation !== 0) {
          c.font = '9px system-ui, sans-serif';
          c.fillStyle = PRIMARY;
          c.fillText(`${r.tiling.rotation}°`, rhx + 10, rhy + 4);
        }
      }

      // ── Loading spinner inside region ──
      if (ctx.loadingRegionIds.has(r.id)) {
        const cx = px + pw / 2;
        const cy = py + ph / 2;
        const radius = Math.min(pw, ph, 32) / 3;

        if (radius > 4) {
          c.save();
          // Draw dark translucent background circle for the spinner
          c.fillStyle = 'rgba(0, 0, 0, 0.45)';
          c.beginPath();
          c.arc(cx, cy, radius + 6, 0, Math.PI * 2);
          c.fill();

          // Draw spinning arc
          c.translate(cx, cy);
          const angle = (Date.now() / 150) % (Math.PI * 2);
          c.rotate(angle);
          c.beginPath();
          c.arc(0, 0, radius, 0, Math.PI * 1.5); // 3/4 circle
          c.strokeStyle = PRIMARY;
          c.lineWidth = Math.max(1.5, radius / 4);
          c.lineCap = 'round';
          c.stroke();
          c.restore();
        }
      }
    }

    // Draft (new region being drawn)
    if (draft) {
      c.strokeStyle = '#22c55e';
      c.setLineDash([4, 3]);
      c.lineWidth = 1;
      c.strokeRect(draft.x * VIEW + 0.5, draft.y * VIEW + 0.5, draft.w * VIEW, draft.h * VIEW);
      c.setLineDash([]);
    }
  }, [ctx.regions, ctx.selectedRegionId, ctx.selectedRegionIds, ctx.loadingRegionIds, draft, PRIMARY, PRIMARY_DIM, PRIMARY_FILL, MULTI_STROKE]);

  // Render loop to animate spinners inside loading regions
  useEffect(() => {
    if (ctx.loadingRegionIds.size === 0) {
      drawOverlay();
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const tick = () => {
      drawOverlay();
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [ctx.loadingRegionIds, drawOverlay]);

  // Convert pointer/drag event to [0,1] normalized coords
  const toNorm = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = overlayRef.current!.getBoundingClientRect();
    return [
      clamp01((e.clientX - r.left) / r.width),
      clamp01((e.clientY - r.top)  / r.height),
    ];
  };

  // Hit test: returns handle name, 'rotate', or null
  const hitGizmo = (region: Region, pxX: number, pxY: number): Handle | 'rotate' | null => {
    const HIT = HIT_PX / VIEW;
    // Rotate handle
    const [rhx, rhy] = getRotateHandlePos(region.rect);
    const rnx = rhx / VIEW, rny = rhy / VIEW;
    if (Math.abs(pxX - rnx) < HIT && Math.abs(pxY - rny) < HIT) return 'rotate';
    // Resize handles
    for (const h of ALL_HANDLES) {
      const [hx, hy] = getHandlePos(region.rect, h);
      if (Math.abs(pxX - hx) < HIT && Math.abs(pxY - hy) < HIT) return h;
    }
    return null;
  };

  const hitRegion = (nx: number, ny: number): Region | null => {
    for (let i = ctx.regions.length - 1; i >= 0; i--) {
      const r = ctx.regions[i];
      if (nx >= r.rect.x && nx <= r.rect.x + r.rect.w &&
          ny >= r.rect.y && ny <= r.rect.y + r.rect.h) return r;
    }
    return null;
  };

  const isInsideRegion = (r: Region, nx: number, ny: number) =>
    nx >= r.rect.x && nx <= r.rect.x + r.rect.w &&
    ny >= r.rect.y && ny <= r.rect.y + r.rect.h;

  // Dynamic cursor — always use high-contrast custom cursors (readable on dark canvas bg)
  const getCursor = (): string => {
    if (drag) {
      if (drag.kind === 'draw')   return 'var(--cur-crosshair)';
      if (drag.kind === 'move')   return 'var(--cur-move)';
      if (drag.kind === 'resize') return getHandleCursor(drag.handle); // resize cursors are always visible
    }
    if (!hover) return 'var(--cur-crosshair)';
    if (hover === 'rotate') return 'var(--cur-alias)';
    if (hover === 'move')   return 'var(--cur-move)';
    return getHandleCursor(hover as Handle);
  };

  // ── Pointer events ────────────────────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent) => {
    overlayRef.current!.setPointerCapture(e.pointerId);

    // 0) Right-click (2) or Middle-click (1) triggers panning
    if (e.button === 1 || e.button === 2) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    const [nx, ny] = toNorm(e);
    const sel = ctx.regions.find((r) => r.id === ctx.selectedRegionId) ?? null;

    // 1) Gizmo handles on selected region take first priority
    if (sel) {
      const target = hitGizmo(sel, nx, ny);
      if (target === 'rotate') {
        // Click rotate → cycle tiling rotation +90°
        const next = ((sel.tiling.rotation + 90) % 360) as 0 | 90 | 180 | 270;
        ctx.updateRegionTiling(sel.id, { rotation: next });
        return;
      }
      if (target) {
        setDrag({ kind: 'resize', id: sel.id, handle: target, origRect: { ...sel.rect } });
        return;
      }
    }

    // 2) Click on a region
    const hit = hitRegion(nx, ny);
    if (hit) {
      if (e.shiftKey) {
        // Toggle multi-selection; don't start a drag
        const next = new Set(ctx.selectedRegionIds);
        if (next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
        ctx.selectRegion(hit.id);
        ctx.setSelectedRegionIds(next);
        return;
      }

      // Determine which regions to move
      const isMemberOfMulti = ctx.selectedRegionIds.has(hit.id) && ctx.selectedRegionIds.size > 1;
      const toMoveIds = isMemberOfMulti ? [...ctx.selectedRegionIds] : [hit.id];

      if (!isMemberOfMulti) {
        ctx.selectRegion(hit.id);
        ctx.setSelectedRegionIds(new Set([hit.id]));
      }

      const origRects: Record<string, NormRect> = {};
      for (const id of toMoveIds) {
        const r = ctx.regions.find((x) => x.id === id);
        if (r) origRects[id] = { ...r.rect };
      }

      setDrag({ kind: 'move', ids: toMoveIds, origRects, startNX: nx, startNY: ny });
      return;
    }

    // 3) Click on empty canvas — deselect + start draw
    ctx.selectRegion(null);
    ctx.setSelectedRegionIds(new Set());
    setDrag({ kind: 'draw', startX: nx, startY: ny });
    setDraft({ x: nx, y: ny, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    const [nx, ny] = toNorm(e);
    const free = e.altKey;

    // Update hover cursor when not dragging
    if (!drag) {
      const sel = ctx.regions.find((r) => r.id === ctx.selectedRegionId) ?? null;
      if (sel) {
        const target = hitGizmo(sel, nx, ny);
        if (target) { setHover(target); return; }
        if (isInsideRegion(sel, nx, ny)) { setHover('move'); return; }
      }
      // Also detect hover on non-selected regions for 'move' cursor
      const any = hitRegion(nx, ny);
      setHover(any ? 'move' : null);
      return;
    }

    // Handle active drag
    if (drag.kind === 'draw') {
      const x = Math.min(drag.startX, nx), y = Math.min(drag.startY, ny);
      const w = Math.abs(nx - drag.startX), h = Math.abs(ny - drag.startY);
      setDraft({
        x: snapV(x, free), y: snapV(y, free),
        w: snapV(w, free), h: snapV(h, free),
      });
    } else if (drag.kind === 'move') {
      const dx = snapV(nx, free) - snapV(drag.startNX, free);
      const dy = snapV(ny, free) - snapV(drag.startNY, free);
      for (const id of drag.ids) {
        const orig = drag.origRects[id];
        if (!orig) continue;
        const newX = clamp01(Math.min(orig.x + dx, 1 - orig.w));
        const newY = clamp01(Math.min(orig.y + dy, 1 - orig.h));
        ctx.updateRegionRect(id, { ...orig, x: newX, y: newY });
      }
    } else if (drag.kind === 'resize') {
      const newRect = applyResize(drag.handle, drag.origRect, nx, ny, free);
      ctx.updateRegionRect(drag.id, newRect);
    }
  };

  const onPointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (drag?.kind === 'draw' && draft && draft.w > 0.02 && draft.h > 0.02) {
      ctx.addRegion(draft);
    }
    setDraft(null);
    setDrag(null);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const assetJson = e.dataTransfer.getData('application/json');
    if (!assetJson) return;
    let targetRegionId: string | null = null;
    try {
      const asset = JSON.parse(assetJson);
      const [nx, ny] = toNorm(e);
      const hit = hitRegion(nx, ny);
      if (!hit) return;

      targetRegionId = hit.id;
      // Select region
      ctx.selectRegion(hit.id);
      ctx.setSelectedRegionIds(new Set([hit.id]));

      // Load and assign Polyhaven material
      ctx.setLoadingRegionId(hit.id, true);
      const mat = await loadPolyhavenMaterial(asset);
      ctx.assignMaterialToRegion(hit.id, mat);
    } catch (err) {
      console.error('Failed to assign dropped material:', err);
    } finally {
      if (targetRegionId) {
        ctx.setLoadingRegionId(targetRegionId, false);
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!stageRef.current) return;

    const zoomFactor = 1.15;
    let nextZoom = zoom;
    if (e.deltaY < 0) {
      nextZoom = Math.min(5, zoom * zoomFactor);
    } else {
      nextZoom = Math.max(0.2, zoom / zoomFactor);
    }

    // Zoom centered on the cursor position
    const rect = stageRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const canvasX = (mouseX - pan.x) / zoom;
    const canvasY = (mouseY - pan.y) / zoom;

    const newPanX = mouseX - canvasX * nextZoom;
    const newPanY = mouseY - canvasY * nextZoom;

    setZoom(nextZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const onWrapPointerDown = (e: React.PointerEvent) => {
    if (e.target === e.currentTarget) {
      ctx.selectRegion(null);
      ctx.setSelectedRegionIds(new Set());
    }
  };

  return (
    <div className={styles.wrap} onPointerDown={onWrapPointerDown}>
      <div
        ref={stageRef}
        className={styles.stage}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className={styles.canvasContainer}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: VIEW,
            height: VIEW,
            position: 'absolute',
          }}
        >
          <canvas ref={previewRef} className={styles.canvas} width={VIEW} height={VIEW} />
          <canvas
            ref={overlayRef}
            className={styles.overlay}
            style={{ cursor: isPanning ? 'grabbing' : getCursor() }}
            width={VIEW}
            height={VIEW}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={onDrop}
          />
        </div>

        {/* Floating Zoom Controls */}
        <div className={`${styles.zoomControls} ${Math.abs(zoom - 1) > 1e-4 ? styles.not100 : ''}`}>
          <span className={styles.zoomVal}>{Math.round(zoom * 100)}%</span>
          <div className={styles.zoomButtons}>
            <button onClick={() => setZoom(z => Math.min(5, z * 1.2))} title="Zoom In">+</button>
            <button onClick={() => setZoom(z => Math.max(0.2, z / 1.2))} title="Zoom Out">-</button>
            <button onClick={() => {
              setZoom(1);
              setPan({
                x: (stageSize.width - VIEW) / 2,
                y: (stageSize.height - VIEW) / 2
              });
            }} title="Reset View">Reset</button>
          </div>
        </div>
      </div>
      <div className={styles.hint}>
        Alt = free move · Shift+click = multi-select · Click ↻ = rotate UV 90° · Drag middle/right click = pan
      </div>
    </div>
  );
}
