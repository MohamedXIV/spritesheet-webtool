'use client';

import React from 'react';
import { Paintbrush, Eraser, Pipette, PaintBucket } from 'lucide-react';
import { useThreePainterContext, BrushTool } from '@/contexts/ThreePainterContext';
import styles from './BrushPanel.module.css';

const BRUSH_PRESETS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ffffff', // White
  '#9ca3af', // Gray
  '#4b5563', // Dark Gray
  '#000000', // Black
];

export function BrushPanel() {
  const {
    activeTool,
    setActiveTool,
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    brushOpacity,
    setBrushOpacity,
    brushHardness,
    setBrushHardness,
    isPaintMode,
    setIsPaintMode,
  } = useThreePainterContext();

  const handleToolClick = (tool: BrushTool) => {
    setActiveTool(tool);
    if (!isPaintMode) {
      setIsPaintMode(true); // Automatically ensure we are in Paint Mode
    }
  };

  return (
    <div className={styles.container}>
      {/* View/Paint toggle */}
      <div className={styles.modeToggleGroup}>
        <button
          className={`${styles.modeButton} ${!isPaintMode ? styles.activeMode : ''}`}
          onClick={() => setIsPaintMode(false)}
        >
          View Mode
        </button>
        <button
          className={`${styles.modeButton} ${isPaintMode ? styles.activeMode : ''}`}
          onClick={() => setIsPaintMode(true)}
        >
          Paint Mode
        </button>
      </div>

      {isPaintMode && (
        <>
          {/* Tool Selector Grid */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Drawing Tools</h4>
            <div className={styles.toolGrid}>
              <button
                className={`${styles.toolButton} ${activeTool === 'brush' ? styles.activeTool : ''}`}
                onClick={() => handleToolClick('brush')}
                title="Paintbrush (LMB)"
              >
                <Paintbrush size={18} />
                <span>Brush</span>
              </button>
              <button
                className={`${styles.toolButton} ${activeTool === 'eraser' ? styles.activeTool : ''}`}
                onClick={() => handleToolClick('eraser')}
                title="Eraser (LMB)"
              >
                <Eraser size={18} />
                <span>Eraser</span>
              </button>
              <button
                className={`${styles.toolButton} ${activeTool === 'eyedropper' ? styles.activeTool : ''}`}
                onClick={() => handleToolClick('eyedropper')}
                title="Eyedropper (LMB or Shift+LMB)"
              >
                <Pipette size={18} />
                <span>Pick Color</span>
              </button>
              <button
                className={`${styles.toolButton} ${activeTool === 'bucket' ? styles.activeTool : ''}`}
                onClick={() => handleToolClick('bucket')}
                title="Bucket Fill (LMB)"
              >
                <PaintBucket size={18} />
                <span>Flood Fill</span>
              </button>
            </div>
          </div>

          {/* Color Selection */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Color Palette</h4>
            <div className={styles.colorPickerContainer}>
              <input
                type="color"
                className={styles.colorInput}
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
              />
              <input
                type="text"
                className={styles.colorHex}
                value={brushColor.toUpperCase()}
                onChange={(e) => {
                  let hex = e.target.value;
                  if (!hex.startsWith('#')) hex = '#' + hex;
                  if (/^#[0-9A-F]{6}$/i.test(hex)) {
                    setBrushColor(hex);
                  }
                }}
              />
            </div>
            <div className={styles.presetGrid}>
              {BRUSH_PRESETS.map((color) => (
                <button
                  key={color}
                  className={`${styles.presetBtn} ${brushColor.toLowerCase() === color.toLowerCase() ? styles.activePreset : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setBrushColor(color)}
                  title={color}
                />
              ))}
            </div>
          </div>

          {/* Sliders for Brush configuration */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Brush Properties</h4>

            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabelRow}>
                <span>Size</span>
                <strong>{brushSize}px</strong>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className={styles.slider}
              />
            </div>

            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabelRow}>
                <span>Opacity</span>
                <strong>{Math.round(brushOpacity * 100)}%</strong>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={Math.round(brushOpacity * 100)}
                onChange={(e) => setBrushOpacity(parseInt(e.target.value) / 100)}
                className={styles.slider}
              />
            </div>

            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabelRow}>
                <span>Hardness</span>
                <strong>{Math.round(brushHardness * 100)}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(brushHardness * 100)}
                onChange={(e) => setBrushHardness(parseInt(e.target.value) / 100)}
                className={styles.slider}
              />
            </div>
          </div>
        </>
      )}

      {!isPaintMode && (
        <div className={styles.viewModeNotice}>
          <div className={styles.noticeIcon}>🌐</div>
          <p><strong>Camera Orbit Mode</strong> is Active.</p>
          <ul className={styles.instructions}>
            <li>✦ <strong>Right-click & drag</strong> to rotate camera</li>
            <li>✦ <strong>Middle-click & drag</strong> to pan camera</li>
            <li>✦ <strong>Scroll wheel</strong> to zoom camera</li>
          </ul>
          <button 
            className={styles.activatePaintBtn}
            onClick={() => setIsPaintMode(true)}
          >
            Activate Painter (LMB)
          </button>
        </div>
      )}
    </div>
  );
}
