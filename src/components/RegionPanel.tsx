// src/components/RegionPanel.tsx
'use client';

import React, { useState, useRef } from 'react';
import {
  Trash2, SplitSquareHorizontal, SplitSquareVertical,
  ArrowLeftRight, ArrowUpDown, GitMerge,
} from 'lucide-react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { TrimResolution } from '@/lib/trimsheetTypes';
import styles from './RegionPanel.module.css';

export function RegionPanel() {
  const ctx = useTrimsheetContext();
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
    setTimeout(() => inputRef.current?.select(), 10);
  };

  const commitEdit = () => {
    if (editingId && editName.trim()) {
      ctx.renameRegion(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    if (editingId === id) return; // don't interfere with editing
    if (e.shiftKey) {
      // Toggle multi-selection
      const next = new Set(ctx.selectedRegionIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // Keep selectedRegionId pointed at the last clicked
      ctx.selectRegion(id);
      ctx.setSelectedRegionIds(next);
    } else {
      // Single select – clear multi-selection
      ctx.selectRegion(id);
      ctx.setSelectedRegionIds(new Set([id]));
      setEditingId(null);
    }
  };

  const handleNameDoubleClick = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    startEdit(id, name);
  };

  const multiCount = ctx.selectedRegionIds.size;
  const canMerge = multiCount >= 2;

  return (
    <div className={styles.panel}>

      {/* Resolution */}
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

      {/* Grid generator */}
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

      {/* Region list */}
      <div className={styles.section}>
        <div className={styles.listHeader}>
          <span className={styles.label}>Regions ({ctx.regions.length})</span>
          {canMerge && (
            <button
              className={styles.mergeBtn}
              onClick={() => ctx.mergeSelectedRegions()}
              title={`Merge ${multiCount} selected regions into one bounding box`}
            >
              <GitMerge size={12} />
              Merge {multiCount}
            </button>
          )}
        </div>

        {multiCount >= 2 && (
          <div className={styles.multiHint}>
            {multiCount} selected · Shift-click to toggle · Press Merge to combine
          </div>
        )}

        <div className={styles.list}>
          {ctx.regions.map((r) => {
            const isPrimary = ctx.selectedRegionId === r.id;
            const isMulti = ctx.selectedRegionIds.has(r.id);
            const isEditing = editingId === r.id;

            return (
              <div
                key={r.id}
                className={`${styles.item} ${isPrimary ? styles.active : ''} ${isMulti && !isPrimary ? styles.multiActive : ''}`}
                onClick={(e) => handleRowClick(e, r.id)}
              >
                {/* Region name: span normally, input when editing */}
                {isEditing ? (
                  <input
                    ref={inputRef}
                    className={styles.itemInput}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span
                    className={styles.itemName}
                    onDoubleClick={(e) => handleNameDoubleClick(e, r.id, r.name)}
                    title="Double-click to rename"
                  >
                    {r.name}
                  </span>
                )}

                {/* Action buttons */}
                <div className={styles.actions}>
                  <button className={styles.iconBtn} title="Split vertical (left/right)"
                    onClick={(e) => { e.stopPropagation(); ctx.splitRegion(r.id, 'vertical'); }}>
                    <SplitSquareHorizontal size={12} />
                  </button>
                  <button className={styles.iconBtn} title="Split horizontal (top/bottom)"
                    onClick={(e) => { e.stopPropagation(); ctx.splitRegion(r.id, 'horizontal'); }}>
                    <SplitSquareVertical size={12} />
                  </button>
                  <button className={styles.iconBtn} title="Stretch to full width"
                    onClick={(e) => { e.stopPropagation(); ctx.stretchRegion(r.id, 'horizontal'); }}>
                    <ArrowLeftRight size={12} />
                  </button>
                  <button className={styles.iconBtn} title="Stretch to full height"
                    onClick={(e) => { e.stopPropagation(); ctx.stretchRegion(r.id, 'vertical'); }}>
                    <ArrowUpDown size={12} />
                  </button>
                  <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete region"
                    onClick={(e) => { e.stopPropagation(); ctx.deleteRegion(r.id); }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
