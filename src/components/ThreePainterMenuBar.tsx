'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Home, Undo2, Redo2, Save, FolderOpen, Loader2, ArrowLeft } from 'lucide-react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import styles from './ThreePainterMenuBar.module.css';

export function ThreePainterMenuBar() {
  const {
    projectName,
    setProjectName,
    isSaving,
    autosaveNotification,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    triggerSave,
    triggerSaveAs,
    loadNewModel,
  } = useThreePainterContext();

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(projectName);

  const handleStartEditing = () => {
    setTempName(projectName);
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (tempName.trim()) {
      setProjectName(tempName.trim());
    }
    setIsEditingName(false);
  };

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadNewModel(e.target.files[0]);
    }
  };

  return (
    <div className={styles.menubar}>
      {/* 1. Brand portal and back link */}
      <div className={styles.leftSection}>
        <Link href="/" className={styles.backButton} title="Return to Hub Dashboard">
          <ArrowLeft size={16} />
        </Link>
        <div className={styles.brand}>
          <span className={styles.badge}>3D</span>
          <span className={styles.brandText}>Pixel-Painter</span>
        </div>
      </div>

      {/* 2. Active Project details with double click editing */}
      <div className={styles.middleSection}>
        {isEditingName ? (
          <div className={styles.projectNameInputWrapper}>
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              className={styles.projectNameInput}
              autoFocus
              onBlur={handleSaveName}
            />
          </div>
        ) : (
          <h2 
            className={styles.projectName} 
            onDoubleClick={handleStartEditing}
            title="Double click to rename project"
          >
            {projectName}
            {isDirty && <span className={styles.dirtyDot} title="Unsaved changes" />}
          </h2>
        )}
      </div>

      {/* 3. Action toolbar (Save, Undo, Redo, Load Model) */}
      <div className={styles.rightSection}>
        {/* Autosave status notification bubble */}
        {autosaveNotification && (
          <div className={styles.autosaveBadge}>
            <CheckIcon size={11} />
            {autosaveNotification}
          </div>
        )}

        {/* Load Model file button */}
        <label className={styles.toolbarButton} title="Load another 3D Model">
          <FolderOpen size={15} />
          <span>Load Mesh</span>
          <input
            type="file"
            accept=".gltf,.glb,.obj,.fbx"
            onChange={handleModelUpload}
            style={{ display: 'none' }}
          />
        </label>

        {/* Save button */}
        <button
          className={`${styles.toolbarButton} ${styles.saveButton}`}
          onClick={() => triggerSave()}
          disabled={isSaving}
          title="Save Project (Ctrl+S)"
        >
          {isSaving ? <Loader2 size={15} className={styles.spinner} /> : <Save size={15} />}
          <span>{isSaving ? 'Saving...' : 'Save'}</span>
        </button>

        <div className={styles.divider} />

        {/* Undo & Redo stack actions */}
        <button
          className={styles.iconButton}
          onClick={undo}
          disabled={!canUndo}
          title="Undo stroke (Ctrl+Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          className={styles.iconButton}
          onClick={redo}
          disabled={!canRedo}
          title="Redo stroke (Ctrl+Y or Ctrl+Shift+Z)"
        >
          <Redo2 size={16} />
        </button>
      </div>
    </div>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
