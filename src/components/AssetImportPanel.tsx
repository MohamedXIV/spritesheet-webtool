'use client';

import React, { useState } from 'react';
import { useEditorContext } from '@/contexts/EditorContext';
import { MediaLoader } from '@/components/MediaLoader';
import { SpritesheetSlicer } from '@/components/SpritesheetSlicer';
import styles from './AssetImportPanel.module.css';

/** One import dock: separate modes, same window, no duplicated source state. */
export function AssetImportPanel() {
  const ctx = useEditorContext();
  const [mode, setMode] = useState<'media' | 'spritesheet'>('media');

  const handleTabKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' &&
        event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'media'
      : event.key === 'End' ? 'spritesheet'
      : mode === 'media' ? 'spritesheet' : 'media';
    setMode(next);
    const id = next === 'media' ? 'asset-import-media' : 'asset-import-sheet';
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  };

  return (
    <div className={styles.container}>
      <div role="tablist" aria-label="Asset import mode" className={styles.tabList} onKeyDown={handleTabKeys}>
        <button type="button" role="tab" id="asset-import-media"
          aria-controls="asset-import-content" aria-selected={mode === 'media'} tabIndex={mode === 'media' ? 0 : -1}
          className={mode === 'media' ? styles.active : styles.tab}
          onClick={() => setMode('media')}>
          Video / GIF / Images
        </button>
        <button type="button" role="tab" id="asset-import-sheet"
          aria-controls="asset-import-content" aria-selected={mode === 'spritesheet'} tabIndex={mode === 'spritesheet' ? 0 : -1}
          className={mode === 'spritesheet' ? styles.active : styles.tab}
          onClick={() => setMode('spritesheet')}>
          Slice Spritesheet
        </button>
      </div>
      <div id="asset-import-content" role="tabpanel"
        aria-labelledby={mode === 'media' ? 'asset-import-media' : 'asset-import-sheet'}
        className={styles.panel}>
        {mode === 'media'
          ? <MediaLoader
              onFilesSelected={ctx.handleMediaLoad}
              loadedSources={ctx.loadedSources}
              onRemoveSource={ctx.handleRemoveSource}
              disabled={ctx.editorState === 'extracting'}
            />
          : <SpritesheetSlicer />}
      </div>
      {ctx.editorState === 'extracting' && ctx.extractionProgress && (
        <div role="status" aria-live="polite" className={styles.progress}>
          Extracting frame {ctx.extractionProgress.current} of {ctx.extractionProgress.total}
          <progress max={100} value={ctx.extractionProgress.percentage} />
        </div>
      )}
    </div>
  );
}
