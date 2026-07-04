'use client';

import React, { useCallback, useRef } from 'react';
import { useStylizerContext, MAP_SLOTS, MapSlot } from '@/contexts/StylizerContext';
import styles from './StylizerMaterialLoaderPanel.module.css';

const SLOT_LABELS: Record<MapSlot, string> = {
  albedo: 'Albedo / Base Color',
  normal: 'Normal',
  roughness: 'Roughness',
  metallic: 'Metallic',
  ao: 'Ambient Occlusion',
  height: 'Height / Displacement',
};

const SLOT_PATTERNS: Record<MapSlot, RegExp> = {
  albedo: /(albedo|basecolor|base_color|diffuse|_col|_color)/i,
  normal: /(normal|_nrm|_nor|_norm)/i,
  roughness: /(rough|_rgh)/i,
  metallic: /(metal|metallic|_met)/i,
  ao: /(ao|occlusion|_occ)/i,
  height: /(height|displace|_disp|_hgt|bump)/i,
};

export function detectSlot(filename: string): MapSlot | null {
  for (const slot of MAP_SLOTS) {
    if (SLOT_PATTERNS[slot].test(filename)) return slot;
  }
  return null;
}

export function StylizerMaterialLoaderPanel() {
  const ctx = useStylizerContext();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const onFile = useCallback((slot: MapSlot, file: File | undefined) => {
    if (file) ctx.loadMap(slot, file);
  }, [ctx]);

  const onDrop = useCallback((slot: MapSlot, e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const detected = detectSlot(file.name) ?? slot;
    ctx.loadMap(detected, file);
  }, [ctx]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Material Maps</span>
        <button className={styles.resetBtn} onClick={ctx.resetMaterial}>Reset</button>
      </div>
      <div className={styles.slots}>
        {MAP_SLOTS.map((slot) => {
          const loaded = !!ctx.material.maps[slot];
          return (
            <div
              key={slot}
              className={`${styles.slot} ${loaded ? styles.slotLoaded : ''} ${slot === 'albedo' ? styles.slotRequired : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(slot, e)}
              onClick={() => inputRefs.current[slot]?.click()}
            >
              <div className={styles.slotLabel}>
                {SLOT_LABELS[slot]}{slot === 'albedo' ? ' *' : ''}
              </div>
              <div className={styles.slotState}>{loaded ? 'Loaded' : 'Drop / click'}</div>
              {loaded && (
                <button
                  className={styles.clearBtn}
                  onClick={(e) => { e.stopPropagation(); ctx.clearMap(slot); }}
                >×</button>
              )}
              <input
                ref={(el) => { inputRefs.current[slot] = el; }}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={(e) => onFile(slot, e.target.files?.[0])}
              />
            </div>
          );
        })}
      </div>
      <p className={styles.hint}>Albedo is required. Filenames auto-detect their slot.</p>
    </div>
  );
}
