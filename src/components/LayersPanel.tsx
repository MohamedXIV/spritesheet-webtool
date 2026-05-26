'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, Plus, Trash2, ChevronUp, ChevronDown, Edit2, Check } from 'lucide-react';
import { useThreePainterContext, PaintingLayer } from '@/contexts/ThreePainterContext';
import styles from './LayersPanel.module.css';

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
  } = useThreePainterContext();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleStartRename = (layer: PaintingLayer) => {
    setEditingId(layer.id);
    setEditingName(layer.name);
  };

  const handleFinishRename = (layerId: string) => {
    if (editingName.trim()) {
      // Modify in-place inside context or state
      const layer = layers.find(l => l.id === layerId);
      if (layer) {
        layer.name = editingName.trim();
      }
    }
    setEditingId(null);
  };

  // Render layer list from top-to-bottom (highest index is drawn last, so sits on top)
  const reversedLayers = [...layers].reverse();

  return (
    <div className={styles.container}>
      {/* Header controls */}
      <div className={styles.header}>
        <span className={styles.layerCount}>{layers.length} / 5 Layers</span>
        <button
          className={styles.addBtn}
          onClick={addLayer}
          disabled={layers.length >= 5}
          title="Add Painting Layer (Max 5)"
        >
          <Plus size={16} />
          Add Layer
        </button>
      </div>

      {/* Layer stack */}
      <div className={styles.layerList}>
        {reversedLayers.map((layer, index) => {
          const originalIndex = layers.length - 1 - index;
          const isActive = layer.id === activeLayerId;
          const isBase = originalIndex === 0;

          return (
            <div
              key={layer.id}
              className={`${styles.layerRow} ${isActive ? styles.activeRow : ''}`}
              onClick={() => setActiveLayerId(layer.id)}
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
                  {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>

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
                  <span
                    className={styles.layerName}
                    onDoubleClick={() => handleStartRename(layer)}
                    title="Double click to rename"
                  >
                    {layer.name} {isBase && <small className={styles.baseTag}>(Base)</small>}
                  </span>
                )}

                {/* Actions group */}
                <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                  {!isBase && (
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleStartRename(layer)}
                      title="Rename Layer"
                    >
                      <Edit2 size={13} />
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
                    <ChevronUp size={14} />
                  </button>
                  <button
                    className={styles.actionBtn}
                    onClick={() => {
                      if (originalIndex > 1) {
                        reorderLayers(originalIndex, originalIndex - 1);
                      }
                    }}
                    disabled={originalIndex <= 1} // Can't move below Base
                    title="Move Layer Down"
                  >
                    <ChevronDown size={14} />
                  </button>

                  {!isBase && (
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => deleteLayer(layer.id)}
                      title="Delete Layer"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Row controls for blending and opacity */}
              <div className={styles.rowControls} onClick={(e) => e.stopPropagation()}>
                {/* Blend Mode selector */}
                <div className={styles.controlGroup}>
                  <label>Blend:</label>
                  <select
                    className={styles.select}
                    value={layer.blendMode}
                    onChange={(e) => setLayerBlendMode(layer.id, e.target.value as any)}
                    disabled={isBase} // Base is always normal
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
                      disabled={isBase} // Base is always 100%
                    />
                    <span className={styles.percentageVal}>
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
