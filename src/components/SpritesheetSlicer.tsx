'use client';

import React, { useRef, useCallback } from 'react';
import { useEditorContext } from '@/contexts/EditorContext';
import styles from './SpritesheetSlicer.module.css';

export function SpritesheetSlicer() {
  const ctx = useEditorContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!ctx.pixelatorSlicer) {
    return (
      <div className={styles.errorContainer}>
        <p>Slicer context not initialized.</p>
      </div>
    );
  }

  const {
    file,
    originalImgSrc,
    imgDimensions,
    sliceType,
    cols,
    rows,
    cellWidth,
    cellHeight,
    isSlicing,
    setSliceType,
    setCols,
    setRows,
    setCellWidth,
    setCellHeight,
    handleSliceSpritesheet,
    loadNewFile,
    handleResetImage,
  } = ctx.pixelatorSlicer;

  const totalFramesCount = ctx.orderedFrames.length;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      loadNewFile(droppedFile);
    } else {
      alert('Please upload a valid image spritesheet.');
    }
  }, [loadNewFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      loadNewFile(selectedFile);
    }
  }, [loadNewFile]);

  return (
    <div className={styles.container}>
      {/* 1. File Upload Dragzone */}
      {!file && (
        <div className={styles.uploaderBox}>
          <div className={styles.introHeader}>
            <h3 className={styles.title}>Pixelate Any Spritesheet</h3>
            <p className={styles.description}>
              Upload your high-definition sheet, segment it into animation frames,
              apply vintage palette shading, dither gradients, and outlines, 
              then export back to a clean packed sheet. Runs 100% locally.
            </p>
          </div>
          <div 
            className={styles.dropzone}
            onDragOver={handleDragOver}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={styles.uploadIcon}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span className={styles.dropzoneText}>Drag and drop spritesheet image, or click to browse</span>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept="image/*" 
              className={styles.fileInput} 
            />
          </div>
        </div>
      )}

      {/* 2. Grid Slicer Controls */}
      {file && totalFramesCount === 0 && (
        <div className={styles.slicerBox}>
          <h3 className={styles.title}>Segment Your Spritesheet</h3>
          <p className={styles.description}>
            Configure how the sheet should be sliced into separate frames for pixelation editing.
          </p>

          {originalImgSrc && (
            <div className={styles.imagePreviewWrapper}>
              <img src={originalImgSrc} className={styles.imagePreview} alt="Original Preview" />
            </div>
          )}

          <div className={styles.sliceSettings}>
            <div className={styles.tabsRow}>
              <button 
                onClick={() => setSliceType('grid')}
                className={`${styles.tabBtn} ${sliceType === 'grid' ? styles.tabBtnActive : ''}`}
              >
                Grid Count (Cols/Rows)
              </button>
              <button 
                onClick={() => setSliceType('dimensions')}
                className={`${styles.tabBtn} ${sliceType === 'dimensions' ? styles.tabBtnActive : ''}`}
              >
                Dimensions (Width/Height px)
              </button>
            </div>

            {sliceType === 'grid' ? (
              <div className={styles.inputsRow}>
                <div className={styles.inputField}>
                  <label className={styles.inputLabel}>Columns</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="100" 
                    value={cols} 
                    onChange={e => setCols(Math.max(1, Number(e.target.value)))} 
                    className={styles.inputControl} 
                  />
                </div>
                <div className={styles.inputField}>
                  <label className={styles.inputLabel}>Rows</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="100" 
                    value={rows} 
                    onChange={e => setRows(Math.max(1, Number(e.target.value)))} 
                    className={styles.inputControl} 
                  />
                </div>
              </div>
            ) : (
              <div className={styles.inputsRow}>
                <div className={styles.inputField}>
                  <label className={styles.inputLabel}>Cell Width (px)</label>
                  <input 
                    type="number" 
                    min="4" 
                    value={cellWidth} 
                    onChange={e => setCellWidth(Math.max(4, Number(e.target.value)))} 
                    className={styles.inputControl} 
                  />
                </div>
                <div className={styles.inputField}>
                  <label className={styles.inputLabel}>Cell Height (px)</label>
                  <input 
                    type="number" 
                    min="4" 
                    value={cellHeight} 
                    onChange={e => setCellHeight(Math.max(4, Number(e.target.value)))} 
                    className={styles.inputControl} 
                  />
                </div>
              </div>
            )}
          </div>

          <div className={styles.actionsRow}>
            <button onClick={handleResetImage} className={styles.cancelBtn}>
              Upload Another
            </button>
            <button onClick={handleSliceSpritesheet} className={styles.sliceBtn} disabled={isSlicing}>
              {isSlicing ? (
                <div className={styles.loadingSpinner}>
                  <div className={styles.spinner} />
                  <span>Slicing grid...</span>
                </div>
              ) : 'Slice & Load Workspace'}
            </button>
          </div>
        </div>
      )}

      {/* 3. Loaded Metadata View */}
      {file && totalFramesCount > 0 && (
        <div className={styles.metaBox}>
          <div className={styles.metaHeader}>
            <h4 className={styles.metaTitle}>Source Spritesheet</h4>
            <button onClick={handleResetImage} className={styles.changeFileBtn}>
              Change File
            </button>
          </div>

          <div className={styles.detailsList}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Filename:</span>
              <span className={styles.detailVal}>{file.name}</span>
            </div>
            {imgDimensions && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Full Size:</span>
                <span className={styles.detailVal}>{imgDimensions.width} × {imgDimensions.height} px</span>
              </div>
            )}
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Total Slices:</span>
              <span className={styles.detailVal}>{totalFramesCount} frames</span>
            </div>
            {ctx.orderedFrames[0] && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Frame Size:</span>
                <span className={styles.detailVal}>{ctx.orderedFrames[0].bitmap.width} × {ctx.orderedFrames[0].bitmap.height} px</span>
              </div>
            )}
          </div>

          {originalImgSrc && (
            <div className={styles.miniSheetPreview}>
              <div className={styles.miniPreviewLabel}>Slices Grid Gridline</div>
              <div className={styles.miniImageWrapper}>
                <img src={originalImgSrc} className={styles.miniImg} alt="Source sheet miniature" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
