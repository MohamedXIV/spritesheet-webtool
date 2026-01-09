'use client';

/**
 * ExportPanel - Spritesheet configuration and export controls with loop mode support
 */

import React, { useState, useMemo } from 'react';
import { FrameData, SpritesheetConfig } from '@/types';
import { packFrames, calculateOptimalColumns } from '@/lib/spritesheetPacker';
import { exportSpritesheetPng, exportMetadataJson, exportAll } from '@/lib/exporter';
import { LoopMode } from './Timeline';
import styles from './ExportPanel.module.css';

interface ExportPanelProps {
  frames: FrameData[];
  fps: number;
  loopMode: LoopMode;
  previewBackgroundColor?: string; // From preview player
}

export function ExportPanel({ frames, fps, loopMode, previewBackgroundColor }: ExportPanelProps) {
  const [columns, setColumns] = useState(0); // 0 = auto
  const [padding, setPadding] = useState(0);
  const [backgroundColor, setBackgroundColor] = useState('transparent');
  const [isExporting, setIsExporting] = useState(false);
  const [applyLoopToExport, setApplyLoopToExport] = useState(false);

  // Apply loop mode to frames for export
  const getExportFrames = (): FrameData[] => {
    if (!applyLoopToExport || loopMode === 'normal') {
      return frames;
    }
    
    if (loopMode === 'reverse') {
      return [...frames].reverse();
    }
    
    if (loopMode === 'pingpong') {
      // Ping-pong: original + reversed (excluding first and last to avoid duplicates)
      const reversed = [...frames].slice(1, -1).reverse();
      return [...frames, ...reversed];
    }
    
    return frames;
  };

  // Calculate preview dimensions
  const dimensions = useMemo(() => {
    const exportFrames = applyLoopToExport ? getExportFrames() : frames;
    if (exportFrames.length === 0) return null;
    
    try {
      const frameWidth = exportFrames[0].bitmap.width;
      const frameHeight = exportFrames[0].bitmap.height;
      if (frameWidth === 0 || frameHeight === 0) return null;
      
      const cols = columns > 0 ? columns : calculateOptimalColumns(exportFrames.length);
      const rows = Math.ceil(exportFrames.length / cols);
      
      return {
        frameWidth,
        frameHeight,
        columns: cols,
        rows,
        totalWidth: cols * frameWidth + (cols + 1) * padding,
        totalHeight: rows * frameHeight + (rows + 1) * padding,
        totalFrames: exportFrames.length,
      };
    } catch {
      return null;
    }
  }, [frames, columns, padding, applyLoopToExport, loopMode]);

  const config: SpritesheetConfig = {
    columns,
    padding,
    backgroundColor,
  };

  const handleExportPng = async () => {
    const exportFrames = getExportFrames();
    if (exportFrames.length === 0) return;
    
    setIsExporting(true);
    try {
      const { canvas } = packFrames(exportFrames, config, fps);
      await exportSpritesheetPng(canvas);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export spritesheet');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJson = () => {
    const exportFrames = getExportFrames();
    if (exportFrames.length === 0) return;
    
    try {
      const { metadata } = packFrames(exportFrames, config, fps);
      exportMetadataJson(metadata);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export metadata');
    }
  };

  const handleExportAll = async () => {
    const exportFrames = getExportFrames();
    if (exportFrames.length === 0) return;
    
    setIsExporting(true);
    try {
      const { canvas, metadata } = packFrames(exportFrames, config, fps);
      await exportAll(canvas, metadata);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export files');
    } finally {
      setIsExporting(false);
    }
  };

  const hasFrames = frames.length > 0;
  const loopModeNames = { normal: 'Normal', pingpong: 'Ping-Pong', reverse: 'Reverse' };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Export Settings</h3>

      <div className={styles.settings}>
        <div className={styles.field}>
          <label htmlFor="columns" className={styles.label}>
            Columns
          </label>
          <input
            id="columns"
            type="number"
            min="0"
            max="100"
            value={columns}
            onChange={(e) => setColumns(Math.max(0, Number(e.target.value)))}
            className={styles.input}
            placeholder="Auto"
          />
          <span className={styles.hint}>0 = auto</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="padding" className={styles.label}>
            Padding (px)
          </label>
          <input
            id="padding"
            type="number"
            min="0"
            max="20"
            value={padding}
            onChange={(e) => setPadding(Math.max(0, Math.min(20, Number(e.target.value))))}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="background" className={styles.label}>
            Background
          </label>
          <select
            id="background"
            value={backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
            className={styles.select}
          >
            <option value="transparent">Transparent</option>
            <option value="#000000">Black</option>
            <option value="#ffffff">White</option>
            <option value="#ff00ff">Magenta (for visibility)</option>
            {previewBackgroundColor && previewBackgroundColor !== 'transparent' && (
              <option value={previewBackgroundColor}>
                Preview Color ({previewBackgroundColor})
              </option>
            )}
          </select>
        </div>

        {loopMode !== 'normal' && (
          <div className={styles.checkboxField}>
            <input
              type="checkbox"
              id="applyLoop"
              checked={applyLoopToExport}
              onChange={(e) => setApplyLoopToExport(e.target.checked)}
              className={styles.checkbox}
            />
            <label htmlFor="applyLoop" className={styles.checkboxLabel}>
              Apply {loopModeNames[loopMode]} to export
            </label>
          </div>
        )}
      </div>

      {dimensions && (
        <div className={styles.preview}>
          <div className={styles.previewTitle}>Output Preview</div>
          <div className={styles.previewStats}>
            <div className={styles.previewStat}>
              <span>Size:</span>
              <strong>{dimensions.totalWidth} × {dimensions.totalHeight}</strong>
            </div>
            <div className={styles.previewStat}>
              <span>Grid:</span>
              <strong>{dimensions.columns} × {dimensions.rows}</strong>
            </div>
            <div className={styles.previewStat}>
              <span>Frames:</span>
              <strong>{dimensions.totalFrames}</strong>
            </div>
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button
          onClick={handleExportPng}
          className={styles.button}
          disabled={!hasFrames || isExporting}
        >
          {isExporting ? 'Exporting...' : 'Download PNG'}
        </button>
        <button
          onClick={handleExportJson}
          className={`${styles.button} ${styles.secondary}`}
          disabled={!hasFrames}
        >
          Download JSON
        </button>
        <button
          onClick={handleExportAll}
          className={`${styles.button} ${styles.primary}`}
          disabled={!hasFrames || isExporting}
        >
          Export Both
        </button>
      </div>
    </div>
  );
}
