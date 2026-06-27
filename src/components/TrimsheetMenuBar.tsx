// src/components/TrimsheetMenuBar.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import styles from './TrimsheetMenuBar.module.css';

const TOGGLEABLE = [
  { id: 'regions', label: 'Regions' },
  { id: 'inspector', label: 'Inspector' },
  { id: 'materials', label: 'Materials' },
  { id: 'export', label: 'Export' },
  { id: 'canvas', label: 'Trimsheet' },
];

export function TrimsheetMenuBar() {
  const ctx = useTrimsheetContext();

  const handleSaveAs = () => {
    const name = prompt('Save trimsheet as:', ctx.projectName);
    if (name) ctx.triggerSaveAs(name);
  };

  return (
    <div className={styles.menubar}>
      <Link href="/" className={styles.brand}>← Trimsheet Builder</Link>
      <div className={styles.menuGroup}>
        <button className={styles.menuItem} onClick={() => ctx.triggerSave()}>Save</button>
        <button className={styles.menuItem} onClick={handleSaveAs}>Save As</button>
      </div>
      <div className={styles.menuGroup}>
        {TOGGLEABLE.map((p) => (
          <button
            key={p.id}
            className={styles.menuItem}
            style={{ opacity: ctx.visiblePanels.has(p.id) ? 1 : 0.5 }}
            onClick={() => ctx.togglePanel(p.id)}
          >
            {p.label}
          </button>
        ))}
        <button className={styles.menuItem} onClick={ctx.resetLayout}>Reset Layout</button>
      </div>
      <div className={styles.spacer} />
      <span className={styles.status}>{ctx.isDirty ? 'Unsaved changes' : 'Saved'}</span>
    </div>
  );
}
