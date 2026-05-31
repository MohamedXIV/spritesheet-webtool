'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Home, Undo2, Redo2, Save, FolderOpen, Loader2, ArrowLeft, LayoutDashboard, ChevronDown, Check, RotateCcw } from 'lucide-react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import styles from './ThreePainterMenuBar.module.css';

// Panel definitions shown in the View menu
const VIEW_PANELS = [
  { id: '3d-preview',     label: '3D Viewport' },
  { id: 'brush-panel',    label: 'Brush Options' },
  { id: 'layers-panel',   label: 'Layers' },
  { id: 'lighting-panel', label: 'Lighting & Shading' },
  { id: 'texture-maps',   label: 'Texture Maps' },
  { id: 'pixelate-panel', label: 'Pixelation' },
  { id: 'export-panel',   label: 'Export' },
  { id: 'ai-generation',  label: 'AI Generator' },
];

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function ThreePainterMenuBar() {
  const {
    projectName, setProjectName,
    isSaving, autosaveNotification,
    undo, redo, canUndo, canRedo,
    isDirty, triggerSave,
    loadNewModel,
    visiblePanels, togglePanel, resetLayout,
  } = useThreePainterContext();

  const [isEditingName,   setIsEditingName]   = useState(false);
  const [tempName,        setTempName]        = useState(projectName);
  const [viewMenuOpen,    setViewMenuOpen]    = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);

  // Close view menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleStartEditing = () => {
    setTempName(projectName);
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (tempName.trim()) setProjectName(tempName.trim());
    setIsEditingName(false);
  };

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) loadNewModel(e.target.files[0]);
  };

  return (
    <div className={styles.menubar}>

      {/* Left: back + brand + View menu */}
      <div className={styles.leftSection}>
        <Link href="/" className={styles.backButton} title="Return to Hub">
          <ArrowLeft size={16} />
        </Link>

        <div className={styles.brand}>
          <span className={styles.badge}>3D</span>
          <span className={styles.brandText}>Pixel-Painter</span>
        </div>

        <div className={styles.dividerV} />

        {/* View menu */}
        <div className={styles.viewMenuWrap} ref={viewMenuRef}>
          <button
            className={`${styles.menuTrigger} ${viewMenuOpen ? styles.menuTriggerOpen : ''}`}
            onClick={() => setViewMenuOpen(!viewMenuOpen)}
            title="Toggle panels and reset layout"
          >
            <LayoutDashboard size={13} />
            <span>View</span>
            <ChevronDown size={10} strokeWidth={2.5}
              style={{ transform: viewMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            />
          </button>

          {viewMenuOpen && (
            <div className={styles.viewMenu}>
              <div className={styles.viewMenuSection}>PANELS</div>
              {VIEW_PANELS.map(({ id, label }) => {
                const active = visiblePanels.has(id);
                return (
                  <button
                    key={id}
                    className={styles.viewMenuItem}
                    onClick={() => togglePanel(id)}
                  >
                    <span className={styles.viewMenuCheck}>
                      {active && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className={active ? styles.viewMenuLabelOn : styles.viewMenuLabelOff}>
                      {label}
                    </span>
                  </button>
                );
              })}
              <div className={styles.viewMenuDivider} />
              <button
                className={styles.viewMenuReset}
                onClick={() => { resetLayout(); setViewMenuOpen(false); }}
              >
                <RotateCcw size={11} />
                Reset Layout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Centre: project name */}
      <div className={styles.middleSection}>
        {isEditingName ? (
          <div className={styles.projectNameInputWrapper}>
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  handleSaveName();
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
            title="Double-click to rename"
          >
            {projectName}
            {isDirty && <span className={styles.dirtyDot} title="Unsaved changes" />}
          </h2>
        )}
      </div>

      {/* Right: actions */}
      <div className={styles.rightSection}>
        {autosaveNotification && (
          <div className={styles.autosaveBadge}>
            <CheckIcon size={11} />
            {autosaveNotification}
          </div>
        )}

        <label className={styles.toolbarButton} title="Load 3D Model">
          <FolderOpen size={15} />
          <span>Load Mesh</span>
          <input type="file" accept=".gltf,.glb,.obj,.fbx" onChange={handleModelUpload} style={{ display: 'none' }} />
        </label>

        <button
          className={`${styles.toolbarButton} ${styles.saveButton}`}
          onClick={() => triggerSave()}
          disabled={isSaving}
          title="Save Project (Ctrl+S)"
        >
          {isSaving ? <Loader2 size={15} className={styles.spinner} /> : <Save size={15} />}
          <span>{isSaving ? 'Saving…' : 'Save'}</span>
        </button>

        <div className={styles.divider} />

        <button className={styles.iconButton} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button className={styles.iconButton} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
          <Redo2 size={16} />
        </button>
      </div>
    </div>
  );
}
