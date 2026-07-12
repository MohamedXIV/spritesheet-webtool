'use client';

import React, { useState, useCallback } from 'react';
import { Download, ChevronDown, ChevronRight } from 'lucide-react';
import { useStylizerContext, MapSlot } from '@/contexts/StylizerContext';
import styles from './StylizerExportPanel.module.css';

const EXPORTABLE: { slot: MapSlot; label: string }[] = [
  { slot: 'albedo',    label: 'Albedo (stylized)' },
  { slot: 'normal',    label: 'Normal' },
  { slot: 'height',    label: 'Height' },
  { slot: 'roughness', label: 'Roughness' },
  { slot: 'metallic',  label: 'Metallic' },
  { slot: 'ao',        label: 'AO (original)' },
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
    if (next.has(slot)) {
      next.delete(slot);
    } else {
      next.add(slot);
    }
    return next;
  });

  const onExport = useCallback(async () => {
    setBusy(true);
    let maps: Partial<Record<MapSlot, ImageBitmap>> = {};
    try {
      maps = await renderFullRes();
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
      Object.values(maps).forEach((b) => { try { b?.close(); } catch { /* noop */ } });
      setBusy(false);
    }
  }, [selected, renderFullRes, projectName]);

  return (
    <div className={styles.panel}>
      <Section label="SELECT MAPS TO EXPORT">
        <p className={styles.hint}>Choose which generated PBR maps to include in your package.</p>
        <div className={styles.list}>
          {EXPORTABLE.map((item) => (
            <ToggleRow
              key={item.slot}
              label={item.label}
              checked={selected.has(item.slot)}
              onChange={() => toggle(item.slot)}
            />
          ))}
        </div>
      </Section>

      <Section label="DOWNLOAD ASSET BUNDLE">
        <p className={styles.hint}>Compiles selected textures at full resolution into a compressed ZIP.</p>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={busy || !hasAlbedo}
          onClick={onExport}
        >
          <Download size={12} strokeWidth={2.5} />
          {busy ? 'Exporting…' : 'Download ZIP Bundle'}
        </button>
      </Section>
    </div>
  );
}
