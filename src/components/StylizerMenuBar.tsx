'use client';

import React from 'react';
import Link from 'next/link';
import { useStylizerContext } from '@/contexts/StylizerContext';
import styles from './StylizerMenuBar.module.css';

const VIEW_PANELS: { id: string; label: string }[] = [
  { id: 'material-loader', label: 'Material Maps' },
  { id: 'style', label: 'Style' },
  { id: 'map-output', label: 'Map Output' },
  { id: 'preview-2d', label: 'Preview' },
  { id: 'preview-3d', label: '3D Preview' },
  { id: 'export', label: 'Export' },
];

export function StylizerMenuBar() {
  const ctx = useStylizerContext();
  return (
    <div className={styles.menubar}>
      <Link href="/" className={styles.brand}>🎨 Material Stylizer</Link>
      <input
        className={styles.nameInput}
        value={ctx.projectName}
        onChange={(e) => ctx.setProjectName(e.target.value)}
        aria-label="Project name"
      />
      <button className={styles.item} onClick={ctx.resetMaterial}>New</button>
      <button className={styles.item} onClick={() => ctx.triggerSave()} disabled={ctx.isSaving}>
        {ctx.isSaving ? 'Saving…' : 'Save'}
      </button>
      <div className={styles.viewMenu}>
        <span className={styles.item}>View ▾</span>
        <div className={styles.dropdown}>
          {VIEW_PANELS.map((p) => (
            <button key={p.id} className={styles.dropItem}
              onClick={() => ctx.togglePanel(p.id)}>
              {ctx.visiblePanels.has(p.id) ? '✓ ' : '  '}{p.label}
            </button>
          ))}
          <button className={styles.dropItem} onClick={ctx.resetLayout}>Reset Layout</button>
        </div>
      </div>
      {ctx.autosaveNotification && <span className={styles.note}>{ctx.autosaveNotification}</span>}
    </div>
  );
}
