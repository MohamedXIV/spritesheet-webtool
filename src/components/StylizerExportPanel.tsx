'use client';

import React, { useState, useCallback } from 'react';
import { useStylizerContext, MapSlot } from '@/contexts/StylizerContext';
import styles from './StylizerExportPanel.module.css';

const EXPORTABLE: { slot: MapSlot; label: string }[] = [
  { slot: 'albedo', label: 'Albedo (stylized)' },
  { slot: 'normal', label: 'Normal' },
  { slot: 'height', label: 'Height' },
  { slot: 'roughness', label: 'Roughness' },
  { slot: 'metallic', label: 'Metallic' },
  { slot: 'ao', label: 'AO (original)' },
];

async function bitmapToPngBytes(bitmap: ImageBitmap): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export function StylizerExportPanel() {
  const { renderFullRes, projectName, hasAlbedo } = useStylizerContext();
  const [selected, setSelected] = useState<Set<MapSlot>>(new Set(['albedo', 'normal', 'height']));
  const [busy, setBusy] = useState(false);

  const toggle = (slot: MapSlot) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(slot) ? next.delete(slot) : next.add(slot);
    return next;
  });

  const onExport = useCallback(async () => {
    setBusy(true);
    // Every bitmap in `maps` is caller-owned (fresh or a clone), so we close them all.
    const maps = await renderFullRes();
    try {
      // Match the trimsheet tool's export: bundle PNGs into one zip via fflate
      // (already a dependency — see src/lib/trimsheetBaker.ts).
      const { zipSync } = await import('fflate');
      const base = (projectName || 'material').replace(/[^a-z0-9_-]+/gi, '_');
      const files: Record<string, Uint8Array> = {};
      for (const item of EXPORTABLE) {
        if (!selected.has(item.slot)) continue;
        const bmp = maps[item.slot];
        if (!bmp) continue;
        files[`${base}_${item.slot}.png`] = await bitmapToPngBytes(bmp);
      }
      const zipped = zipSync(files, { level: 6 });
      const blob = new Blob([zipped], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${base}_stylized.zip`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      Object.values(maps).forEach((b) => { try { b.close(); } catch { /* noop */ } });
      setBusy(false);
    }
  }, [selected, renderFullRes, projectName]);

  return (
    <div className={styles.panel}>
      <h4>Export Maps</h4>
      <div className={styles.list}>
        {EXPORTABLE.map((item) => (
          <label key={item.slot} className={styles.row}>
            <input type="checkbox" checked={selected.has(item.slot)} onChange={() => toggle(item.slot)} />
            {item.label}
          </label>
        ))}
      </div>
      <button className={styles.exportBtn} disabled={busy || !hasAlbedo} onClick={onExport}>
        {busy ? 'Exporting…' : 'Download ZIP'}
      </button>
    </div>
  );
}
