'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Plus, Trash2, ChevronUp, ChevronDown, Edit2, Check, Sliders, Sparkles, Upload, X } from 'lucide-react';
import { useThreePainterContext, PaintingLayer } from '@/contexts/ThreePainterContext';
import styles from './LayersPanel.module.css';

// ─── Thumbnail Preview Component ──────────────────────────────────────────────

interface ThumbnailProps {
  canvasElement: HTMLCanvasElement | null;
  className?: string;
  isMask?: boolean;
}

function LayerThumbnail({ canvasElement, className, isMask = false }: ThumbnailProps) {
  const thumbRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasElement) return;
    const thumb = thumbRef.current;
    const tCtx = thumb?.getContext('2d');
    if (!thumb || !tCtx) return;

    let animId: number;
    const update = () => {
      tCtx.clearRect(0, 0, thumb.width, thumb.height);
      if (isMask) {
        // Draw the grayscale mask checker background
        tCtx.fillStyle = '#1e1e24';
        tCtx.fillRect(0, 0, thumb.width, thumb.height);
      }
      tCtx.drawImage(canvasElement, 0, 0, thumb.width, thumb.height);
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);

    return () => cancelAnimationFrame(animId);
  }, [canvasElement, isMask]);

  return <canvas ref={thumbRef} width={36} height={36} className={`${styles.thumbCanvas} ${className || ''}`} />;
}

// ─── Curves Editor Component ──────────────────────────────────────────────────

interface CurvesEditorProps {
  curvesPoints: [number, number, number, number];
  onChange: (points: [number, number, number, number]) => void;
}

const getCanvasCoords = (xVal: number, yVal: number, size: number) => {
  return {
    x: (xVal / 255) * size,
    y: size - (yVal / 255) * size
  };
};

const getValueCoords = (cx: number, cy: number, size: number) => {
  return {
    x: Math.max(0, Math.min(255, Math.round((cx / size) * 255))),
    y: Math.max(0, Math.min(255, Math.round((1 - cy / size) * 255)))
  };
};

function CurvesEditor({ curvesPoints, onChange }: CurvesEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragPointRef = useRef<number | null>(null);

  const [y0, x1, y1, y2] = curvesPoints;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const S = canvas.width;
    ctx.clearRect(0, 0, S, S);

    // Background grid
    ctx.fillStyle = '#111115';
    ctx.fillRect(0, 0, S, S);

    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    for (const p of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(p * S, 0); ctx.lineTo(p * S, S);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p * S); ctx.lineTo(S, p * S);
      ctx.stroke();
    }

    // Identity line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, S);
    ctx.lineTo(S, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Curve
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const c = y0;
    const W = 255;
    const denom = W * W - W * x1;
    const lut = new Uint8Array(256);
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
    } else {
      const a = ((y2 - y0) - (y1 - y0) * (W / x1)) / (W * W - W * x1);
      const b = ((y1 - y0) - a * x1 * x1) / x1;
      for (let x = 0; x <= 255; x++) {
        const val = a * x * x + b * x + c;
        lut[x] = Math.max(0, Math.min(255, Math.round(val)));
      }
    }

    for (let x = 0; x <= 255; x++) {
      const coords = getCanvasCoords(x, lut[x], S);
      if (x === 0) ctx.moveTo(coords.x, coords.y);
      else ctx.lineTo(coords.x, coords.y);
    }
    ctx.stroke();

    // Handles
    const points = [
      { id: 0, ...getCanvasCoords(0, y0, S), color: '#a855f7' },
      { id: 1, ...getCanvasCoords(x1, y1, S), color: '#3b82f6' },
      { id: 2, ...getCanvasCoords(255, y2, S), color: '#10b981' }
    ];

    points.forEach(pt => {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
  }, [curvesPoints, y0, x1, y1, y2]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const S = canvas.width;

    const points = [
      { id: 0, ...getCanvasCoords(0, y0, S) },
      { id: 1, ...getCanvasCoords(x1, y1, S) },
      { id: 2, ...getCanvasCoords(255, y2, S) }
    ];

    let closestId = null;
    let minDist = 15;
    points.forEach(pt => {
      const dist = Math.hypot(cx - pt.x, cy - pt.y);
      if (dist < minDist) {
        minDist = dist;
        closestId = pt.id;
      }
    });

    if (closestId !== null) {
      dragPointRef.current = closestId;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragPointRef.current === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const S = canvas.width;

    const val = getValueCoords(cx, cy, S);
    const nextPoints: [number, number, number, number] = [...curvesPoints];
    if (dragPointRef.current === 0) {
      nextPoints[0] = val.y;
    } else if (dragPointRef.current === 1) {
      nextPoints[1] = Math.max(10, Math.min(245, val.x));
      nextPoints[2] = val.y;
    } else if (dragPointRef.current === 2) {
      nextPoints[3] = val.y;
    }
    onChange(nextPoints);
  };

  const handleMouseUpOrLeave = () => {
    dragPointRef.current = null;
  };

  return (
    <div className={styles.curvesWrapper}>
      <canvas
        ref={canvasRef}
        width={130}
        height={130}
        className={styles.curvesCanvas}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
      />
      <div className={styles.curvesActions}>
        <span className={styles.curvesResetLink} onClick={() => onChange([0, 128, 128, 255])}>
          Reset Curve
        </span>
      </div>
    </div>
  );
}

// ─── Main Layers Panel Component ──────────────────────────────────────────────

export function LayersPanel() {
  const {
    layers,
    activeLayerId,
    setActiveLayerId,
    addLayer,
    deleteLayer,
    toggleLayerVisibility,
    setLayerOpacity,
    setLayerBlendMode,
    reorderLayers,
    toggleMask,
    setMaskVisible,
    setMaskActive,
    updateLayerFillSettings,
    updateLayerFilters,
  } = useThreePainterContext();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [expandedFilterId, setExpandedFilterId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileTargetLayerId, setFileTargetLayerId] = useState<string | null>(null);

  const handleStartRename = (layer: PaintingLayer) => {
    setEditingId(layer.id);
    setEditingName(layer.name);
  };

  const handleFinishRename = (layerId: string) => {
    if (editingName.trim()) {
      const layer = layers.find(l => l.id === layerId);
      if (layer) {
        layer.name = editingName.trim();
      }
    }
    setEditingId(null);
  };

  const handleTextureUploadClick = (layerId: string) => {
    setFileTargetLayerId(layerId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && fileTargetLayerId) {
      // Check if it is a Fill Layer and has an existing texture to show warning
      const layer = layers.find(l => l.id === fileTargetLayerId);
      if (layer && layer.fillTextureName) {
        const proceed = confirm(`Are you sure you want to replace the existing texture map "${layer.fillTextureName}" on this Fill Layer?`);
        if (!proceed) return;
      }

      const url = URL.createObjectURL(file);
      updateLayerFillSettings(fileTargetLayerId, {
        fillTextureName: file.name,
        fillTextureUrl: url
      });
    }
    e.target.value = '';
    setFileTargetLayerId(null);
  };

  const handleRemoveTexture = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.fillTextureUrl) {
      URL.revokeObjectURL(layer.fillTextureUrl);
    }
    updateLayerFillSettings(layerId, {
      fillTextureName: null,
      fillTextureUrl: null
    });
  };

  const reversedLayers = [...layers].reverse();

  return (
    <div className={styles.container}>
      {/* Hidden file input for texture imports */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {/* Header controls */}
      <div className={styles.header}>
        <span className={styles.layerCount}>{layers.length} / 5 Layers</span>
        <div className={styles.addBtnGroup}>
          <button
            className={styles.addBtn}
            onClick={() => addLayer('paint')}
            disabled={layers.length >= 5}
            title="Add Paint Layer (Max 5)"
          >
            <Plus size={12} />
            Paint
          </button>
          <button
            className={`${styles.addBtn} ${styles.addFillBtn}`}
            onClick={() => addLayer('fill')}
            disabled={layers.length >= 5}
            title="Add Fill Layer (Max 5)"
          >
            <Plus size={12} />
            Fill
          </button>
        </div>
      </div>

      {/* Layer stack */}
      <div className={styles.layerList}>
        {reversedLayers.map((layer, index) => {
          const originalIndex = layers.length - 1 - index;
          const isActive = layer.id === activeLayerId;
          const isBase = originalIndex === 0;

          const defaultFilters = { hue: 0, saturation: 1, brightness: 1, contrast: 1, curvesPoints: [0, 128, 128, 255] as [number, number, number, number] };
          const filters = layer.filters || defaultFilters;

          const isPaintingLayer = isActive && !layer.maskActive;
          const isPaintingMask = isActive && layer.maskActive;

          return (
            <div
              key={layer.id}
              className={`${styles.layerRow} ${isActive ? styles.activeRow : ''}`}
              onClick={() => {
                setActiveLayerId(layer.id);
                // Default to painting on layer if selected, unless they explicitly click mask
                if (!isActive) setMaskActive(layer.id, false);
              }}
            >
              {/* Row primary controls */}
              <div className={styles.rowMain}>
                <button
                  className={`${styles.visibilityBtn} ${layer.visible ? styles.visibleColor : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLayerVisibility(layer.id);
                  }}
                  title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                >
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                {/* Layer Thumbnail & Mask Preview */}
                <div className={styles.previewContainer} onClick={(e) => e.stopPropagation()}>
                  {/* Main Texture Thumbnail */}
                  <div
                    className={`${styles.thumbWrapper} ${isPaintingLayer ? styles.targetActive : ''}`}
                    onClick={() => {
                      setActiveLayerId(layer.id);
                      setMaskActive(layer.id, false);
                    }}
                    title="Edit Layer Texture"
                  >
                    <LayerThumbnail canvasElement={layer.canvas} />
                    <span className={styles.thumbBadge}>{layer.type === 'fill' ? 'F' : 'P'}</span>
                  </div>

                  {/* Mask Thumbnail if exists */}
                  {layer.maskCanvas ? (
                    <div
                      className={`${styles.thumbWrapper} ${styles.maskThumbWrapper} ${isPaintingMask ? styles.targetActive : ''}`}
                      onClick={() => {
                        setActiveLayerId(layer.id);
                        setMaskActive(layer.id, true);
                      }}
                      title="Edit Layer Mask"
                    >
                      <LayerThumbnail canvasElement={layer.maskCanvas} isMask={true} />
                      <button
                        className={styles.maskVisibilityBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMaskVisible(layer.id, !layer.maskVisible);
                        }}
                        title={layer.maskVisible ? 'Disable Mask' : 'Enable Mask'}
                      >
                        {layer.maskVisible ? <Eye size={9} /> : <EyeOff size={9} />}
                      </button>
                    </div>
                  ) : null}
                </div>

                {editingId === layer.id ? (
                  <div className={styles.renameWrapper} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      className={styles.renameInput}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleFinishRename(layer.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button
                      className={styles.saveRenameBtn}
                      onClick={() => handleFinishRename(layer.id)}
                    >
                      <Check size={12} />
                    </button>
                  </div>
                ) : (
                  <div className={styles.nameAndType}>
                    <span
                      className={styles.layerName}
                      onDoubleClick={() => handleStartRename(layer)}
                      title="Double click to rename"
                    >
                      {layer.name} {isBase && <small className={styles.baseTag}>(Base)</small>}
                    </span>
                    <span className={styles.layerTypeLabel}>
                      {layer.type === 'fill' ? 'fill layer' : 'paint layer'}
                    </span>
                  </div>
                )}

                {/* Actions group */}
                <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                  {/* Mask Toggle Button */}
                  <button
                    className={`${styles.actionBtn} ${layer.maskCanvas ? styles.actionActive : ''}`}
                    onClick={() => toggleMask(layer.id)}
                    title={layer.maskCanvas ? 'Remove Mask' : 'Add Mask'}
                  >
                    <Sparkles size={12} />
                  </button>

                  {/* Filters Toggle Button */}
                  <button
                    className={`${styles.actionBtn} ${expandedFilterId === layer.id ? styles.actionActive : ''}`}
                    onClick={() => setExpandedFilterId(expandedFilterId === layer.id ? null : layer.id)}
                    title="Filters & Adjustments"
                  >
                    <Sliders size={12} />
                  </button>

                  {!isBase && (
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleStartRename(layer)}
                      title="Rename Layer"
                    >
                      <Edit2 size={12} />
                    </button>
                  )}

                  {/* Ordering arrows */}
                  <button
                    className={styles.actionBtn}
                    onClick={() => {
                      if (originalIndex < layers.length - 1) {
                        reorderLayers(originalIndex, originalIndex + 1);
                      }
                    }}
                    disabled={originalIndex === layers.length - 1}
                    title="Move Layer Up"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    className={styles.actionBtn}
                    onClick={() => {
                      if (originalIndex > 1) {
                        reorderLayers(originalIndex, originalIndex - 1);
                      }
                    }}
                    disabled={originalIndex <= 1}
                    title="Move Layer Down"
                  >
                    <ChevronDown size={12} />
                  </button>

                  {!isBase && (
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => deleteLayer(layer.id)}
                      title="Delete Layer"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Controls for Fill Settings */}
              {layer.type === 'fill' && (
                <div className={styles.fillConfigRow} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.fillSetting}>
                    <span className={styles.subLabel}>Color</span>
                    <input
                      type="color"
                      className={styles.fillColorSwatch}
                      value={layer.fillColor || '#ffffff'}
                      onChange={(e) => updateLayerFillSettings(layer.id, { fillColor: e.target.value })}
                    />
                  </div>
                  <div className={styles.fillTextureGroup}>
                    {layer.fillTextureName ? (
                      <div className={styles.textureMeta}>
                        <span className={styles.textureName} title={layer.fillTextureName}>
                          🖼️ {layer.fillTextureName}
                        </span>
                        <button
                          className={styles.clearTextureBtn}
                          onClick={() => handleRemoveTexture(layer.id)}
                          title="Remove texture"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className={styles.uploadTextureBtn}
                        onClick={() => handleTextureUploadClick(layer.id)}
                      >
                        <Upload size={10} /> Load Texture
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Row controls for blending and opacity */}
              <div className={styles.rowControls} onClick={(e) => e.stopPropagation()}>
                {/* Blend Mode selector */}
                <div className={styles.controlGroup}>
                  <label>Blend:</label>
                  <select
                    className={styles.select}
                    value={layer.blendMode}
                    onChange={(e) => setLayerBlendMode(layer.id, e.target.value as PaintingLayer['blendMode'])}
                    disabled={isBase}
                  >
                    <option value="normal">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                  </select>
                </div>

                {/* Opacity slider */}
                <div className={styles.controlGroup} style={{ flex: 1 }}>
                  <label>Opacity:</label>
                  <div className={styles.sliderContainer}>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(layer.opacity * 100)}
                      onChange={(e) => setLayerOpacity(layer.id, parseInt(e.target.value) / 100)}
                      className={styles.slider}
                      disabled={isBase}
                    />
                    <span className={styles.percentageVal}>
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Filters and Curves Controls */}
              {expandedFilterId === layer.id && (
                <div className={styles.filtersPanel} onClick={(e) => e.stopPropagation()}>
                  <h4 className={styles.filterTitle}>Layer Adjustments</h4>
                  
                  {/* Sliders */}
                  <div className={styles.filterSliderRow}>
                    <span>Hue</span>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={filters.hue}
                      onChange={(e) => updateLayerFilters(layer.id, { hue: parseInt(e.target.value) })}
                    />
                    <span className={styles.filterVal}>{filters.hue}°</span>
                  </div>

                  <div className={styles.filterSliderRow}>
                    <span>Saturation</span>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={Math.round(filters.saturation * 100)}
                      onChange={(e) => updateLayerFilters(layer.id, { saturation: parseInt(e.target.value) / 100 })}
                    />
                    <span className={styles.filterVal}>{Math.round(filters.saturation * 100)}%</span>
                  </div>

                  <div className={styles.filterSliderRow}>
                    <span>Brightness</span>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={Math.round(filters.brightness * 100)}
                      onChange={(e) => updateLayerFilters(layer.id, { brightness: parseInt(e.target.value) / 100 })}
                    />
                    <span className={styles.filterVal}>{Math.round(filters.brightness * 100)}%</span>
                  </div>

                  <div className={styles.filterSliderRow}>
                    <span>Contrast</span>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={Math.round(filters.contrast * 100)}
                      onChange={(e) => updateLayerFilters(layer.id, { contrast: parseInt(e.target.value) / 100 })}
                    />
                    <span className={styles.filterVal}>{Math.round(filters.contrast * 100)}%</span>
                  </div>

                  {/* Draggable Curves Editor */}
                  <div className={styles.curvesSection}>
                    <span className={styles.curvesLabel}>Curves (RGB)</span>
                    <CurvesEditor
                      curvesPoints={filters.curvesPoints}
                      onChange={(pts) => updateLayerFilters(layer.id, { curvesPoints: pts })}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
