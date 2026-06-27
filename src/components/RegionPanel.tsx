// src/components/RegionPanel.tsx
'use client';

import React, { useState } from 'react';
import { Trash2, SplitSquareHorizontal, SplitSquareVertical } from 'lucide-react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { TrimResolution } from '@/lib/trimsheetTypes';
import styles from './RegionPanel.module.css';

export function RegionPanel() {
  const ctx = useTrimsheetContext();
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [mergeWith, setMergeWith] = useState<string>('');

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <span className={styles.label}>Resolution</span>
        <select
          className={styles.select}
          value={ctx.resolution}
          onChange={(e) => ctx.setResolution(Number(e.target.value) as TrimResolution)}
        >
          <option value={512}>512 × 512</option>
          <option value={1024}>1024 × 1024</option>
          <option value={2048}>2048 × 2048</option>
        </select>
      </div>

      <div className={styles.section}>
        <span className={styles.label}>Generate Grid</span>
        <div className={styles.row}>
          <label>Rows</label>
          <input type="number" min={1} max={16} value={rows}
            onChange={(e) => setRows(Math.max(1, Number(e.target.value)))} />
          <label>Cols</label>
          <input type="number" min={1} max={16} value={cols}
            onChange={(e) => setCols(Math.max(1, Number(e.target.value)))} />
        </div>
        <button className={styles.btn} onClick={() => ctx.generateGrid(rows, cols)}>
          Apply Grid (replaces regions)
        </button>
        <button className={styles.btn} style={{ marginTop: 4 }}
          onClick={() => ctx.addRegion({ x: 0.25, y: 0.25, w: 0.5, h: 0.25 })}>
          + Add Free Region
        </button>
      </div>

      <div className={styles.section}>
        <span className={styles.label}>Regions ({ctx.regions.length})</span>
        <div className={styles.list}>
          {ctx.regions.map((r) => (
            <div
              key={r.id}
              className={`${styles.item} ${ctx.selectedRegionId === r.id ? styles.active : ''}`}
              onClick={() => ctx.selectRegion(r.id)}
            >
              <input
                className={styles.itemName}
                value={r.name}
                onChange={(e) => ctx.renameRegion(r.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={{ background: 'transparent', border: 'none', color: 'inherit', font: 'inherit' }}
              />
              <button className={styles.iconBtn} title="Split vertical"
                onClick={(e) => { e.stopPropagation(); ctx.splitRegion(r.id, 'vertical'); }}>
                <SplitSquareHorizontal size={13} />
              </button>
              <button className={styles.iconBtn} title="Split horizontal"
                onClick={(e) => { e.stopPropagation(); ctx.splitRegion(r.id, 'horizontal'); }}>
                <SplitSquareVertical size={13} />
              </button>
              <button className={styles.iconBtn} title="Delete"
                onClick={(e) => { e.stopPropagation(); ctx.deleteRegion(r.id); }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {ctx.selectedRegionId && ctx.regions.length > 1 && (
        <div className={styles.section}>
          <span className={styles.label}>Merge selected with</span>
          <div className={styles.row}>
            <select className={styles.select} value={mergeWith} onChange={(e) => setMergeWith(e.target.value)}>
              <option value="">Pick a region…</option>
              {ctx.regions.filter((r) => r.id !== ctx.selectedRegionId).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button className={`${styles.btn} ${styles.secondary}`}
              disabled={!mergeWith}
              onClick={() => { if (mergeWith && ctx.selectedRegionId) { ctx.mergeRegions(ctx.selectedRegionId, mergeWith); setMergeWith(''); } }}>
              Merge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
