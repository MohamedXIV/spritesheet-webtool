'use client';

import React from 'react';
import { useStylizerContext } from '@/contexts/StylizerContext';
import { StylizerStyle } from '@/lib/stylizer';
import styles from './StylizerStylePanel.module.css';

const STYLE_OPTIONS: { value: StylizerStyle; label: string }[] = [
  { value: 'painterly', label: 'Painterly' },
  { value: 'cel', label: 'Cel / Toon' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'sketch', label: 'Sketch' },
];

function Slider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <label className={styles.slider}>
      <span>{label}<em>{value}</em></span>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function StylizerStylePanel() {
  const { options, setOptions } = useStylizerContext();
  const set = <K extends keyof typeof options>(k: K, v: (typeof options)[K]) =>
    setOptions((p) => ({ ...p, [k]: v }));

  return (
    <div className={styles.panel}>
      <div className={styles.styleRow}>
        {STYLE_OPTIONS.map((s) => (
          <button key={s.value}
            className={`${styles.styleBtn} ${options.style === s.value ? styles.styleActive : ''}`}
            onClick={() => set('style', s.value)}>{s.label}</button>
        ))}
      </div>

      <div className={styles.section}>
        <h4>Base</h4>
        <Slider label="Brush / Smooth" value={options.smoothRadius} min={0} max={8} onChange={(v) => set('smoothRadius', v)} />
        <Slider label="Contrast" value={options.contrast} min={-100} max={100} onChange={(v) => set('contrast', v)} />
        <Slider label="Saturation" value={options.saturation} min={-100} max={100} onChange={(v) => set('saturation', v)} />
        <Slider label="Brightness" value={options.brightness} min={-100} max={100} onChange={(v) => set('brightness', v)} />
      </div>

      {options.style === 'painterly' && (
        <div className={styles.section}>
          <h4>Painterly</h4>
          <Slider label="Brush Strength" value={options.brushStrength} min={0} max={100} onChange={(v) => set('brushStrength', v)} />
          <Slider label="Detail Preserve" value={options.detailPreserve} min={0} max={100} onChange={(v) => set('detailPreserve', v)} />
        </div>
      )}
      {options.style === 'cel' && (
        <div className={styles.section}>
          <h4>Cel</h4>
          <Slider label="Levels" value={options.levels} min={2} max={16} onChange={(v) => set('levels', v)} />
          <Slider label="Smoothing" value={options.celSmoothing} min={0} max={100} onChange={(v) => set('celSmoothing', v)} />
        </div>
      )}
      {options.style === 'watercolor' && (
        <div className={styles.section}>
          <h4>Watercolor</h4>
          <Slider label="Bleed" value={options.bleed} min={0} max={100} onChange={(v) => set('bleed', v)} />
          <Slider label="Granulation" value={options.granulation} min={0} max={100} onChange={(v) => set('granulation', v)} />
          <Slider label="Wash" value={options.washStrength} min={0} max={100} onChange={(v) => set('washStrength', v)} />
        </div>
      )}
      {options.style === 'sketch' && (
        <div className={styles.section}>
          <h4>Sketch</h4>
          <Slider label="Line Strength" value={options.lineStrength} min={0} max={100} onChange={(v) => set('lineStrength', v)} />
          <Slider label="Threshold" value={options.lineThreshold} min={0} max={100} onChange={(v) => set('lineThreshold', v)} />
        </div>
      )}

      <div className={styles.section}>
        <h4>Outline</h4>
        <label className={styles.check}>
          <input type="checkbox" checked={options.outlineEnabled} onChange={(e) => set('outlineEnabled', e.target.checked)} />
          Enable ink outline
        </label>
        {options.outlineEnabled && (
          <>
            <label className={styles.colorRow}>Color
              <input type="color" value={options.outlineColor} onChange={(e) => set('outlineColor', e.target.value)} />
            </label>
            <Slider label="Thickness" value={options.outlineThickness} min={1} max={4} onChange={(v) => set('outlineThickness', v)} />
          </>
        )}
      </div>
    </div>
  );
}
