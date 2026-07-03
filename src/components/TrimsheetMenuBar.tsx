// src/components/TrimsheetMenuBar.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, LayoutDashboard, ChevronDown, Check, RotateCcw, Save, Download } from 'lucide-react';
import { useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { ThemeToggle } from './ThemeToggle';
import styles from './TrimsheetMenuBar.module.css';

const VIEW_PANELS = [
  { id: 'canvas',    label: 'Trimsheet Canvas' },
  { id: 'regions',   label: 'Regions' },
  { id: 'inspector', label: 'Region Inspector' },
  { id: 'materials', label: 'Materials' },
  { id: 'export',    label: 'Export' },
] as const;

export function TrimsheetMenuBar() {
  const ctx = useTrimsheetContext();
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(ctx.projectName);
  const viewMenuRef = useRef<HTMLDivElement>(null);

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
    setTempName(ctx.projectName);
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (tempName.trim()) ctx.setProjectName(tempName.trim());
    setIsEditingName(false);
  };

  const handleSaveAs = () => {
    const name = prompt('Save trimsheet as:', ctx.projectName);
    if (name && name.trim()) ctx.triggerSaveAs(name.trim());
  };

  return (
    <div className={styles.menubar}>

      {/* Left: back + brand + divider + view menu */}
      <div className={styles.leftSection}>
        <Link href="/" className={styles.backButton} title="Return to Hub">
          <ArrowLeft size={16} />
        </Link>

        <div className={styles.brand}>
          <span className={styles.badge}>UV</span>
          <span className={styles.brandText}>Trimsheet Builder</span>
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
            <ChevronDown
              size={10}
              strokeWidth={2.5}
              style={{ transform: viewMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            />
          </button>

          {viewMenuOpen && (
            <div className={styles.viewMenu}>
              <div className={styles.viewMenuSection}>PANELS</div>
              {VIEW_PANELS.map(({ id, label }) => {
                const active = ctx.visiblePanels.has(id);
                return (
                  <button
                    key={id}
                    className={styles.viewMenuItem}
                    onClick={() => ctx.togglePanel(id)}
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
                onClick={() => { ctx.resetLayout(); setViewMenuOpen(false); }}
              >
                <RotateCcw size={11} />
                Reset Layout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Centre: project name (double-click to rename) */}
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
            {ctx.projectName}
            {ctx.isDirty && <span className={styles.dirtyDot} title="Unsaved changes" />}
          </h2>
        )}
      </div>

      {/* Right: save buttons + theme toggle */}
      <div className={styles.rightSection}>
        <button
          className={`${styles.toolbarButton} ${styles.saveButton}`}
          onClick={() => ctx.triggerSave()}
          title="Save Project (Ctrl+S)"
        >
          <Save size={14} />
          <span>Save</span>
        </button>

        <button
          className={styles.toolbarButton}
          onClick={handleSaveAs}
          title="Save As a new copy"
        >
          <Download size={14} />
          <span>Save As</span>
        </button>

        <div className={styles.divider} />

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
