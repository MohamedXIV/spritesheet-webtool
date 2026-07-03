// src/components/TrimMaterialPanel.tsx
'use client';

import React, { useState } from 'react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { loadPolyhavenMaterial, loadUploadMaterial, PolyhavenAsset } from '@/lib/trimsheetMaterials';
import styles from './TrimMaterialPanel.module.css';

export function TrimMaterialPanel() {
  const ctx = useTrimsheetContext();
  const [query, setQuery] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const noRegion = !ctx.selectedRegionId;

  const applyPolyhaven = async (asset: PolyhavenAsset) => {
    if (!ctx.selectedRegionId) { alert('Select a region first, then click a material.'); return; }
    setApplyingId(asset.id);
    try {
      const mat = await loadPolyhavenMaterial(asset);
      ctx.assignMaterialToRegion(ctx.selectedRegionId, mat);
    } catch (err) {
      console.error(err);
      alert('Failed to load this Polyhaven material. Try another or upload your own.');
    } finally {
      setApplyingId(null);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!ctx.selectedRegionId) { alert('Select a region first.'); return; }
    const albedo = e.target.files?.[0];
    if (!albedo) return;
    try {
      const mat = await loadUploadMaterial(albedo.name, { albedo });
      ctx.assignMaterialToRegion(ctx.selectedRegionId, mat);
    } catch (err) {
      console.error(err);
      alert('Failed to load uploaded image.');
    } finally {
      e.target.value = '';
    }
  };

  const filtered = ctx.polyhavenAssets.filter(
    (a) => a.name.toLowerCase().includes(query.toLowerCase()) || a.id.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 60); // cap render for performance

  return (
    <div className={styles.panel}>
      {noRegion && <div className={styles.banner}>Select a region, then click a material (or upload) to assign it.</div>}
      {ctx.polyhavenError && <div className={styles.banner}>{ctx.polyhavenError}</div>}

      <div className={styles.uploadBox}>
        <strong style={{ fontSize: '0.72rem' }}>Upload your texture (albedo)</strong>
        <input type="file" accept="image/*" onChange={onUpload} />
        <span className={styles.hint}>Assigns to the selected region. Additional maps (normal/rough/metal/AO) can be layered via re-upload in a future update.</span>
      </div>

      <input
        className={styles.search}
        placeholder="Search Polyhaven materials…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {ctx.polyhavenLoading ? (
        <div className={styles.loading}>Loading Polyhaven library…</div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((a) => (
            <div
              key={a.id}
              className={styles.card}
              onClick={() => applyPolyhaven(a)}
              title={a.name}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/json', JSON.stringify(a));
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <img src={a.thumbnail} alt={a.name} loading="lazy" />
              {applyingId === a.id && <span className={styles.badge}>…</span>}
              <div className={styles.name}>{a.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
