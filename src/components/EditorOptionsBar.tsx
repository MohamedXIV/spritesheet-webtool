'use client';

import React, { useState } from 'react';
import { Grid3x3, Layers, Eye, Sparkles, Check, X } from 'lucide-react';
import type { ProjectLayer } from '@/types';
import type { GradientKind, SelectionMask, ShapeKind, ToolSettings } from '@/lib/canvasTools';
import styles from './EditorOptionsBar.module.css';

interface EditorOptionsBarProps {
  settings: ToolSettings;
  onChange: (updater: (prev: ToolSettings) => ToolSettings) => void;
  activeLayer: ProjectLayer | undefined;
  editTarget: 'layer' | 'mask';
  selectionMask: SelectionMask | null;
  onDeselect: () => void;
  onInvertSelection: () => void;
  onMaskFromSelection: () => void;
  showPixelGrid: boolean;
  onTogglePixelGrid: () => void;
  maskSoloActive: boolean;
  onToggleMaskSolo: () => void;
  hasMaskOnActive: boolean;
  onionSkinEnabled: boolean;
  onToggleOnionSkin: (v: boolean) => void;
  onionPrev: number;
  onOnionPrevChange: (v: number) => void;
  onionNext: number;
  onOnionNextChange: (v: number) => void;
  onionOpacity: number;
  onOnionOpacityChange: (v: number) => void;
  hasActiveTransform: boolean;
  onCommitTransform: () => void;
  onCancelTransform: () => void;
  cloneSourceSet: boolean;
}

export function EditorOptionsBar({
  settings,
  onChange,
  activeLayer,
  editTarget,
  selectionMask,
  onDeselect,
  onInvertSelection,
  onMaskFromSelection,
  showPixelGrid,
  onTogglePixelGrid,
  maskSoloActive,
  onToggleMaskSolo,
  hasMaskOnActive,
  onionSkinEnabled,
  onToggleOnionSkin,
  onionPrev,
  onOnionPrevChange,
  onionNext,
  onOnionNextChange,
  onionOpacity,
  onOnionOpacityChange,
  hasActiveTransform,
  onCommitTransform,
  onCancelTransform,
  cloneSourceSet,
}: EditorOptionsBarProps) {
  const [showOnionPopover, setShowOnionPopover] = useState(false);

  const isLocked = Boolean(activeLayer?.locked);
  const nonPaintable =
    activeLayer &&
    editTarget === 'layer' &&
    activeLayer.type !== 'raster' &&
    settings.tool !== 'move' &&
    settings.tool !== 'marquee' &&
    settings.tool !== 'lasso' &&
    settings.tool !== 'wand' &&
    settings.tool !== 'eyedropper' &&
    settings.tool !== 'hand' &&
    settings.tool !== 'zoom';

  return (
    <div className={styles.bar}>
      <span
        className={`${styles.targetBadge} ${
          isLocked || nonPaintable
            ? styles.targetWarn
            : editTarget === 'mask'
              ? styles.targetMask
              : ''
        }`}
        title="Current paint/edit target"
      >
        {activeLayer ? activeLayer.name : 'No Layer'} •{' '}
        {isLocked ? 'LOCKED' : nonPaintable ? activeLayer?.type.toUpperCase() : editTarget === 'mask' ? 'MASK' : 'RGB'}
      </span>

      <div className={styles.divider} />

      {/* Brush / Eraser / Clone options */}
      {(settings.tool === 'brush' || settings.tool === 'eraser' || settings.tool === 'clone') && (
        <div className={styles.group}>
          <span className={styles.label}>Size</span>
          <input
            type="range"
            min={1}
            max={64}
            value={settings.brushSize}
            onChange={e => onChange(p => ({ ...p, brushSize: Number(e.target.value) }))}
            className={styles.slider}
          />
          <span className={styles.val}>{settings.brushSize}px</span>

          <span className={styles.label}>Opacity</span>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(settings.brushOpacity * 100)}
            onChange={e => onChange(p => ({ ...p, brushOpacity: Number(e.target.value) / 100 }))}
            className={styles.slider}
          />
          <span className={styles.val}>{Math.round(settings.brushOpacity * 100)}%</span>

          {settings.tool !== 'clone' && (
            <>
              <button
                type="button"
                className={`${styles.toggleBtn} ${settings.pixelPerfect ? styles.toggleBtnActive : ''}`}
                onClick={() => onChange(p => ({ ...p, pixelPerfect: !p.pixelPerfect }))}
                title="Crisp 1px Pixel-Perfect mode (no anti-aliasing)"
              >
                Pixel Crisp
              </button>
              {!settings.pixelPerfect && (
                <>
                  <span className={styles.label}>Hard</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(settings.brushHardness * 100)}
                    onChange={e => onChange(p => ({ ...p, brushHardness: Number(e.target.value) / 100 }))}
                    className={styles.slider}
                  />
                </>
              )}
            </>
          )}

          {settings.tool === 'clone' && (
            <span className={styles.label}>
              {cloneSourceSet ? 'Source ready (Alt+Click to reset)' : 'Alt+Click canvas to pick source'}
            </span>
          )}
        </div>
      )}

      {/* Bucket / Magic Wand options */}
      {(settings.tool === 'bucket' || settings.tool === 'wand') && (
        <div className={styles.group}>
          <span className={styles.label}>Tolerance</span>
          <input
            type="range"
            min={0}
            max={120}
            value={settings.tolerance}
            onChange={e => onChange(p => ({ ...p, tolerance: Number(e.target.value) }))}
            className={styles.slider}
          />
          <span className={styles.val}>{settings.tolerance}</span>

          <button
            type="button"
            className={`${styles.toggleBtn} ${settings.contiguous ? styles.toggleBtnActive : ''}`}
            onClick={() => onChange(p => ({ ...p, contiguous: !p.contiguous }))}
          >
            Contiguous
          </button>
        </div>
      )}

      {/* Gradient options */}
      {settings.tool === 'gradient' && (
        <div className={styles.group}>
          <select
            className={styles.select}
            value={settings.gradientKind}
            onChange={e => onChange(p => ({ ...p, gradientKind: e.target.value as GradientKind }))}
          >
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
          <button
            type="button"
            className={`${styles.toggleBtn} ${settings.gradientToTransparent ? styles.toggleBtnActive : ''}`}
            onClick={() => onChange(p => ({ ...p, gradientToTransparent: !p.gradientToTransparent }))}
          >
            FG → Transparent
          </button>
        </div>
      )}

      {/* Shape options */}
      {settings.tool === 'shape' && (
        <div className={styles.group}>
          <select
            className={styles.select}
            value={settings.shapeKind}
            onChange={e => onChange(p => ({ ...p, shapeKind: e.target.value as ShapeKind }))}
          >
            <option value="rect">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="line">Line</option>
          </select>
          {settings.shapeKind !== 'line' && (
            <button
              type="button"
              className={`${styles.toggleBtn} ${settings.shapeFilled ? styles.toggleBtnActive : ''}`}
              onClick={() => onChange(p => ({ ...p, shapeFilled: !p.shapeFilled }))}
            >
              Fill
            </button>
          )}
          <span className={styles.label}>Stroke</span>
          <input
            type="number"
            min={1}
            max={32}
            value={settings.shapeStrokeWidth}
            onChange={e => onChange(p => ({ ...p, shapeStrokeWidth: Math.max(1, Number(e.target.value) || 1) }))}
            className={styles.numberInput}
          />
        </div>
      )}

      {/* Text options */}
      {settings.tool === 'text' && (
        <div className={styles.group}>
          <select
            className={styles.select}
            value={settings.fontFamily}
            onChange={e => onChange(p => ({ ...p, fontFamily: e.target.value }))}
          >
            <option value="sans-serif">Sans-serif</option>
            <option value="monospace">Monospace</option>
            <option value="serif">Serif</option>
          </select>
          <span className={styles.label}>Size</span>
          <input
            type="number"
            min={6}
            max={128}
            value={settings.fontSize}
            onChange={e => onChange(p => ({ ...p, fontSize: Math.max(6, Number(e.target.value) || 12) }))}
            className={styles.numberInput}
          />
          <button
            type="button"
            className={`${styles.toggleBtn} ${settings.fontBold ? styles.toggleBtnActive : ''}`}
            onClick={() => onChange(p => ({ ...p, fontBold: !p.fontBold }))}
          >
            Bold
          </button>
        </div>
      )}

      {/* Active Transform Apply/Cancel */}
      {hasActiveTransform && (
        <div className={styles.group}>
          <button type="button" className={`${styles.toggleBtn} ${styles.toggleBtnActive}`} onClick={onCommitTransform}>
            <Check size={12} /> Apply Transform
          </button>
          <button type="button" className={styles.toggleBtn} onClick={onCancelTransform}>
            <X size={12} /> Cancel
          </button>
        </div>
      )}

      {/* Selection quick actions */}
      {selectionMask?.bounds && (
        <div className={styles.group}>
          <button type="button" className={styles.toggleBtn} onClick={onDeselect} title="Deselect (Ctrl+D)">
            Deselect
          </button>
          <button type="button" className={styles.toggleBtn} onClick={onInvertSelection}>
            Invert
          </button>
          <button type="button" className={styles.toggleBtn} onClick={onMaskFromSelection}>
            <Sparkles size={11} /> To Mask
          </button>
        </div>
      )}

      <div className={styles.rightGroup}>
        {hasMaskOnActive && (
          <button
            type="button"
            className={`${styles.toggleBtn} ${maskSoloActive ? styles.toggleBtnActive : ''}`}
            onClick={onToggleMaskSolo}
            title="View active layer mask solo"
          >
            <Eye size={12} /> Mask
          </button>
        )}

        <button
          type="button"
          className={`${styles.toggleBtn} ${showPixelGrid ? styles.toggleBtnActive : ''}`}
          onClick={onTogglePixelGrid}
          title="Toggle Pixel Grid (visible at ≥600% zoom)"
        >
          <Grid3x3 size={12} /> Grid
        </button>

        <button
          type="button"
          className={`${styles.toggleBtn} ${onionSkinEnabled ? styles.toggleBtnActive : ''}`}
          onClick={() => setShowOnionPopover(v => !v)}
          title="Onion Skinning Settings"
        >
          <Layers size={12} /> Onion
        </button>

        {showOnionPopover && (
          <div className={styles.popover} onClick={e => e.stopPropagation()}>
            <label className={styles.popRow}>
              <span>Enable Onion Skin</span>
              <input
                type="checkbox"
                checked={onionSkinEnabled}
                onChange={e => onToggleOnionSkin(e.target.checked)}
              />
            </label>
            <label className={styles.popRow}>
              <span>Prev Frames</span>
              <input
                type="number"
                min={0}
                max={5}
                value={onionPrev}
                onChange={e => onOnionPrevChange(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                className={styles.numberInput}
              />
            </label>
            <label className={styles.popRow}>
              <span>Next Frames</span>
              <input
                type="number"
                min={0}
                max={5}
                value={onionNext}
                onChange={e => onOnionNextChange(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                className={styles.numberInput}
              />
            </label>
            <label className={styles.popRow}>
              <span>Opacity</span>
              <input
                type="range"
                min={10}
                max={90}
                value={Math.round(onionOpacity * 100)}
                onChange={e => onOnionOpacityChange(Number(e.target.value) / 100)}
                className={styles.slider}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
