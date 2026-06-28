// src/components/RegionInspectorPanel.tsx
'use client';

import React from 'react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { countMaps } from '@/lib/trimsheetMaterials';
import styles from './RegionInspectorPanel.module.css';

export function RegionInspectorPanel() {
  const ctx = useTrimsheetContext();
  const region = ctx.regions.find((r) => r.id === ctx.selectedRegionId) || null;

  if (!region) return <div className={styles.empty}>Select a region to edit its material and tiling.</div>;

  const material = region.materialId ? ctx.materials.find((m) => m.id === region.materialId) || null : null;

  return (
    <div className={styles.panel}>
      <div className={styles.field}>
        <label>Region</label>
        <input className={styles.select} value={region.name}
          onChange={(e) => ctx.renameRegion(region.id, e.target.value)} />
      </div>

      <div className={styles.field}>
        <label>Material</label>
        <div className={styles.row}>
          <span style={{ flex: 1 }}>
            {material ? `${material.name} (${countMaps(material)}/5 maps)` : 'None'}
          </span>
          {material && (
            <button className={styles.btn} onClick={() => ctx.clearRegionMaterial(region.id)}>Clear</button>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label>Flat Color (no-texture fill)</label>
        <input type="color"
          onChange={(e) => ctx.setRegionFlatColor(region.id, e.target.value)} />
      </div>

      <div className={styles.field}>
        <label>Tiling Scale ({region.tiling.scale.toFixed(2)}×)</label>
        <div className={styles.row}>
          <input type="range" min={0.25} max={8} step={0.25} value={region.tiling.scale}
            onChange={(e) => ctx.updateRegionTiling(region.id, { scale: Number(e.target.value) })} />
          <span className={styles.val}>{region.tiling.scale.toFixed(2)}</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>Offset X</label>
        <div className={styles.row}>
          <input type="range" min={0} max={1} step={0.01} value={region.tiling.offsetX}
            onChange={(e) => ctx.updateRegionTiling(region.id, { offsetX: Number(e.target.value) })} />
          <span className={styles.val}>{region.tiling.offsetX.toFixed(2)}</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>Offset Y</label>
        <div className={styles.row}>
          <input type="range" min={0} max={1} step={0.01} value={region.tiling.offsetY}
            onChange={(e) => ctx.updateRegionTiling(region.id, { offsetY: Number(e.target.value) })} />
          <span className={styles.val}>{region.tiling.offsetY.toFixed(2)}</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>Rotation</label>
        <select className={styles.select} value={region.tiling.rotation}
          onChange={(e) => ctx.updateRegionTiling(region.id, { rotation: Number(e.target.value) as 0 | 90 | 180 | 270 })}>
          <option value={0}>0°</option>
          <option value={90}>90°</option>
          <option value={180}>180°</option>
          <option value={270}>270°</option>
        </select>
      </div>
    </div>
  );
}
