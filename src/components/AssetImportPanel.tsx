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

  return (
    <div className={styles.container}>
      <div role="tablist" aria-label="Asset import mode" className={styles.tabList}>
        <button type="button" role="tab" id="asset-import-media"
          aria-controls="asset-import-content" aria-selected={mode === 'media'}
          className={mode === 'media' ? styles.active : styles.tab}
          onClick={() => setMode('media')}>
          Video / GIF / Images
        </button>
        <button type="button" role="tab" id="asset-import-sheet"
          aria-controls="asset-import-content" aria-selected={mode === 'spritesheet'}
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
