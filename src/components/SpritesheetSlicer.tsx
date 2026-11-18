'use client';

import React, { useRef, useCallback, useMemo } from 'react';
import { Maximize2, Grid } from 'lucide-react';
import { useEditorContext } from '@/contexts/EditorContext';
import { useAppDialog } from '@/components/AppDialogProvider';
import { computeSliceLayout, DEFAULT_SLICE_SETTINGS } from '@/lib/slicerGuides';
import { InteractiveSlicerModal } from '@/components/InteractiveSlicerModal';
import styles from './SpritesheetSlicer.module.css';

export function SpritesheetSlicer() {
  const ctx = useEditorContext();
  const { alert: showMessage } = useAppDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const slicer = ctx.pixelatorSlicer;
  const imgDimensions = slicer?.imgDimensions ?? null;
  const sliceSettings = slicer?.sliceSettings ?? DEFAULT_SLICE_SETTINGS;

  const layout = useMemo(() => {
    if (!imgDimensions) return null;
    return computeSliceLayout(imgDimensions.width, imgDimensions.height, sliceSettings);
  }, [imgDimensions, sliceSettings]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      slicer?.loadNewFile(droppedFile);
    } else {
      void showMessage({ title: 'Invalid spritesheet', message: 'Please upload a static PNG, WebP or JPEG image.' });
    }
  }, [slicer, showMessage]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      slicer?.loadNewFile(selectedFile);
    }
  }, [slicer]);

  if (!slicer) {
    return (
      <div className={styles.errorContainer}>
        <p>Slicer context not initialized.</p>
      </div>
    );
  }

  const {
    file,
    originalImgSrc,
    setSliceSettings,
    isSlicerModalOpen,
    setIsSlicerModalOpen,
    isSlicing,
    handleSliceSpritesheet,
    handleResetImage,
    savedSheets = [],
    editingSourceId = null,
    selectSavedSheet,
  } = slicer;

  const appendMode = slicer.appendToWorkspace === true;

  return (
    <div className={styles.container}>
      {appendMode && savedSheets.length > 0 && (
        <div className={styles.slicerBox} style={{ marginBottom: 12 }}>
          <label className={styles.inputLabel} htmlFor="saved-spritesheet-source">
            Saved Spritesheets in Project
          </label>
          <select
            id="saved-spritesheet-source"
            className={styles.inputControl}
            value={editingSourceId ?? ''}
            onChange={(event) => event.target.value
              ? selectSavedSheet?.(event.target.value)
              : handleResetImage()}
            disabled={isSlicing}
          >
            <option value="">Upload a new spritesheet</option>
            {savedSheets.map(source => (
              <option key={source.id} value={source.id}>{source.name}</option>
            ))}
          </select>
          <p className={styles.description} style={{ marginBottom: 0, marginTop: 6 }}>
            Select a saved sheet to adjust its guides or re-slice its frames non-destructively.
          </p>
        </div>
      )}

      {!file && (
        <div className={styles.uploaderBox}>
          <div className={styles.introHeader}>
            <h3 className={styles.title}>Import & Slice Spritesheet</h3>
            <p className={styles.description}>
              Drop a spritesheet image to open the Interactive Slicer Stage with draggable guides,
              padding/spacing controls, and optional Slice-as-Masks.
            </p>
          </div>
          <div
            className={styles.dropzone}
            onDragOver={handleDragOver}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Grid size={36} className={styles.uploadIcon} />
            <span className={styles.dropzoneText}>Drag and drop spritesheet image, or click to browse</span>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/png,image/webp,image/jpeg,image/bmp"
              className={styles.fileInput}
            />
          </div>
        </div>
      )}

      {file && imgDimensions && originalImgSrc && (
        <div className={styles.slicerBox}>
          <div className={styles.metaHeader}>
            <h4 className={styles.metaTitle} style={{ margin: 0 }}>{file.name}</h4>
            <button onClick={handleResetImage} className={styles.changeFileBtn}>
              Change File
            </button>
          </div>

          <div
            className={styles.imagePreviewWrapper}
            style={{ position: 'relative', cursor: 'pointer' }}
            onClick={() => setIsSlicerModalOpen(true)}
            title="Click to open Interactive Slicer Stage"
          >
            <img src={originalImgSrc} className={styles.imagePreview} alt="Spritesheet Preview" />
            {layout && (
              <svg
                viewBox={`0 0 ${imgDimensions.width} ${imgDimensions.height}`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
                preserveAspectRatio="xMidYMid meet"
              >
                {layout.rects.map(r => (
                  <rect
                    key={r.index}
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    fill="none"
                    stroke="rgba(56, 189, 248, 0.85)"
                    strokeWidth={Math.max(1, imgDimensions.width / 220)}
                  />
                ))}
              </svg>
            )}
          </div>

          <div className={styles.detailsList}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Sheet Size:</span>
              <span className={styles.detailVal}>{imgDimensions.width} × {imgDimensions.height} px</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Slices:</span>
              <span className={styles.detailVal}>
                {layout ? `${layout.cols} × ${layout.rows} (${layout.rects.length} frames)` : '—'}
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Offset / Spacing:</span>
              <span className={styles.detailVal}>
                {sliceSettings.offsetX},{sliceSettings.offsetY}px / {sliceSettings.spacingX},{sliceSettings.spacingY}px
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Slice as Masks:</span>
              <span className={styles.detailVal}>{sliceSettings.sliceAsMasks ? 'Enabled' : 'Standard Crop'}</span>
            </div>
          </div>

          <div className={styles.actionsRow}>
            <button
              type="button"
              onClick={() => setIsSlicerModalOpen(true)}
              className={styles.cancelBtn}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Maximize2 size={14} /> Edit Guides
            </button>
            <button
              type="button"
              onClick={() => handleSliceSpritesheet(sliceSettings)}
              className={styles.sliceBtn}
              disabled={isSlicing}
            >
              {isSlicing
                ? 'Slicing...'
                : editingSourceId
                  ? 'Re-slice Frames'
                  : 'Slice & Add Frames'}
            </button>
          </div>
        </div>
      )}

      {file && imgDimensions && originalImgSrc && (
        <InteractiveSlicerModal
          isOpen={isSlicerModalOpen}
          onClose={() => setIsSlicerModalOpen(false)}
          imageSrc={originalImgSrc}
          fileName={file.name}
          imgDimensions={imgDimensions}
          settings={sliceSettings}
          onSettingsChange={setSliceSettings}
          onApplySlice={(nextSettings) => {
            setSliceSettings(nextSettings);
            setIsSlicerModalOpen(false);
            void handleSliceSpritesheet(nextSettings);
          }}
          isSlicing={isSlicing}
          isReslicing={Boolean(editingSourceId)}
        />
      )}
    </div>
  );
}
