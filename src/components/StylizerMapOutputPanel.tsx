'use client';

import React, { useEffect, useRef } from 'react';
import { useStylizerContext, MapSlot } from '@/contexts/StylizerContext';
import styles from './StylizerMapOutputPanel.module.css';

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
      <canvas ref={canvasRef} width={72} height={72} className={styles.thumbCanvas} />
      <span>{label}</span>
    </div>
  );
}

export function StylizerMapOutputPanel() {
  const { options, setOptions, derived } = useStylizerContext();
  const set = <K extends keyof typeof options>(k: K, v: (typeof options)[K]) =>
    setOptions((p) => ({ ...p, [k]: v }));

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <h4>Bake into Albedo</h4>
        <label className={styles.check}>
          <input type="checkbox" checked={options.bakeAO} onChange={(e) => set('bakeAO', e.target.checked)} />
          Bake AO
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={options.bakeShading} onChange={(e) => set('bakeShading', e.target.checked)} />
          Bake soft shading (from height)
        </label>
        <label className={styles.slider}>
          <span>Bake Strength<em>{options.bakeStrength}</em></span>
          <input type="range" min={0} max={100} value={options.bakeStrength}
            onChange={(e) => set('bakeStrength', Number(e.target.value))} />
        </label>
      </div>

      <div className={styles.section}>
        <h4>Regenerate Maps</h4>
        <label className={styles.check}>
          <input type="checkbox" checked={options.regenerateNormal} onChange={(e) => set('regenerateNormal', e.target.checked)} />
          Regenerate Normal
        </label>
        {options.regenerateNormal && (
          <label className={styles.slider}>
            <span>Normal Strength<em>{options.normalStrength}</em></span>
            <input type="range" min={0} max={100} value={options.normalStrength}
              onChange={(e) => set('normalStrength', Number(e.target.value))} />
          </label>
        )}
        <label className={styles.check}>
          <input type="checkbox" checked={options.regenerateHeight} onChange={(e) => set('regenerateHeight', e.target.checked)} />
          Regenerate Height
        </label>
      </div>

      <div className={styles.section}>
        <h4>Flatten (pass-through maps)</h4>
        <label className={styles.check}>
          <input type="checkbox" checked={options.flattenRoughness} onChange={(e) => set('flattenRoughness', e.target.checked)} />
          Flatten Roughness
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={options.flattenMetallic} onChange={(e) => set('flattenMetallic', e.target.checked)} />
          Flatten Metallic
        </label>
      </div>

      <div className={styles.section}>
        <h4>Output Preview</h4>
        <div className={styles.thumbs}>
          <Thumb bitmap={derived.stylizedAlbedo} label="Albedo" />
          <Thumb bitmap={derived.normal} label="Normal" />
          <Thumb bitmap={derived.height} label="Height" />
        </div>
      </div>
    </div>
  );
}
