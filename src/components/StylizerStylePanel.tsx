'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useStylizerContext } from '@/contexts/StylizerContext';
import { StylizerStyle } from '@/lib/stylizer';
import styles from './StylizerStylePanel.module.css';

const STYLE_OPTIONS: { value: StylizerStyle; label: string }[] = [
  { value: 'painterly', label: 'Painterly' },
  { value: 'cel',       label: 'Cel / Toon' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'sketch',     label: 'Sketch' },
];

function Section({ label, children, defaultOpen = true }: {
  label: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={9} strokeWidth={2.5} /> : <ChevronRight size={9} strokeWidth={2.5} />}
        <span>{label}</span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange, disabled = false }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className={`${styles.sliderRow} ${disabled ? styles.sliderRowDisabled : ''}`}>
      <span className={styles.sliderLabel}>{label}</span>
      <input type="range" className={styles.sliderTrack}
        min={min} max={max} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className={styles.sliderValue}>{value}</span>
    </div>
  );
}

function ToggleRow({ label, checked, onChange, disabled = false }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className={`${styles.toggleRow} ${disabled ? styles.sliderRowDisabled : ''}`}>
      <span className={styles.toggleLabel}>{label}</span>
      <label className={styles.switch}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className={styles.switchSlider} />
      </label>
    </div>
  );
}

export function StylizerStylePanel() {
  const { options, setOptions } = useStylizerContext();
  const set = <K extends keyof typeof options>(k: K, v: (typeof options)[K]) =>
    setOptions((p) => ({ ...p, [k]: v }));

  return (
    <div className={styles.panel}>
      {/* Segmented control for Style Type */}
      <div className={styles.styleSelectorSection}>
        <span className={styles.selectorLabel}>Stylization Filter</span>
        <div className={styles.styleRow}>
          {STYLE_OPTIONS.map((s) => (
            <button key={s.value}
              className={`${styles.styleBtn} ${options.style === s.value ? styles.styleActive : ''}`}
              onClick={() => set('style', s.value)}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Base parameters */}
      <Section label="BASE FILTER PARAMETERS">
        <SliderRow label="Brush / Smooth" value={options.smoothRadius} min={0} max={8} onChange={(v) => set('smoothRadius', v)} />
        <SliderRow label="Contrast" value={options.contrast} min={-100} max={100} onChange={(v) => set('contrast', v)} />
        <SliderRow label="Saturation" value={options.saturation} min={-100} max={100} onChange={(v) => set('saturation', v)} />
        <SliderRow label="Brightness" value={options.brightness} min={-100} max={100} onChange={(v) => set('brightness', v)} />
      </Section>

      {/* Style-specific parameters */}
      {options.style === 'painterly' && (
        <Section label="PAINTERLY OPTIONS">
          <SliderRow label="Brush Strength" value={options.brushStrength} min={0} max={100} onChange={(v) => set('brushStrength', v)} />
          <SliderRow label="Detail Preserve" value={options.detailPreserve} min={0} max={100} onChange={(v) => set('detailPreserve', v)} />
        </Section>
      )}
      {options.style === 'cel' && (
        <Section label="CEL OPTIONS">
          <SliderRow label="Levels" value={options.levels} min={2} max={16} onChange={(v) => set('levels', v)} />
          <SliderRow label="Smoothing" value={options.celSmoothing} min={0} max={100} onChange={(v) => set('celSmoothing', v)} />
          <ToggleRow label="Snap to Toon Palette" checked={options.paletteSnap} onChange={(v) => set('paletteSnap', v)} />
        </Section>
      )}
      {options.style === 'watercolor' && (
        <Section label="WATERCOLOR OPTIONS">
          <SliderRow label="Bleed" value={options.bleed} min={0} max={100} onChange={(v) => set('bleed', v)} />
          <SliderRow label="Granulation" value={options.granulation} min={0} max={100} onChange={(v) => set('granulation', v)} />
          <SliderRow label="Wash" value={options.washStrength} min={0} max={100} onChange={(v) => set('washStrength', v)} />
        </Section>
      )}
      {options.style === 'sketch' && (
        <Section label="SKETCH OPTIONS">
          <SliderRow label="Line Strength" value={options.lineStrength} min={0} max={100} onChange={(v) => set('lineStrength', v)} />
          <SliderRow label="Threshold" value={options.lineThreshold} min={0} max={100} onChange={(v) => set('lineThreshold', v)} />
          <ToggleRow label="Enable Cross-Hatching" checked={options.hatching} onChange={(v) => set('hatching', v)} />
        </Section>
      )}

      {/* Outline settings */}
      <Section label="INK OUTLINE">
        <ToggleRow label="Enable Ink Outline" checked={options.outlineEnabled} onChange={(v) => set('outlineEnabled', v)} />
        {options.outlineEnabled && (
          <div className={styles.outlineSubBody}>
            <div className={styles.colorRow}>
              <span className={styles.colorLabel}>Outline Color</span>
              <input type="color" className={styles.colorPicker} value={options.outlineColor} onChange={(e) => set('outlineColor', e.target.value)} />
            </div>
            <SliderRow label="Thickness" value={options.outlineThickness} min={1} max={4} onChange={(v) => set('outlineThickness', v)} />
          </div>
        )}
      </Section>
    </div>
  );
}
