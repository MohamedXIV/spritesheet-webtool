'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, Plus, Trash2, ChevronUp, ChevronDown, Edit2, Check } from 'lucide-react';
import { useEditorContext } from '@/contexts/EditorContext';
import { ProjectLayer } from '@/types';
import styles from './FrameLayersPanel.module.css';

export function FrameLayersPanel() {
  const {
    globalLayers = [],
    activeLayerId = '',
    setActiveLayerId = () => {},
    addGlobalLayer = () => {},
    deleteGlobalLayer = () => {},
    reorderGlobalLayers = () => {},
    updateGlobalLayer = () => {},
    orderedFrames = []
  } = useEditorContext();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const handleStartRename = (layer: ProjectLayer) => {
    setEditingId(layer.id);
    setEditingName(layer.name);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      updateGlobalLayer(id, { name: editingName.trim() });
    }
    setEditingId(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Layers</span>
        <button
          className={styles.addButton}
          onClick={() => addGlobalLayer()}
          title="Add New Paint Layer"
          disabled={orderedFrames.length === 0}
        >
          <Plus size={14} />
          <span>Add Layer</span>
        </button>
      </div>

      <div className={styles.layersList}>
        {orderedFrames.length === 0 ? (
          <div className={styles.emptyState}>Load media to start using layers.</div>
        ) : (
          globalLayers.map((layer, index) => {
            const isActive = layer.id === activeLayerId;
            const isBaseLayer = layer.id === 'layer-base';

            return (
              <div
                key={layer.id}
                className={`${styles.layerRow} ${isActive ? styles.activeRow : ''}`}
                onClick={() => setActiveLayerId(layer.id)}
              >
                {/* Visibility Toggle */}
                <button
                  className={`${styles.iconButton} ${layer.visible ? styles.visibleIcon : styles.hiddenIcon}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateGlobalLayer(layer.id, { visible: !layer.visible });
                  }}
                  title={layer.visible ? "Hide Layer" : "Show Layer"}
                >
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                {/* Layer Name / Edit */}
                <div className={styles.nameContainer} onClick={(e) => e.stopPropagation()}>
                  {editingId === layer.id ? (
                    <div className={styles.renameInputRow}>
                      <input
                        type="text"
                        className={styles.renameInput}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(layer.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                      />
                      <button
                        className={styles.saveRenameButton}
                        onClick={() => handleSaveRename(layer.id)}
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className={styles.nameTextRow}>
                      <span
                        className={styles.layerName}
                        onDoubleClick={() => handleStartRename(layer)}
                      >
                        {layer.name}
                      </span>
                      <button
                        className={styles.renameButton}
                        onClick={() => handleStartRename(layer)}
                        title="Rename Layer"
                      >
                        <Edit2 size={10} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Blend Mode & Opacity Controls (Only show details when active for clean UI) */}
                <div className={styles.controlsCell} onClick={(e) => e.stopPropagation()}>
                  <select
                    className={styles.blendSelect}
                    value={layer.blendMode}
                    onChange={(e) => {
                      updateGlobalLayer(layer.id, { blendMode: e.target.value as any });
                    }}
                  >
                    <option value="normal">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                  </select>

                  <div className={styles.opacityContainer}>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(layer.opacity * 100)}
                      onChange={(e) => {
                        updateGlobalLayer(layer.id, { opacity: Number(e.target.value) / 100 });
                      }}
                      className={styles.opacitySlider}
                      title={`Opacity: ${Math.round(layer.opacity * 100)}%`}
                    />
                    <span className={styles.opacityLabel}>
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </div>
                </div>

                {/* Reordering & Deletion */}
                <div className={styles.actionCell} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.reorderButtons}>
                    <button
                      className={styles.reorderButton}
                      disabled={index === 0}
                      onClick={() => reorderGlobalLayers(index, index - 1)}
                      title="Move Layer Up"
                    >
                      <ChevronUp size={11} />
                    </button>
                    <button
                      className={styles.reorderButton}
                      disabled={index === globalLayers.length - 1}
                      onClick={() => reorderGlobalLayers(index, index + 1)}
                      title="Move Layer Down"
                    >
                      <ChevronDown size={11} />
                    </button>
                  </div>

                  {!isBaseLayer && (
                    <button
                      className={styles.deleteButton}
                      onClick={() => deleteGlobalLayer(layer.id)}
                      title="Delete Paint Layer"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
