'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import { packRects } from '@/lib/atlasPacker';
import { Upload, X, Check, Eye, EyeOff, Sparkles, AlertCircle } from 'lucide-react';
import styles from './MaterialMergerPanel.module.css';

export function MaterialMergerPanel() {
  const {
    isModelLoaded,
    textureSlots,
    setTextureSlots,
    applyTextureAtlas,
  } = useThreePainterContext();

  const [atlasSize, setAtlasSize] = useState<number>(2048);
  const [isPacking, setIsPacking] = useState<boolean>(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // 1. Calculate packing schematic for layout preview (always normalized to 1024x1024 space)
  const activeSlots = useMemo(() => {
    return textureSlots.filter(s => s.included);
  }, [textureSlots]);

  const packingPreviewResult = useMemo(() => {
    const packingItems = activeSlots.map(slot => {
      let width = 512;
      let height = 512;

      // In UDIMs, tiles are typically square, but materials might have irregular ratios
      // We start with a base 512x512 box and scale it by weight
      width = Math.round(width * slot.weight);
      height = Math.round(height * slot.weight);

      return {
        id: slot.id,
        width,
        height
      };
    });

    return packRects(packingItems, 1024);
  }, [activeSlots]);

  // 2. Draw layout preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    // Charcoal viewport background
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, size, size);

    const { packedItems } = packingPreviewResult;

    packedItems.forEach(item => {
      const slot = activeSlots.find(s => s.id === item.id);
      if (!slot) return;

      const x = (item.x / 1024) * size;
      const y = (item.y / 1024) * size;
      const w = (item.width / 1024) * size;
      const h = (item.height / 1024) * size;

      // Filled color region
      ctx.fillStyle = slot.originalColor || '#52525b';
      ctx.fillRect(x, y, w, h);

      // Subtle border
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      // Label Overlay
      if (w > 30 && h > 20) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const name = slot.name.length > 10 ? slot.name.substring(0, 8) + '..' : slot.name;
        ctx.fillText(name, x + w / 2, y + h / 2 - 4);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '8px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${slot.weight.toFixed(1)}x`, x + w / 2, y + h / 2 + 6);
      }
    });

    // Draw grid lines for visual reference
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const offset = (size / 4) * i;
      ctx.beginPath();
      ctx.moveTo(offset, 0); ctx.lineTo(offset, size);
      ctx.moveTo(0, offset); ctx.lineTo(size, offset);
      ctx.stroke();
    }
  }, [packingPreviewResult, activeSlots]);

  // 3. User controls
  const handleToggleInclude = (slotId: string) => {
    setTextureSlots(prev => prev.map(s => s.id === slotId ? { ...s, included: !s.included } : s));
  };

  const handleWeightChange = (slotId: string, val: number) => {
    setTextureSlots(prev => prev.map(s => s.id === slotId ? { ...s, weight: val } : s));
  };

  const handleFileUpload = (slotId: string, file: File | null) => {
    if (!file) {
      setTextureSlots(prev => prev.map(s => {
        if (s.id !== slotId) return s;
        if (s.userTextureUrl) URL.revokeObjectURL(s.userTextureUrl);
        return { ...s, userTextureUrl: null, userTextureFile: null };
      }));
      return;
    }

    const url = URL.createObjectURL(file);
    setTextureSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      if (s.userTextureUrl) URL.revokeObjectURL(s.userTextureUrl);
      return { ...s, userTextureUrl: url, userTextureFile: file };
    }));
  };

  const handleBakeAtlas = async () => {
    if (activeSlots.length === 0) return;
    setIsPacking(true);
    // Give thread time to show loading state
    setTimeout(async () => {
      try {
        await applyTextureAtlas(atlasSize);
      } finally {
        setIsPacking(false);
      }
    }, 50);
  };

  if (!isModelLoaded) {
    return (
      <div className={styles.empty}>
        <Sparkles size={28} className={styles.emptyIcon} />
        <h3>No 3D Model Loaded</h3>
        <p>Import a model to split and repack its materials or UDIMs.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Visual Packing schematic */}
      <div className={styles.schematicSection}>
        <div className={styles.canvasWrapper}>
          <canvas
            ref={previewCanvasRef}
            width={320}
            height={320}
            className={styles.previewCanvas}
          />
          <div className={styles.canvasOverlay}>
            Interactive Atlas Layout Preview
          </div>
        </div>

        <div className={styles.controlsBar}>
          <div className={styles.controlGroup}>
            <label className={styles.label}>ATLAS SIZE</label>
            <select
              className={styles.select}
              value={atlasSize}
              onChange={(e) => setAtlasSize(Number(e.target.value))}
              disabled={isPacking}
            >
              <option value={512}>512 x 512 px</option>
              <option value={1024}>1024 x 1024 px</option>
              <option value={2048}>2048 x 2048 px</option>
              <option value={4096}>4096 x 4096 px</option>
            </select>
          </div>

          <button
            className={styles.bakeBtn}
            onClick={handleBakeAtlas}
            disabled={isPacking || activeSlots.length === 0}
          >
            {isPacking ? (
              <span className={styles.spinner}></span>
            ) : (
              <Sparkles size={13} />
            )}
            <span>{isPacking ? 'Merging...' : 'Merge & Repack UVs'}</span>
          </button>
        </div>
      </div>

      {/* Accordion / list of slots */}
      <div className={styles.slotsHeader}>
        <span>DETECTED SOURCE REGIONS ({textureSlots.length})</span>
        <span className={styles.modeBadge}>
          {textureSlots[0]?.type === 'udim' ? 'UDIM GRID MODE' : 'MULTI-MATERIAL MODE'}
        </span>
      </div>

      <div className={styles.slotsList}>
        {textureSlots.map(slot => {
          const thumbUrl = slot.userTextureUrl || slot.originalTextureUrl;
          const inputId = `file-upload-${slot.id}`;

          return (
            <div
              key={slot.id}
              className={`${styles.slotCard} ${!slot.included ? styles.slotCardExcluded : ''}`}
            >
              {/* Header Info */}
              <div className={styles.slotRow}>
                <button
                  className={styles.includeToggle}
                  onClick={() => handleToggleInclude(slot.id)}
                  title={slot.included ? 'Exclude from Atlas' : 'Include in Atlas'}
                >
                  {slot.included ? (
                    <Eye size={14} className={styles.toggleActive} />
                  ) : (
                    <EyeOff size={14} className={styles.toggleInactive} />
                  )}
                </button>

                <div className={styles.slotDetails}>
                  <div className={styles.nameRow}>
                    <span className={styles.slotName}>{slot.name}</span>
                    <span className={styles.slotType}>
                      {slot.type === 'udim' ? 'UDIM' : 'Material'}
                    </span>
                  </div>
                  <div className={styles.meshCount}>
                    Used by: {slot.meshNames.join(', ')}
                  </div>
                </div>

                {/* Color block / Thumbnail */}
                <div className={styles.thumbnailWrapper}>
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={slot.name} className={styles.thumbnailImg} />
                  ) : (
                    <div
                      className={styles.colorBlock}
                      style={{ backgroundColor: slot.originalColor }}
                    />
                  )}
                </div>
              </div>

              {/* Sliders and Upload if Included */}
              {slot.included && (
                <div className={styles.slotBody}>
                  {/* UV Weight Slider */}
                  <div className={styles.sliderRow}>
                    <div className={styles.sliderHeader}>
                      <span className={styles.bodyLabel}>UV Area Scale</span>
                      <span className={styles.weightVal}>{slot.weight.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={3.0}
                      step={0.1}
                      value={slot.weight}
                      onChange={(e) => handleWeightChange(slot.id, Number(e.target.value))}
                      className={styles.weightSlider}
                    />
                  </div>

                  {/* Custom Texture Upload */}
                  <div className={styles.uploadRow}>
                    <span className={styles.bodyLabel}>Override Texture</span>
                    {slot.userTextureUrl ? (
                      <div className={styles.fileLabel}>
                        <span className={styles.fileName}>
                          {slot.userTextureFile?.name || 'Custom Texture'}
                        </span>
                        <button
                          className={styles.removeFileBtn}
                          onClick={() => handleFileUpload(slot.id, null)}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <label htmlFor={inputId} className={styles.uploadBtn}>
                        <Upload size={10} />
                        <span>Upload PNG/JPG</span>
                        <input
                          id={inputId}
                          type="file"
                          accept="image/*"
                          className={styles.hiddenInput}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(slot.id, file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.infoNotice}>
        <AlertCircle size={12} style={{ flexShrink: 0 }} />
        <span>
          Baking is a destructive operation that merges all separate sub-materials and UDIM coordinates into a standard unified 0-1 UV layout.
        </span>
      </div>
    </div>
  );
}
