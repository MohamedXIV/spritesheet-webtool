'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useStylizerContext } from '@/contexts/StylizerContext';
import styles from './StylizerMapOutputPanel.module.css';

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

function Thumb({ bitmap, label }: { bitmap: ImageBitmap | null; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    }
  }, [bitmap]);
  return (
    <div className={styles.thumb}>
      <div className={styles.thumbCanvasWrapper}>
        <canvas ref={canvasRef} width={72} height={72} className={styles.thumbCanvas} />
      </div>
      <span className={styles.thumbLabel}>{label}</span>
    </div>
  );
}

export function StylizerMapOutputPanel() {
  const { options, setOptions, derived } = useStylizerContext();
  const set = <K extends keyof typeof options>(k: K, v: (typeof options)[K]) =>
    setOptions((p) => ({ ...p, [k]: v }));

  return (
    <div className={styles.panel}>
      <Section label="BAKE INTO ALBEDO">
        <ToggleRow label="Bake AO Map" checked={options.bakeAO} onChange={(v) => set('bakeAO', v)} />
        <ToggleRow label="Bake Soft Shading (Height)" checked={options.bakeShading} onChange={(v) => set('bakeShading', v)} />
        <SliderRow label="Bake Strength" value={options.bakeStrength} min={0} max={100} onChange={(v) => set('bakeStrength', v)} />
      </Section>

      <Section label="REGENERATE MAPS">
        <ToggleRow label="Regenerate Normal Map" checked={options.regenerateNormal} onChange={(v) => set('regenerateNormal', v)} />
        {options.regenerateNormal && (
          <div className={styles.subBody}>
            <SliderRow label="Normal Strength" value={options.normalStrength} min={0} max={100} onChange={(v) => set('normalStrength', v)} />
          </div>
        )}
        <ToggleRow label="Regenerate Height Map" checked={options.regenerateHeight} onChange={(v) => set('regenerateHeight', v)} />
      </Section>

      <Section label="FLATTEN PASS-THROUGH MAPS">
        <ToggleRow label="Flatten Roughness Map" checked={options.flattenRoughness} onChange={(v) => set('flattenRoughness', v)} />
        <ToggleRow label="Flatten Metallic Map" checked={options.flattenMetallic} onChange={(v) => set('flattenMetallic', v)} />
      </Section>

      <Section label="OUTPUT MAP PREVIEWS">
        <div className={styles.thumbs}>
          <Thumb bitmap={derived.stylizedAlbedo} label="Albedo" />
          <Thumb bitmap={derived.normal} label="Normal" />
          <Thumb bitmap={derived.height} label="Height" />
        </div>
      </Section>
    </div>
  );
}
