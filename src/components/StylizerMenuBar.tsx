'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, LayoutDashboard, ChevronDown, Check, RotateCcw, Save, Loader2 } from 'lucide-react';
import { useStylizerContext } from '@/contexts/StylizerContext';
import { ThemeToggle } from './ThemeToggle';
import styles from './StylizerMenuBar.module.css';

const VIEW_PANELS = [
  { id: 'material-loader', label: 'Material Maps' },
  { id: 'style',           label: 'Style Parameters' },
  { id: 'map-output',      label: 'Map Output' },
  { id: 'preview-2d',      label: '2D Preview' },
  { id: 'preview-3d',      label: '3D Preview Port' },
  { id: 'lighting',        label: 'Lighting & Shading' },
  { id: 'export',          label: 'Export Assets' },
];

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function StylizerMenuBar() {
  const {
    projectName,
    setProjectName,
    isSaving,
    autosaveNotification,
    triggerSave,
    visiblePanels,
    togglePanel,
    resetLayout,
    resetMaterial,
  } = useStylizerContext();

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(projectName);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
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

  return (
    <div className={styles.menubar}>
      {/* Left: Back + Badge + Brand + View Menu */}
      <div className={styles.leftSection}>
        <Link href="/" className={styles.backButton} title="Return to Hub">
          <ArrowLeft size={16} />
        </Link>

        <div className={styles.brand}>
          <span className={styles.badge}>PBR</span>
          <span className={styles.brandText}>Material Stylizer</span>
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

      {/* Center: Project name editing */}
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
            title="Double-click to rename"
          >
            {projectName}
          </h2>
        )}
      </div>

      {/* Right: Actions */}
      <div className={styles.rightSection}>
        {autosaveNotification && (
          <div className={styles.autosaveBadge}>
            <CheckIcon size={11} />
            {autosaveNotification}
          </div>
        )}

        <button
          className={styles.toolbarButton}
          onClick={resetMaterial}
          title="Clear all material maps and reset"
        >
          <span>New Material</span>
        </button>

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
        
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
