// src/components/TrimsheetExportPanel.tsx
'use client';

import React, { useState } from 'react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { MAP_CHANNELS } from '@/lib/trimsheetTypes';
import styles from './TrimsheetExportPanel.module.css';

export function TrimsheetExportPanel() {
  const ctx = useTrimsheetContext();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await ctx.exportZip();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div>
        <div className={styles.label}>Export Channels</div>
        <div className={styles.channels}>
          {MAP_CHANNELS.map((ch) => (
            <label key={ch} className={styles.channel}>
              <input
                type="checkbox"
                checked={ctx.enabledChannels.includes(ch)}
                onChange={() => ctx.toggleChannel(ch)}
              />
              <span style={{ textTransform: 'capitalize' }}>{ch}</span>
            </label>
          ))}
        </div>
      </div>

      <button className={styles.btn} onClick={handleExport} disabled={exporting || ctx.enabledChannels.length === 0}>
        {exporting ? 'Exporting…' : 'Export .zip'}
      </button>

      <div className={styles.note}>
        Exports {ctx.enabledChannels.length} PNG map(s) at {ctx.resolution}×{ctx.resolution} plus a region JSON,
        bundled as a single .zip. The JSON describes each region’s normalized rect, material, and tiling.
      </div>
    </div>
  );
}
