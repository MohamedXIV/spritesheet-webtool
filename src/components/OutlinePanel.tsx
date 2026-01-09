'use client';

/**
 * OutlinePanel - Real-time outline/stroke effect with live preview
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FrameData } from '@/types';
import { addOutline, OutlineOptions, DEFAULT_OUTLINE_OPTIONS } from '@/lib/outlineGenerator';
import styles from './OutlinePanel.module.css';

interface OutlinePanelProps {
  frames: FrameData[];
  selectedIds: Set<string>;
  currentPreviewFrame: FrameData | null;
  onFramesProcessed: (processedFrames: Map<string, ImageBitmap>) => void;
  onSettingsChange?: (settings: Partial<OutlineOptions>) => void;
}

export function OutlinePanel({
  frames,
  selectedIds,
  currentPreviewFrame,
  onFramesProcessed,
  onSettingsChange,
}: OutlinePanelProps) {
  const [isApplying, setIsApplying] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Outline settings
  const [enabled, setEnabled] = useState(true);
  const [thickness, setThickness] = useState(2);
  const [color, setColor] = useState('#000000');
  const [position, setPosition] = useState<'outside' | 'inside' | 'both'>('outside');
  const [softness, setSoftness] = useState(0);
  
  // Update preview in real-time
  useEffect(() => {
    const updatePreview = async () => {
      const canvas = previewCanvasRef.current;
      if (!canvas || !currentPreviewFrame?.bitmap) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      try {
        // Check bitmap validity
        if (currentPreviewFrame.bitmap.width === 0) return;
        
        let displayBitmap = currentPreviewFrame.bitmap;
        
        // Apply outline if enabled
        if (enabled) {
          displayBitmap = await addOutline(currentPreviewFrame.bitmap, {
            enabled: true,
            thickness,
            color,
            position,
            softness,
          });
        }
        
        // Calculate canvas size maintaining aspect ratio
        const maxSize = 200;
        const scale = Math.min(maxSize / displayBitmap.width, maxSize / displayBitmap.height);
        canvas.width = displayBitmap.width * scale;
        canvas.height = displayBitmap.height * scale;
        
        // Draw checkerboard background for transparency
        const tileSize = 10;
        for (let y = 0; y < canvas.height; y += tileSize) {
          for (let x = 0; x < canvas.width; x += tileSize) {
            ctx.fillStyle = ((x / tileSize + y / tileSize) % 2) ? '#e0e0e0' : '#ffffff';
            ctx.fillRect(x, y, tileSize, tileSize);
          }
        }
        
        // Draw the frame
        ctx.drawImage(displayBitmap, 0, 0, canvas.width, canvas.height);
        
        // Close the processed bitmap if it's different from original
        if (displayBitmap !== currentPreviewFrame.bitmap) {
          displayBitmap.close();
        }
      } catch (error) {
        // Bitmap may be closed
      }
    };
    
    updatePreview();
  }, [currentPreviewFrame, enabled, thickness, color, position, softness]);

  // Notify parent of settings changes for live main preview
  useEffect(() => {
    onSettingsChange?.({
      enabled,
      thickness,
      color,
      position,
      softness,
    });
  }, [enabled, thickness, color, position, softness, onSettingsChange]);

  const framesToProcess = frames.filter(f => 
    selectedIds.size === 0 || selectedIds.has(f.id)
  );

  const handleApply = useCallback(async () => {
    if (framesToProcess.length === 0 || !enabled) return;
    
    setIsApplying(true);
    const processedFrames = new Map<string, ImageBitmap>();
    
    const outlineOpts: Partial<OutlineOptions> = {
      enabled: true,
      thickness,
      color,
      position,
      softness,
    };
    
    try {
      for (const frame of framesToProcess) {
        const processed = await addOutline(frame.bitmap, outlineOpts);
        processedFrames.set(frame.id, processed);
      }
      
      onFramesProcessed(processedFrames);
    } catch (error) {
      console.error('Outline application failed:', error);
      alert('Failed to apply outline');
    } finally {
      setIsApplying(false);
    }
  }, [framesToProcess, enabled, thickness, color, position, softness, onFramesProcessed]);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Sprite Outline</h3>
      
      {/* Real-time Preview */}
      <div className={styles.previewSection}>
        <canvas ref={previewCanvasRef} className={styles.previewCanvas} />
        {!currentPreviewFrame && (
          <div className={styles.noPreview}>Select a frame to preview</div>
        )}
      </div>

      <div className={styles.settings}>
        <div className={styles.checkboxRow}>
          <input
            type="checkbox"
            id="outline-enable"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={isApplying}
          />
          <label htmlFor="outline-enable">Enable outline</label>
        </div>

        {enabled && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Thickness: {thickness}px</label>
              <input
                type="range"
                min="1"
                max="8"
                value={thickness}
                onChange={(e) => setThickness(Number(e.target.value))}
                className={styles.slider}
                disabled={isApplying}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className={styles.colorPicker}
                disabled={isApplying}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Position</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as 'outside' | 'inside' | 'both')}
                className={styles.select}
                disabled={isApplying}
              >
                <option value="outside">Outside</option>
                <option value="inside">Inside</option>
                <option value="both">Both</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Softness: {softness}px</label>
              <input
                type="range"
                min="0"
                max="5"
                value={softness}
                onChange={(e) => setSoftness(Number(e.target.value))}
                className={styles.slider}
                disabled={isApplying}
              />
            </div>
          </>
        )}
      </div>

      <button
        onClick={handleApply}
        className={styles.applyButton}
        disabled={isApplying || framesToProcess.length === 0 || !enabled}
      >
        {isApplying 
          ? 'Applying...'
          : `Apply to ${selectedIds.size > 0 ? selectedIds.size : 'All'} Frames`
        }
      </button>

      <div className={styles.hint}>
        {selectedIds.size > 0 
          ? `${selectedIds.size} frames selected`
          : 'All frames will be processed'
        }
      </div>
    </div>
  );
}
