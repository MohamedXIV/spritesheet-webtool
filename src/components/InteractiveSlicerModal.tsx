'use client';

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, Plus, RotateCcw } from 'lucide-react';
import {
  computeSliceLayout,
  convertLayoutToCustomGuides,
  updateSettingsFromGuideDrag,
  type GuideDragHandle,
  type SheetSliceSettings,
} from '@/lib/slicerGuides';
import styles from './InteractiveSlicerModal.module.css';

interface InteractiveSlicerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  fileName: string;
  imgDimensions: { width: number; height: number };
  settings: SheetSliceSettings;
  onSettingsChange: (next: SheetSliceSettings) => void;
  onApplySlice: (settings: SheetSliceSettings) => void;
  isSlicing: boolean;
  isReslicing: boolean;
}

export function InteractiveSlicerModal({
  isOpen,
  onClose,
  imageSrc,
  fileName,
  imgDimensions,
  settings,
  onSettingsChange,
  onApplySlice,
  isSlicing,
  isReslicing,
}: InteractiveSlicerModalProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [dragHandle, setDragHandle] = useState<GuideDragHandle | null>(null);
  const [dragPosPx, setDragPosPx] = useState<number | null>(null);
  const [hoverRectIdx, setHoverRectIdx] = useState<number | null>(null);
  const panOriginRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const sheetW = imgDimensions.width;
  const sheetH = imgDimensions.height;

  const fitToStage = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 40;
    const scale = Math.min(
      Math.max(0.25, (rect.width - pad * 2) / sheetW),
      Math.max(0.25, (rect.height - pad * 2) / sheetH),
      8
    );
    const nextZoom = Math.max(0.25, Math.min(8, Number(scale.toFixed(2))));
    setZoom(nextZoom);
    setPan({
      x: Math.round((rect.width - sheetW * nextZoom) / 2),
      y: Math.round((rect.height - sheetH * nextZoom) / 2),
    });
  }, [sheetW, sheetH]);

  useEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(fitToStage);
    return () => cancelAnimationFrame(id);
  }, [isOpen, fitToStage]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (!(e.target instanceof HTMLInputElement)) {
          setSpacePressed(true);
        }
      } else if (e.key === 'Escape') {
        onClose();
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
  }, [isOpen, onClose]);

  const layout = useMemo(
    () => computeSliceLayout(sheetW, sheetH, settings),
    [sheetW, sheetH, settings]
  );

  const clientToSheet = useCallback(
    (clientX: number, clientY: number) => {
      const el = stageRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom]
  );

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nextZoom = Math.max(0.25, Math.min(16, Number((zoom * factor).toFixed(3))));
    const ratio = nextZoom / zoom;
    setPan({
      x: mx - (mx - pan.x) * ratio,
      y: my - (my - pan.y) * ratio,
    });
    setZoom(nextZoom);
  };

  const handleStageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (spacePressed || e.button === 1) {
      setIsPanning(true);
      panOriginRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  };

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning && panOriginRef.current) {
      setPan({
        x: panOriginRef.current.panX + (e.clientX - panOriginRef.current.x),
        y: panOriginRef.current.panY + (e.clientY - panOriginRef.current.y),
      });
      return;
    }

    if (dragHandle) {
      const pt = clientToSheet(e.clientX, e.clientY);
      const isX =
        dragHandle.kind === 'offset-x' ||
        dragHandle.kind === 'step-x' ||
        dragHandle.kind === 'spacing-x' ||
        dragHandle.kind === 'custom-x';
      const coord = Math.round(isX ? pt.x : pt.y);
      setDragPosPx(coord);
      const updated = updateSettingsFromGuideDrag(settings, sheetW, sheetH, dragHandle, coord);
      onSettingsChange(updated);
    }
  };

  const handleStageMouseUp = () => {
    setIsPanning(false);
    panOriginRef.current = null;
    setDragHandle(null);
    setDragPosPx(null);
  };

  const startGuideDrag = (
    e: React.MouseEvent,
    handle: GuideDragHandle
  ) => {
    if (spacePressed || e.button !== 0) return;
    e.stopPropagation();
    setDragHandle(handle);
  };

  const switchMode = (mode: SheetSliceSettings['sliceType']) => {
    if (mode === 'custom') {
      const { colGuides, rowGuides } = convertLayoutToCustomGuides(sheetW, sheetH, settings);
      onSettingsChange({
        ...settings,
        sliceType: 'custom',
        customColGuides: colGuides,
        customRowGuides: rowGuides,
      });
    } else {
      onSettingsChange({
        ...settings,
        sliceType: mode,
        cellWidth: layout.effectiveCellWidth,
        cellHeight: layout.effectiveCellHeight,
        cols: Math.max(1, layout.cols),
        rows: Math.max(1, layout.rows),
      });
    }
  };

  const addCustomGuide = (axis: 'x' | 'y') => {
    const base = settings.sliceType === 'custom'
      ? {
          colGuides: [...(settings.customColGuides ?? [0, sheetW])],
          rowGuides: [...(settings.customRowGuides ?? [0, sheetH])],
        }
      : convertLayoutToCustomGuides(sheetW, sheetH, settings);

    const arr = axis === 'x' ? base.colGuides : base.rowGuides;
    // Insert midpoint of widest interval
    let bestIdx = 0;
    let bestGap = 0;
    for (let i = 0; i < arr.length - 1; i++) {
      const gap = arr[i + 1] - arr[i];
      if (gap > bestGap) {
        bestGap = gap;
        bestIdx = i;
      }
    }
    const mid = Math.round((arr[bestIdx] + arr[bestIdx + 1]) / 2);
    if (!arr.includes(mid)) arr.push(mid);
    arr.sort((a, b) => a - b);

    onSettingsChange({
      ...settings,
      sliceType: 'custom',
      customColGuides: base.colGuides,
      customRowGuides: base.rowGuides,
    });
  };

  const removeCustomGuide = (axis: 'x' | 'y', index: number) => {
    const arr = axis === 'x'
      ? [...(settings.customColGuides ?? [])]
      : [...(settings.customRowGuides ?? [])];
    if (arr.length <= 2) return;
    arr.splice(index, 1);
    onSettingsChange({
      ...settings,
      ...(axis === 'x' ? { customColGuides: arr } : { customRowGuides: arr }),
    });
  };

  if (!isOpen) return null;

  const outW = settings.sliceAsMasks
    ? layout.effectiveCellWidth
    : Math.max(1, layout.effectiveCellWidth - settings.innerPadding * 2);
  const outH = settings.sliceAsMasks
    ? layout.effectiveCellHeight
    : Math.max(1, layout.effectiveCellHeight - settings.innerPadding * 2);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <h3 className={styles.title}>Interactive Spritesheet Slicer — {fileName}</h3>
            <span className={styles.dimensionsPill}>{sheetW} × {sheetH} px</span>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.zoomToolbar}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setZoom(z => Math.max(0.25, Number((z / 1.25).toFixed(2))))}
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setZoom(z => Math.min(16, Number((z * 1.25).toFixed(2))))}
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
              <button type="button" className={styles.iconBtn} onClick={fitToStage} title="Fit to View">
                <Maximize2 size={13} /> Fit
              </button>
            </div>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close slicer">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className={styles.body}>
          <div
            ref={stageRef}
            className={`${styles.canvasStage} ${spacePressed || isPanning ? styles.canvasStagePanning : ''}`}
            onWheel={handleWheel}
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onMouseLeave={handleStageMouseUp}
          >
            <div
              className={styles.stageContent}
              style={{
                width: sheetW,
                height: sheetH,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <div className={styles.checkerboard} />
              <img src={imageSrc} alt={fileName} className={styles.sheetImg} width={sheetW} height={sheetH} />

              <svg
                className={styles.guideOverlay}
                width={sheetW}
                height={sheetH}
                viewBox={`0 0 ${sheetW} ${sheetH}`}
              >
                {/* Offset / Margin shading */}
                {settings.offsetX > 0 && (
                  <rect x={0} y={0} width={settings.offsetX} height={sheetH} fill="rgba(239, 68, 68, 0.22)" />
                )}
                {settings.offsetY > 0 && (
                  <rect x={0} y={0} width={sheetW} height={settings.offsetY} fill="rgba(239, 68, 68, 0.22)" />
                )}

                {/* Gutter / Spacing shading */}
                {settings.sliceType !== 'custom' && settings.spacingX > 0 &&
                  layout.colEdges.slice(0, -1).map((edge, i) => (
                    <rect
                      key={`gx-${i}`}
                      x={edge.end}
                      y={0}
                      width={settings.spacingX}
                      height={sheetH}
                      fill="rgba(245, 158, 11, 0.24)"
                    />
                  ))}
                {settings.sliceType !== 'custom' && settings.spacingY > 0 &&
                  layout.rowEdges.slice(0, -1).map((edge, i) => (
                    <rect
                      key={`gy-${i}`}
                      x={0}
                      y={edge.end}
                      width={sheetW}
                      height={settings.spacingY}
                      fill="rgba(245, 158, 11, 0.24)"
                    />
                  ))}

                {/* Individual slice cell boxes + inner padding + frame numbers */}
                {layout.rects.map(rect => (
                  <g
                    key={rect.index}
                    onMouseEnter={() => setHoverRectIdx(rect.index)}
                    onMouseLeave={() => setHoverRectIdx(null)}
                  >
                    <rect
                      x={rect.x}
                      y={rect.y}
                      width={rect.w}
                      height={rect.h}
                      fill={hoverRectIdx === rect.index ? 'rgba(139, 92, 246, 0.16)' : 'transparent'}
                      stroke="rgba(56, 189, 248, 0.8)"
                      strokeWidth={1 / zoom}
                    />
                    {settings.innerPadding > 0 && (
                      <rect
                        x={rect.x + rect.innerX}
                        y={rect.y + rect.innerY}
                        width={rect.innerW}
                        height={rect.innerH}
                        fill="none"
                        stroke="rgba(16, 185, 129, 0.9)"
                        strokeWidth={1 / zoom}
                        strokeDasharray={`${3 / zoom} ${2 / zoom}`}
                      />
                    )}
                    <text
                      x={rect.x + 3 / zoom}
                      y={rect.y + 11 / zoom}
                      fontSize={10 / zoom}
                      fontWeight="700"
                      fill="#ffffff"
                      stroke="#000000"
                      strokeWidth={2 / zoom}
                      paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}
                    >
                      #{rect.index + 1}
                    </text>
                  </g>
                ))}

                {/* Interactive Draggable Guides */}
                {settings.sliceType === 'custom' ? (
                  <>
                    {(settings.customColGuides ?? []).map((x, idx) => (
                      <g key={`cx-${idx}`}>
                        <line
                          x1={x} y1={0} x2={x} y2={sheetH}
                          stroke="#a855f7"
                          strokeWidth={1.5 / zoom}
                        />
                        <line
                          x1={x} y1={0} x2={x} y2={sheetH}
                          stroke="transparent"
                          strokeWidth={10 / zoom}
                          style={{ cursor: 'col-resize' }}
                          onMouseDown={e => startGuideDrag(e, { kind: 'custom-x', index: idx })}
                        />
                      </g>
                    ))}
                    {(settings.customRowGuides ?? []).map((y, idx) => (
                      <g key={`cy-${idx}`}>
                        <line
                          x1={0} y1={y} x2={sheetW} y2={y}
                          stroke="#a855f7"
                          strokeWidth={1.5 / zoom}
                        />
                        <line
                          x1={0} y1={y} x2={sheetW} y2={y}
                          stroke="transparent"
                          strokeWidth={10 / zoom}
                          style={{ cursor: 'row-resize' }}
                          onMouseDown={e => startGuideDrag(e, { kind: 'custom-y', index: idx })}
                        />
                      </g>
                    ))}
                  </>
                ) : (
                  <>
                    {/* Offset X & Y draggable lines */}
                    <line
                      x1={settings.offsetX} y1={0} x2={settings.offsetX} y2={sheetH}
                      stroke="#ef4444" strokeWidth={1.5 / zoom}
                    />
                    <line
                      x1={settings.offsetX} y1={0} x2={settings.offsetX} y2={sheetH}
                      stroke="transparent" strokeWidth={10 / zoom}
                      style={{ cursor: 'col-resize' }}
                      onMouseDown={e => startGuideDrag(e, { kind: 'offset-x' })}
                    />

                    <line
                      x1={0} y1={settings.offsetY} x2={sheetW} y2={settings.offsetY}
                      stroke="#ef4444" strokeWidth={1.5 / zoom}
                    />
                    <line
                      x1={0} y1={settings.offsetY} x2={sheetW} y2={settings.offsetY}
                      stroke="transparent" strokeWidth={10 / zoom}
                      style={{ cursor: 'row-resize' }}
                      onMouseDown={e => startGuideDrag(e, { kind: 'offset-y' })}
                    />

                    {/* First Cell Step draggable lines (Cell W / H) */}
                    {layout.colEdges[0] && (
                      <>
                        <line
                          x1={layout.colEdges[0].end} y1={0} x2={layout.colEdges[0].end} y2={sheetH}
                          stroke="#38bdf8" strokeWidth={2 / zoom}
                        />
                        <line
                          x1={layout.colEdges[0].end} y1={0} x2={layout.colEdges[0].end} y2={sheetH}
                          stroke="transparent" strokeWidth={10 / zoom}
                          style={{ cursor: 'col-resize' }}
                          onMouseDown={e =>
                            startGuideDrag(
                              e,
                              e.altKey ? { kind: 'custom-x', index: 1 } : { kind: 'step-x' }
                            )
                          }
                        />
                      </>
                    )}
                    {layout.rowEdges[0] && (
                      <>
                        <line
                          x1={0} y1={layout.rowEdges[0].end} x2={sheetW} y2={layout.rowEdges[0].end}
                          stroke="#38bdf8" strokeWidth={2 / zoom}
                        />
                        <line
                          x1={0} y1={layout.rowEdges[0].end} x2={sheetW} y2={layout.rowEdges[0].end}
                          stroke="transparent" strokeWidth={10 / zoom}
                          style={{ cursor: 'row-resize' }}
                          onMouseDown={e =>
                            startGuideDrag(
                              e,
                              e.altKey ? { kind: 'custom-y', index: 1 } : { kind: 'step-y' }
                            )
                          }
                        />
                      </>
                    )}

                    {/* Spacing/Gutter draggable lines (2nd cell start) */}
                    {layout.colEdges[1] && (
                      <>
                        <line
                          x1={layout.colEdges[1].start} y1={0} x2={layout.colEdges[1].start} y2={sheetH}
                          stroke="#f59e0b" strokeWidth={1.5 / zoom}
                        />
                        <line
                          x1={layout.colEdges[1].start} y1={0} x2={layout.colEdges[1].start} y2={sheetH}
                          stroke="transparent" strokeWidth={10 / zoom}
                          style={{ cursor: 'col-resize' }}
                          onMouseDown={e => startGuideDrag(e, { kind: 'spacing-x' })}
                        />
                      </>
                    )}
                    {layout.rowEdges[1] && (
                      <>
                        <line
                          x1={0} y1={layout.rowEdges[1].start} x2={sheetW} y2={layout.rowEdges[1].start}
                          stroke="#f59e0b" strokeWidth={1.5 / zoom}
                        />
                        <line
                          x1={0} y1={layout.rowEdges[1].start} x2={sheetW} y2={layout.rowEdges[1].start}
                          stroke="transparent" strokeWidth={10 / zoom}
                          style={{ cursor: 'row-resize' }}
                          onMouseDown={e => startGuideDrag(e, { kind: 'spacing-y' })}
                        />
                      </>
                    )}
                  </>
                )}
              </svg>
            </div>

            <div className={styles.hudPill}>
              <span>Red: Offset</span>
              <span>Blue: Cell Size</span>
              <span>Amber: Spacing</span>
              <span>Alt+Drag / Custom: Per-Line</span>
              <span>Space+Drag: Pan</span>
              {dragPosPx !== null && <strong>Pos: {dragPosPx}px</strong>}
            </div>
          </div>

          <aside className={styles.sidebar}>
            <div className={styles.sidebarScroll}>
              <div className={styles.tabsRow}>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${settings.sliceType === 'grid' ? styles.tabBtnActive : ''}`}
                  onClick={() => switchMode('grid')}
                >
                  Grid
                </button>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${settings.sliceType === 'dimensions' ? styles.tabBtnActive : ''}`}
                  onClick={() => switchMode('dimensions')}
                >
                  Cell Size
                </button>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${settings.sliceType === 'custom' ? styles.tabBtnActive : ''}`}
                  onClick={() => switchMode('custom')}
                >
                  Custom
                </button>
              </div>

              {settings.sliceType === 'grid' && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Grid Division</div>
                  <div className={styles.grid2}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Columns</label>
                      <input
                        type="number"
                        min={1}
                        max={128}
                        value={settings.cols}
                        onChange={e => onSettingsChange({ ...settings, cols: Math.max(1, Number(e.target.value) || 1) })}
                        className={styles.numberInput}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Rows</label>
                      <input
                        type="number"
                        min={1}
                        max={128}
                        value={settings.rows}
                        onChange={e => onSettingsChange({ ...settings, rows: Math.max(1, Number(e.target.value) || 1) })}
                        className={styles.numberInput}
                      />
                    </div>
                  </div>
                </div>
              )}

              {settings.sliceType === 'dimensions' && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Cell Dimensions (px)</div>
                  <div className={styles.grid2}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Cell Width</label>
                      <input
                        type="number"
                        min={1}
                        max={sheetW}
                        value={settings.cellWidth}
                        onChange={e => onSettingsChange({ ...settings, cellWidth: Math.max(1, Number(e.target.value) || 1) })}
                        className={styles.numberInput}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Cell Height</label>
                      <input
                        type="number"
                        min={1}
                        max={sheetH}
                        value={settings.cellHeight}
                        onChange={e => onSettingsChange({ ...settings, cellHeight: Math.max(1, Number(e.target.value) || 1) })}
                        className={styles.numberInput}
                      />
                    </div>
                  </div>
                </div>
              )}

              {settings.sliceType === 'custom' && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>
                    <span>Custom Guides</span>
                    <button type="button" className={styles.miniBtn} onClick={() => switchMode('grid')}>
                      <RotateCcw size={11} /> Reset
                    </button>
                  </div>
                  <div className={styles.customGuideActions}>
                    <button type="button" className={styles.miniBtn} onClick={() => addCustomGuide('x')}>
                      <Plus size={12} /> Vertical Guide
                    </button>
                    <button type="button" className={styles.miniBtn} onClick={() => addCustomGuide('y')}>
                      <Plus size={12} /> Horizontal Guide
                    </button>
                  </div>
                  <div className={styles.fieldLabel}>Vertical Cuts (X px)</div>
                  <div className={styles.guideList}>
                    {(settings.customColGuides ?? []).map((x, idx) => (
                      <span key={`cx-chip-${idx}`} className={styles.guideChip}>
                        {x}
                        {(settings.customColGuides?.length ?? 0) > 2 && (
                          <button
                            type="button"
                            className={styles.guideChipBtn}
                            onClick={() => removeCustomGuide('x', idx)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className={styles.fieldLabel}>Horizontal Cuts (Y px)</div>
                  <div className={styles.guideList}>
                    {(settings.customRowGuides ?? []).map((y, idx) => (
                      <span key={`cy-chip-${idx}`} className={styles.guideChip}>
                        {y}
                        {(settings.customRowGuides?.length ?? 0) > 2 && (
                          <button
                            type="button"
                            className={styles.guideChipBtn}
                            onClick={() => removeCustomGuide('y', idx)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {settings.sliceType !== 'custom' && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Offset & Spacing (px)</div>
                  <div className={styles.grid2}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Offset X</label>
                      <input
                        type="number"
                        min={0}
                        max={sheetW - 1}
                        value={settings.offsetX}
                        onChange={e => onSettingsChange({ ...settings, offsetX: Math.max(0, Number(e.target.value) || 0) })}
                        className={styles.numberInput}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Offset Y</label>
                      <input
                        type="number"
                        min={0}
                        max={sheetH - 1}
                        value={settings.offsetY}
                        onChange={e => onSettingsChange({ ...settings, offsetY: Math.max(0, Number(e.target.value) || 0) })}
                        className={styles.numberInput}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Spacing X</label>
                      <input
                        type="number"
                        min={0}
                        max={sheetW}
                        value={settings.spacingX}
                        onChange={e => onSettingsChange({ ...settings, spacingX: Math.max(0, Number(e.target.value) || 0) })}
                        className={styles.numberInput}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Spacing Y</label>
                      <input
                        type="number"
                        min={0}
                        max={sheetH}
                        value={settings.spacingY}
                        onChange={e => onSettingsChange({ ...settings, spacingY: Math.max(0, Number(e.target.value) || 0) })}
                        className={styles.numberInput}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Cell Padding</div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Inner Padding (px per side)</label>
                  <input
                    type="number"
                    min={0}
                    max={Math.floor(Math.min(layout.effectiveCellWidth, layout.effectiveCellHeight) / 2)}
                    value={settings.innerPadding}
                    onChange={e => onSettingsChange({ ...settings, innerPadding: Math.max(0, Number(e.target.value) || 0) })}
                    className={styles.numberInput}
                  />
                </div>
              </div>

              <label className={`${styles.checkboxCard} ${settings.sliceAsMasks ? styles.checkboxCardActive : ''}`}>
                <input
                  type="checkbox"
                  className={styles.checkboxInput}
                  checked={settings.sliceAsMasks}
                  onChange={e => onSettingsChange({ ...settings, sliceAsMasks: e.target.checked })}
                />
                <div>
                  <div className={styles.checkboxTitle}>Slice as Masks (Non-destructive)</div>
                  <div className={styles.checkboxDesc}>
                    Keeps exact frame bounds while storing the sheet offset & cell mask on Base Frame so clipped pixels can be revealed later.
                  </div>
                </div>
              </label>

              <div className={styles.summaryBox}>
                <div className={styles.summaryRow}>
                  <span>Grid:</span>
                  <strong>{layout.cols} × {layout.rows}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Total Frames:</span>
                  <strong>{layout.rects.length}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Output Frame Size:</span>
                  <strong>{outW} × {outH} px</strong>
                </div>
              </div>
            </div>

            <div className={styles.footer}>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.applyBtn}
                disabled={isSlicing || layout.rects.length === 0}
                onClick={() => onApplySlice(settings)}
              >
                {isSlicing
                  ? 'Slicing...'
                  : isReslicing
                    ? `Re-slice (${layout.rects.length})`
                    : `Slice & Import (${layout.rects.length})`}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
