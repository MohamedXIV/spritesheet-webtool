'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Lock,
  Unlock,
  CornerDownRight,
  Folder as FolderIcon,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Copy,
  Layers,
  Sliders,
  PaintBucket,
  CircleDot,
  Globe,
  Film,
  ChevronUp,
  MoreVertical,
} from 'lucide-react';
import { useEditorContext } from '@/contexts/EditorContext';
import type { LayerBlendMode, ProjectLayer } from '@/types';
import {
  BLEND_MODE_OPTIONS,
  DEFAULT_ADJUSTMENT_CONFIG,
  DEFAULT_FILL_CONFIG,
  resolveLayerPixelData,
} from '@/lib/layerCompositor';
import styles from './FrameLayersPanel.module.css';

interface ThumbnailProps {
  bitmap: ImageBitmap | null | undefined;
  offsetX?: number;
  offsetY?: number;
  frameWidth: number;
  frameHeight: number;
  isMask?: boolean;
  inverted?: boolean;
}

function BitmapThumbnail({
  bitmap,
  offsetX = 0,
  offsetY = 0,
  frameWidth,
  frameHeight,
  isMask = false,
  inverted = false,
}: ThumbnailProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isMask) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (!bitmap) return;

    const fw = Math.max(1, frameWidth);
    const fh = Math.max(1, frameHeight);
    const scale = Math.min(canvas.width / fw, canvas.height / fh);
    const dx = (canvas.width - fw * scale) / 2;
    const dy = (canvas.height - fh * scale) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, fw * scale, fh * scale);
    ctx.clip();
    if (isMask && inverted) {
      ctx.filter = 'invert(1)';
    }
    ctx.drawImage(
      bitmap,
      dx + offsetX * scale,
      dy + offsetY * scale,
      bitmap.width * scale,
      bitmap.height * scale
    );
    ctx.restore();
  }, [bitmap, offsetX, offsetY, frameWidth, frameHeight, isMask, inverted]);

  return <canvas ref={ref} width={30} height={30} className={styles.thumbCanvas} />;
}

export function FrameLayersPanel() {
  const {
    orderedFrames = [],
    currentFrame = 0,
    globalLayers = [],
    activeLayerId = '',
    setActiveLayerId = () => {},
    editTarget = 'layer',
    setEditTarget = () => {},
    maskSoloLayerId = null,
    setMaskSoloLayerId = () => {},
    selectionMask = null,
    addGlobalLayer = () => {},
    duplicateGlobalLayer = async () => {},
    deleteGlobalLayer = async () => {},
    reorderGlobalLayers = async () => {},
    updateGlobalLayer = async () => {},
    mergeLayerDown = async () => {},
    mergeVisibleLayers = async () => {},
    flattenLayers = async () => {},
    addLayerMask = async () => {},
    maskFromSelection = async () => {},
    invertLayerMask = async () => {},
    applyLayerMask = async () => {},
    deleteLayerMask = async () => {},
  } = useEditorContext();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    layer: ProjectLayer;
  } | null>(null);

  const activeFrameData = orderedFrames[currentFrame];
  const frameW = activeFrameData?.bitmap.width ?? 64;
  const frameH = activeFrameData?.bitmap.height ?? 64;

  const activeLayer = useMemo(
    () => globalLayers.find(l => l.id === activeLayerId) ?? globalLayers[0],
    [globalLayers, activeLayerId]
  );

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // Display top-to-bottom (Photoshop order), hiding children of collapsed groups
  const displayEntries = useMemo(() => {
    const collapsedGroups = new Set(
      globalLayers.filter(l => l.type === 'group' && l.collapsed).map(l => l.id)
    );
    const reversed = [...globalLayers].map((layer, actualIndex) => ({ layer, actualIndex })).reverse();
    return reversed.filter(({ layer }) => {
      let pid = layer.parentId;
      while (pid) {
        if (collapsedGroups.has(pid)) return false;
        const parent = globalLayers.find(g => g.id === pid);
        pid = parent?.parentId ?? null;
      }
      return true;
    });
  }, [globalLayers]);

  const getDepth = (layer: ProjectLayer): number => {
    let depth = 0;
    let pid = layer.parentId;
    while (pid && depth < 4) {
      depth++;
      pid = globalLayers.find(g => g.id === pid)?.parentId ?? null;
    }
    return depth;
  };

  const commitRename = (id: string) => {
    if (editingName.trim()) {
      void updateGlobalLayer(id, { name: editingName.trim() });
    }
    setEditingId(null);
  };

  const activePixelData = activeLayer
    ? resolveLayerPixelData(activeLayer, activeFrameData?.layers)
    : undefined;
  const hasFrames = orderedFrames.length > 0;

  return (
    <div className={styles.container}>
      {/* Top Photoshop-style Blending, Opacity & Locks */}
      <div className={styles.topBar}>
        <div className={styles.topTitleRow}>
          <span className={styles.title}>Layers</span>
          {hasFrames && (
            <span className={styles.frameBadge}>
              Frame {currentFrame + 1} / {orderedFrames.length}
            </span>
          )}
        </div>

        <div className={styles.blendOpacityRow}>
          <select
            className={styles.blendSelect}
            value={activeLayer?.blendMode ?? 'normal'}
            disabled={!activeLayer || !hasFrames}
            onChange={e =>
              activeLayer && void updateGlobalLayer(activeLayer.id, { blendMode: e.target.value as LayerBlendMode })
            }
            title="Layer Blend Mode"
          >
            {BLEND_MODE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className={styles.opacityWrap}>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((activeLayer?.opacity ?? 1) * 100)}
              disabled={!activeLayer || !hasFrames}
              onChange={e =>
                activeLayer &&
                void updateGlobalLayer(activeLayer.id, { opacity: Number(e.target.value) / 100 })
              }
              className={styles.opacitySlider}
              title="Layer Opacity"
            />
            <span className={styles.opacityValue}>
              {Math.round((activeLayer?.opacity ?? 1) * 100)}%
            </span>
          </div>
        </div>

        <div className={styles.locksRow}>
          <div className={styles.lockGroup}>
            <button
              type="button"
              className={`${styles.lockBtn} ${activeLayer?.alphaLocked ? styles.lockBtnActive : ''}`}
              disabled={!activeLayer || activeLayer.type !== 'raster'}
              onClick={() =>
                activeLayer && void updateGlobalLayer(activeLayer.id, { alphaLocked: !activeLayer.alphaLocked })
              }
              title="Lock Transparent Pixels (Alpha Lock)"
            >
              α Lock
            </button>
            <button
              type="button"
              className={`${styles.lockBtn} ${activeLayer?.locked ? styles.lockBtnActive : ''}`}
              disabled={!activeLayer}
              onClick={() =>
                activeLayer && void updateGlobalLayer(activeLayer.id, { locked: !activeLayer.locked })
              }
              title="Lock Layer (Prevent Painting/Moving)"
            >
              {activeLayer?.locked ? <Lock size={11} /> : <Unlock size={11} />} Lock
            </button>
            <button
              type="button"
              className={`${styles.lockBtn} ${activeLayer?.clipped ? styles.lockBtnActive : ''}`}
              disabled={!activeLayer || activeLayer.id === 'layer-base' || activeLayer.type === 'group'}
              onClick={() =>
                activeLayer && void updateGlobalLayer(activeLayer.id, { clipped: !activeLayer.clipped })
              }
              title="Clipping Mask (Clip to layer below)"
            >
              <CornerDownRight size={11} /> Clip
            </button>
          </div>

          <button
            type="button"
            className={`${styles.lockBtn} ${activeLayer?.scope === 'shared' ? styles.lockBtnActive : ''}`}
            disabled={!activeLayer || activeLayer.id === 'layer-base' || activeLayer.type === 'group'}
            onClick={() =>
              activeLayer &&
              void updateGlobalLayer(activeLayer.id, {
                scope: activeLayer.scope === 'shared' ? 'per-frame' : 'shared',
              })
            }
            title="Toggle Per-Frame vs Shared across all frames"
          >
            {activeLayer?.scope === 'shared' ? <Globe size={11} /> : <Film size={11} />}
            {activeLayer?.scope === 'shared' ? 'Shared' : 'Frame'}
          </button>
        </div>
      </div>

      {/* Layer Stack */}
      <div className={styles.layersList}>
        {!hasFrames ? (
          <div className={styles.emptyState}>
            Import a video, GIF, images, or slice a spritesheet to start working with layers & masks.
          </div>
        ) : (
          displayEntries.map(({ layer, actualIndex }) => {
            const isActive = layer.id === activeLayerId;
            const depth = getDepth(layer);
            const pixelData = resolveLayerPixelData(layer, activeFrameData?.layers);
            const hasMask = Boolean(pixelData?.maskBitmap);
            const isLayerTarget = isActive && editTarget === 'layer';
            const isMaskTarget = isActive && editTarget === 'mask' && hasMask;

            return (
              <div
                key={layer.id}
                draggable
                onDragStart={() => setDragIndex(actualIndex)}
                onDragOver={e => {
                  e.preventDefault();
                  setDragOverIndex(actualIndex);
                }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={e => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== actualIndex) {
                    const targetParent = layer.type === 'group' ? layer.id : layer.parentId;
                    void reorderGlobalLayers(dragIndex, actualIndex, targetParent);
                  }
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onContextMenu={e => {
                  e.preventDefault();
                  setActiveLayerId(layer.id);
                  setContextMenu({ x: e.clientX, y: e.clientY, layer });
                }}
                className={`${styles.layerRow} ${isActive ? styles.activeRow : ''} ${
                  dragOverIndex === actualIndex ? styles.dragOverRow : ''
                }`}
                style={{ paddingLeft: 6 + depth * 14 }}
                onClick={() => {
                  setActiveLayerId(layer.id);
                  setEditTarget('layer');
                }}
              >
                {/* Visibility Toggle */}
                <button
                  type="button"
                  className={`${styles.eyeBtn} ${layer.visible ? styles.eyeVisible : styles.eyeHidden}`}
                  onClick={e => {
                    e.stopPropagation();
                    void updateGlobalLayer(layer.id, { visible: !layer.visible });
                  }}
                  title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                >
                  {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>

                {/* Clipping indicator */}
                {layer.clipped && (
                  <span className={styles.indentGuide} title="Clipped to layer below">
                    <CornerDownRight size={12} />
                  </span>
                )}

                {/* Group Collapse Toggle */}
                {layer.type === 'group' && (
                  <button
                    type="button"
                    className={styles.miniIconBtn}
                    onClick={e => {
                      e.stopPropagation();
                      void updateGlobalLayer(layer.id, { collapsed: !layer.collapsed });
                    }}
                  >
                    {layer.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                )}

                {/* Layer & Mask Thumbnails */}
                <div className={styles.thumbsWrap} onClick={e => e.stopPropagation()}>
                  <div
                    className={`${styles.thumbBox} ${isLayerTarget ? styles.thumbTargetActive : ''}`}
                    onClick={() => {
                      setActiveLayerId(layer.id);
                      setEditTarget('layer');
                    }}
                    title="Select Layer Content"
                  >
                    {layer.type === 'raster' ? (
                      <BitmapThumbnail
                        bitmap={pixelData?.bitmap}
                        offsetX={pixelData?.offsetX}
                        offsetY={pixelData?.offsetY}
                        frameWidth={frameW}
                        frameHeight={frameH}
                      />
                    ) : layer.type === 'fill' ? (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background:
                            layer.fillConfig?.kind === 'gradient'
                              ? `linear-gradient(${layer.fillConfig.angle ?? 90}deg, ${layer.fillConfig.color}, ${
                                  layer.fillConfig.gradientEnd ?? '#000'
                                })`
                              : layer.fillConfig?.color ?? '#7c3aed',
                        }}
                      />
                    ) : layer.type === 'adjustment' ? (
                      <Sliders size={14} />
                    ) : layer.collapsed ? (
                      <FolderIcon size={14} />
                    ) : (
                      <FolderOpen size={14} />
                    )}
                  </div>

                  {hasMask && (
                    <div
                      className={`${styles.thumbBox} ${styles.maskThumbBox} ${
                        isMaskTarget ? styles.thumbTargetActive : ''
                      } ${layer.maskEnabled === false ? styles.maskDisabled : ''}`}
                      onClick={e => {
                        e.stopPropagation();
                        setActiveLayerId(layer.id);
                        setEditTarget('mask');
                        if (e.altKey) {
                          setMaskSoloLayerId(maskSoloLayerId === layer.id ? null : layer.id);
                        }
                      }}
                      title="Click to paint Mask (Alt+Click to solo mask view)"
                    >
                      <BitmapThumbnail
                        bitmap={pixelData?.maskBitmap}
                        frameWidth={frameW}
                        frameHeight={frameH}
                        isMask
                        inverted={Boolean(layer.maskInverted)}
                      />
                      <button
                        type="button"
                        className={styles.maskToggleDot}
                        onClick={e => {
                          e.stopPropagation();
                          void updateGlobalLayer(layer.id, { maskEnabled: layer.maskEnabled === false });
                        }}
                        title={layer.maskEnabled === false ? 'Enable Mask' : 'Disable Mask'}
                      >
                        {layer.maskEnabled === false ? <EyeOff size={8} /> : <Eye size={8} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Layer Name & Badges */}
                <div className={styles.metaCol}>
                  <div className={styles.nameRow}>
                    {editingId === layer.id ? (
                      <input
                        type="text"
                        className={styles.renameInput}
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onBlur={() => commitRename(layer.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(layer.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <span
                        className={styles.layerName}
                        onDoubleClick={e => {
                          e.stopPropagation();
                          setEditingId(layer.id);
                          setEditingName(layer.name);
                        }}
                        title="Double-click to rename"
                      >
                        {layer.name}
                      </span>
                    )}
                  </div>
                  <div className={styles.subRow}>
                    <span className={styles.badge}>{layer.type}</span>
                    {layer.scope === 'shared' && (
                      <span className={`${styles.badge} ${styles.badgeShared}`}>Shared</span>
                    )}
                    {layer.locked && <Lock size={10} />}
                    {layer.alphaLocked && <span>α</span>}
                  </div>
                </div>

                {/* Quick Reorder + Context Menu Trigger */}
                <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className={styles.miniIconBtn}
                    disabled={actualIndex >= globalLayers.length - 1}
                    onClick={() => void reorderGlobalLayers(actualIndex, actualIndex + 1)}
                    title="Move Layer Up"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    type="button"
                    className={styles.miniIconBtn}
                    disabled={actualIndex <= 0}
                    onClick={() => void reorderGlobalLayers(actualIndex, actualIndex - 1)}
                    title="Move Layer Down"
                  >
                    <ChevronDown size={12} />
                  </button>
                  <button
                    type="button"
                    className={styles.miniIconBtn}
                    onClick={e => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setActiveLayerId(layer.id);
                      setContextMenu({ x: rect.left - 140, y: rect.bottom + 4, layer });
                    }}
                    title="Layer Options"
                  >
                    <MoreVertical size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Inline Inspector for Fill or Adjustment Layer */}
      {hasFrames && activeLayer?.type === 'fill' && (
        <div className={styles.inspector}>
          <div className={styles.inspectorTitle}>
            <span>Fill Layer Settings</span>
            <select
              className={styles.blendSelect}
              style={{ flex: 'none', width: 96 }}
              value={activeLayer.fillConfig?.kind ?? 'solid'}
              onChange={e =>
                void updateGlobalLayer(activeLayer.id, {
                  fillConfig: {
                    ...(activeLayer.fillConfig ?? DEFAULT_FILL_CONFIG),
                    kind: e.target.value as 'solid' | 'gradient',
                  },
                })
              }
            >
              <option value="solid">Solid</option>
              <option value="gradient">Gradient</option>
            </select>
          </div>
          <div className={styles.inspectorRow}>
            <span className={styles.inspectorLabel}>Primary</span>
            <input
              type="color"
              className={styles.colorInput}
              value={activeLayer.fillConfig?.color ?? '#7c3aed'}
              onChange={e =>
                void updateGlobalLayer(activeLayer.id, {
                  fillConfig: {
                    ...(activeLayer.fillConfig ?? DEFAULT_FILL_CONFIG),
                    color: e.target.value,
                  },
                })
              }
            />
            {activeLayer.fillConfig?.kind === 'gradient' && (
              <>
                <span className={styles.inspectorLabel} style={{ width: 30 }}>End</span>
                <input
                  type="color"
                  className={styles.colorInput}
                  value={activeLayer.fillConfig?.gradientEnd ?? '#06b6d4'}
                  onChange={e =>
                    void updateGlobalLayer(activeLayer.id, {
                      fillConfig: {
                        ...(activeLayer.fillConfig ?? DEFAULT_FILL_CONFIG),
                        gradientEnd: e.target.value,
                      },
                    })
                  }
                />
              </>
            )}
          </div>
          {activeLayer.fillConfig?.kind === 'gradient' && (
            <div className={styles.inspectorRow}>
              <span className={styles.inspectorLabel}>Angle</span>
              <input
                type="range"
                min={0}
                max={360}
                value={activeLayer.fillConfig?.angle ?? 90}
                onChange={e =>
                  void updateGlobalLayer(activeLayer.id, {
                    fillConfig: {
                      ...(activeLayer.fillConfig ?? DEFAULT_FILL_CONFIG),
                      angle: Number(e.target.value),
                    },
                  })
                }
                className={styles.inspectorSlider}
              />
              <span className={styles.inspectorVal}>{activeLayer.fillConfig?.angle ?? 90}°</span>
            </div>
          )}
        </div>
      )}

      {hasFrames && activeLayer?.type === 'adjustment' && (
        <div className={styles.inspector}>
          <div className={styles.inspectorTitle}>
            <span>Adjustments</span>
            <button
              type="button"
              className={styles.footerBtn}
              onClick={() =>
                void updateGlobalLayer(activeLayer.id, {
                  adjustmentConfig: { ...DEFAULT_ADJUSTMENT_CONFIG },
                })
              }
            >
              Reset
            </button>
          </div>
          {(
            [
              ['Hue', 'hue', -180, 180],
              ['Saturation', 'saturation', -100, 100],
              ['Brightness', 'brightness', -100, 100],
              ['Contrast', 'contrast', -100, 100],
            ] as const
          ).map(([label, key, min, max]) => {
            const cfg = activeLayer.adjustmentConfig ?? DEFAULT_ADJUSTMENT_CONFIG;
            const val = cfg[key] ?? 0;
            return (
              <div key={key} className={styles.inspectorRow}>
                <span className={styles.inspectorLabel}>{label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={val}
                  onChange={e =>
                    void updateGlobalLayer(activeLayer.id, {
                      adjustmentConfig: { ...cfg, [key]: Number(e.target.value) },
                    })
                  }
                  className={styles.inspectorSlider}
                />
                <span className={styles.inspectorVal}>{val}</span>
              </div>
            );
          })}
          <div className={styles.inspectorRow}>
            <span className={styles.inspectorLabel}>Gamma</span>
            <input
              type="range"
              min={10}
              max={300}
              value={Math.round((activeLayer.adjustmentConfig?.levels?.gamma ?? 1) * 100)}
              onChange={e => {
                const cfg = activeLayer.adjustmentConfig ?? DEFAULT_ADJUSTMENT_CONFIG;
                void updateGlobalLayer(activeLayer.id, {
                  adjustmentConfig: {
                    ...cfg,
                    levels: {
                      black: cfg.levels?.black ?? 0,
                      white: cfg.levels?.white ?? 255,
                      gamma: Number(e.target.value) / 100,
                    },
                  },
                });
              }}
              className={styles.inspectorSlider}
            />
            <span className={styles.inspectorVal}>
              {(activeLayer.adjustmentConfig?.levels?.gamma ?? 1).toFixed(2)}
            </span>
          </div>
          <div className={styles.inspectorRow}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Boolean(activeLayer.adjustmentConfig?.invert)}
                onChange={e => {
                  const cfg = activeLayer.adjustmentConfig ?? DEFAULT_ADJUSTMENT_CONFIG;
                  void updateGlobalLayer(activeLayer.id, {
                    adjustmentConfig: { ...cfg, invert: e.target.checked },
                  });
                }}
              />
              Invert Colors
            </label>
          </div>
        </div>
      )}

      {/* Photoshop-style Bottom Action Bar */}
      <div className={styles.footerBar}>
        <div className={styles.footerGroup}>
          <button
            type="button"
            className={styles.footerBtn}
            disabled={!hasFrames}
            onClick={() => addGlobalLayer('raster')}
            title="New Paint Layer"
          >
            <Plus size={12} /> Layer
          </button>
          <button
            type="button"
            className={styles.footerBtn}
            disabled={!hasFrames}
            onClick={() => addGlobalLayer('fill')}
            title="New Fill Layer"
          >
            <PaintBucket size={12} />
          </button>
          <button
            type="button"
            className={styles.footerBtn}
            disabled={!hasFrames}
            onClick={() => addGlobalLayer('adjustment')}
            title="New Adjustment Layer"
          >
            <Sliders size={12} />
          </button>
          <button
            type="button"
            className={styles.footerBtn}
            disabled={!hasFrames}
            onClick={() => addGlobalLayer('group')}
            title="New Layer Group"
          >
            <FolderIcon size={12} />
          </button>
        </div>

        <div className={styles.footerGroup}>
          <button
            type="button"
            className={styles.footerBtn}
            disabled={!hasFrames || !activeLayer}
            onClick={() => {
              if (!activeLayer) return;
              if (selectionMask?.bounds) void maskFromSelection(activeLayer.id);
              else void addLayerMask(activeLayer.id, 'white');
            }}
            title={selectionMask?.bounds ? 'Add Mask from Selection' : 'Add Layer Mask'}
          >
            <CircleDot size={12} />
          </button>
          <button
            type="button"
            className={styles.footerBtn}
            disabled={!hasFrames || !activeLayer || activeLayer.type === 'group'}
            onClick={() => activeLayer && void duplicateGlobalLayer(activeLayer.id)}
            title="Duplicate Layer"
          >
            <Copy size={12} />
          </button>
          <button
            type="button"
            className={styles.footerBtn}
            disabled={!hasFrames || globalLayers.length < 2}
            onClick={() => void mergeVisibleLayers()}
            title="Merge Visible Layers"
          >
            <Layers size={12} />
          </button>
          <button
            type="button"
            className={`${styles.footerBtn} ${styles.footerDanger}`}
            disabled={!hasFrames || !activeLayer || activeLayer.id === 'layer-base'}
            onClick={() => activeLayer && void deleteGlobalLayer(activeLayer.id)}
            title="Delete Layer"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Layer Context Menu */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{
            left: Math.max(8, Math.min(window.innerWidth - 200, contextMenu.x)),
            top: Math.max(8, Math.min(window.innerHeight - 300, contextMenu.y)),
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.contextItem}
            onClick={() => {
              setContextMenu(null);
              void duplicateGlobalLayer(contextMenu.layer.id);
            }}
          >
            Duplicate Layer
          </button>
          <button
            type="button"
            className={styles.contextItem}
            disabled={contextMenu.layer.id === 'layer-base'}
            onClick={() => {
              setContextMenu(null);
              void updateGlobalLayer(contextMenu.layer.id, { clipped: !contextMenu.layer.clipped });
            }}
          >
            {contextMenu.layer.clipped ? 'Release Clipping Mask' : 'Create Clipping Mask'}
          </button>
          <button
            type="button"
            className={styles.contextItem}
            disabled={contextMenu.layer.id === 'layer-base' || contextMenu.layer.type === 'group'}
            onClick={() => {
              setContextMenu(null);
              void updateGlobalLayer(contextMenu.layer.id, {
                scope: contextMenu.layer.scope === 'shared' ? 'per-frame' : 'shared',
              });
            }}
          >
            {contextMenu.layer.scope === 'shared' ? 'Switch to Per-Frame' : 'Share Across All Frames'}
          </button>
          <div className={styles.contextSep} />
          {!activePixelData?.maskBitmap ? (
            <>
              <button
                type="button"
                className={styles.contextItem}
                onClick={() => {
                  setContextMenu(null);
                  void addLayerMask(contextMenu.layer.id, 'white');
                }}
              >
                Add Mask (Reveal All)
              </button>
              <button
                type="button"
                className={styles.contextItem}
                onClick={() => {
                  setContextMenu(null);
                  void addLayerMask(contextMenu.layer.id, 'black');
                }}
              >
                Add Mask (Hide All)
              </button>
              {selectionMask?.bounds && (
                <button
                  type="button"
                  className={styles.contextItem}
                  onClick={() => {
                    setContextMenu(null);
                    void maskFromSelection(contextMenu.layer.id);
                  }}
                >
                  Mask from Selection
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.contextItem}
                onClick={() => {
                  setContextMenu(null);
                  void invertLayerMask(contextMenu.layer.id);
                }}
              >
                Invert Mask
              </button>
              <button
                type="button"
                className={styles.contextItem}
                disabled={contextMenu.layer.type !== 'raster'}
                onClick={() => {
                  setContextMenu(null);
                  void applyLayerMask(contextMenu.layer.id);
                }}
              >
                Apply Mask to Layer
              </button>
              <button
                type="button"
                className={styles.contextItem}
                onClick={() => {
                  setContextMenu(null);
                  void deleteLayerMask(contextMenu.layer.id);
                }}
              >
                Delete Mask
              </button>
            </>
          )}
          <div className={styles.contextSep} />
          <button
            type="button"
            className={styles.contextItem}
            disabled={globalLayers.findIndex(l => l.id === contextMenu.layer.id) <= 0}
            onClick={() => {
              setContextMenu(null);
              void mergeLayerDown(contextMenu.layer.id);
            }}
          >
            Merge Down
          </button>
          <button
            type="button"
            className={styles.contextItem}
            onClick={() => {
              setContextMenu(null);
              void flattenLayers();
            }}
          >
            Flatten Image
          </button>
          {contextMenu.layer.id !== 'layer-base' && (
            <>
              <div className={styles.contextSep} />
              <button
                type="button"
                className={styles.contextItem}
                style={{ color: 'var(--danger-color)' }}
                onClick={() => {
                  setContextMenu(null);
                  void deleteGlobalLayer(contextMenu.layer.id);
                }}
              >
                Delete Layer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
