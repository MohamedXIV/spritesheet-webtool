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
  const importingMedia = ctx.editorState === 'extracting';
  const slicingSheet = ctx.pixelatorSlicer?.isSlicing === true;
  const busy = importingMedia || slicingSheet;
  const progress = ctx.extractionProgress;
  const hasFrameEstimate = importingMedia && !!progress && progress.total > 0;
  const percent = hasFrameEstimate
    ? Math.max(0, Math.min(100, Math.round(progress.percentage)))
    : null;
  const progressTitle = slicingSheet ? 'Slicing spritesheet…'
    : hasFrameEstimate
      ? percent === 100 ? 'Finishing imported frames…' : 'Importing frames…'
      : 'Preparing media…';


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
      {busy && (
        <div className={styles.progressCard} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div className={styles.progressBody}>
            <div className={styles.progressTitle}>{progressTitle}</div>
            <progress
              className={styles.progressBar}
              max={100}
              value={percent ?? undefined}
              aria-label={slicingSheet ? 'Spritesheet slicing' : 'Media import'}
            />
            <span className={styles.progressDetail} aria-live="off">
              {hasFrameEstimate
                ? `${progress!.current.toLocaleString()} / ${progress!.total.toLocaleString()} frames · ${percent}%`
                : slicingSheet
                  ? 'Preparing extracted frames and layers'
                  : 'Reading files and calculating frame counts'}
            </span>
          </div>
        </div>
      )}
      <div id="asset-import-content" role="tabpanel" aria-busy={busy}
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

    </div>
  );
}
